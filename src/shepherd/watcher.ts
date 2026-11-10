import { diffLines } from "diff";
import { readdir, readFile, stat } from "fs/promises";
import { join, relative, resolve } from "path";
import { minimatch } from "minimatch";
import { getLogger } from "../utils/logger.js";

const logger = getLogger();

/**
 * Validate that a path is within the base directory to prevent path traversal attacks.
 * Returns true if the child path is contained within the parent directory.
 */
function isPathWithinDirectory(parentDir: string, childPath: string): boolean {
  const resolvedParent = resolve(parentDir);
  const resolvedChild = resolve(childPath);
  const relativePath = relative(resolvedParent, resolvedChild);

  // If the path starts with '..', it's trying to escape the parent directory
  // Empty string or '.' means same directory, which is valid
  return !relativePath.startsWith("..");
}

export interface FileSnapshot {
  filePath: string;
  content: string;
  mtime: number;
}

export interface FileChange {
  filePath: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNumber?: number;
}

export interface WatcherOptions {
  pollInterval: number;
  ignored?: string[];
  maxFiles?: number; // Maximum files to scan (default: 10000)
  maxDepth?: number; // Maximum directory depth (default: 20)
  scanTimeout?: number; // Maximum time for one scan in ms (default: 30000)
}

export interface WatcherEvents {
  onChange: (changes: FileChange[]) => void;
  onError?: (error: Error, filePath?: string) => void;
}

export class FileWatcher {
  private snapshots = new Map<string, FileSnapshot>();
  private timer?: ReturnType<typeof setInterval>;
  private options: WatcherOptions;
  private events: WatcherEvents;
  private isRunning = false;

  constructor(
    private directory: string,
    events: WatcherEvents,
    options: Partial<WatcherOptions> = {}
  ) {
    this.events = events;
    this.options = {
      pollInterval: options.pollInterval ?? 15000,
      ignored: options.ignored ?? [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/build/**",
        "**/*.log",
      ],
      maxFiles: options.maxFiles ?? 10000,
      maxDepth: options.maxDepth ?? 20,
      scanTimeout: options.scanTimeout ?? 30000,
    };
  }

  start(): void {
    if (this.isRunning) {
      logger.warn("Watcher already running");
      return;
    }

    this.isRunning = true;
    logger.info(`Starting watcher for directory: ${this.directory}`);

    // Take initial snapshot
    this.takeSnapshot().catch((err) => {
      logger.error("Initial snapshot failed", { error: err.message });
    });

    // Start polling
    this.timer = setInterval(() => {
      this.poll().catch((err) => {
        logger.error("Poll error", { error: err.message });
      });
    }, this.options.pollInterval);
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info("Stopping watcher");

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Save the old snapshot before taking a new one
      const oldSnapshot = new Map(this.snapshots);
      const newSnapshot = await this.takeSnapshot();
      const changes = this.calculateChanges(oldSnapshot, newSnapshot);

      if (changes.length > 0) {
        logger.info(`Detected ${changes.length} file change(s)`);
        this.events.onChange(changes);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Poll failed", { error: error.message });
      this.events.onError?.(error);
    }
  }

  private async takeSnapshot(): Promise<Map<string, FileSnapshot>> {
    const snapshots = new Map<string, FileSnapshot>();
    let filesScanned = 0;
    let filesSkipped = 0;
    let filesErrored = 0;

    // Create a timeout for the entire snapshot operation
    const timeoutMs = this.options.scanTimeout ?? 30000;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      logger.warn(`Snapshot operation timed out after ${timeoutMs}ms`);
    }, timeoutMs);

    try {
      const files = await this.getAllFiles(this.directory, this.directory, 0, timeout);

      if (timedOut) {
        // If timeout was triggered, return partial snapshot
        logger.warn("Returning partial snapshot due to timeout");
        return snapshots;
      }

      clearTimeout(timeout);
      filesScanned = files.length;

      for (const filePath of files) {
        if (this.shouldIgnore(filePath)) {
          filesSkipped++;
          continue;
        }

        try {
          const content = await readFile(filePath, "utf-8");
          const stats = await stat(filePath);

          snapshots.set(filePath, {
            filePath,
            content,
            mtime: stats.mtimeMs,
          });
        } catch (fileErr) {
          filesErrored++;
          const error = fileErr instanceof Error ? fileErr : new Error(String(fileErr));
          logger.warn(`Failed to read file: ${filePath}`, {
            error: error.message,
            code: (error as any).code,
          });
          this.events.onError?.(error, filePath);
          // Continue processing other files
          continue;
        }
      }

      this.snapshots = snapshots;

      logger.debug("Snapshot complete", {
        filesScanned,
        filesSkipped,
        filesErrored,
        totalSnapshots: snapshots.size,
      });

      return snapshots;
    } catch (err) {
      clearTimeout(timeout);
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Snapshot failed", { error: error.message });
      throw error;
    }
  }

  private async getAllFiles(
    dir: string,
    baseDir: string = dir,
    currentDepth: number = 0,
    timeout: NodeJS.Timeout | null = null
  ): Promise<string[]> {
    // Validate that the directory is within the base directory to prevent path traversal
    if (!isPathWithinDirectory(baseDir, dir)) {
      logger.error(`Path traversal attempt detected: ${dir} is outside base directory: ${baseDir}`);
      return [];
    }

    // Check depth limit
    if (currentDepth > (this.options.maxDepth ?? 20)) {
      return [];
    }

    const files: string[] = [];
    const startTime = Date.now();
    const maxFiles = this.options.maxFiles ?? 10000;

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Check timeout
        if (timeout && Date.now() - startTime > (this.options.scanTimeout ?? 30000)) {
          logger.warn(`File scan timeout reached in directory: ${dir}`);
          break;
        }

        // Check file count limit
        if (files.length >= maxFiles) {
          logger.warn(`Maximum file count (${maxFiles}) reached, stopping scan`);
          break;
        }

        const fullPath = join(dir, entry.name);

        // Validate each path to prevent traversal
        if (!isPathWithinDirectory(baseDir, fullPath)) {
          logger.warn(`Skipping path outside base directory: ${fullPath}`);
          continue;
        }

        if (entry.isDirectory()) {
          try {
            const subFiles = await this.getAllFiles(fullPath, baseDir, currentDepth + 1, timeout);
            files.push(...subFiles.slice(0, maxFiles - files.length));
          } catch (dirErr) {
            // Log directory access error but continue
            logger.warn(`Cannot access directory: ${fullPath}`, {
              error: String(dirErr),
            });
            continue;
          }
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (dirErr) {
      logger.warn(`Cannot read directory: ${dir}`, {
        error: String(dirErr),
      });
    }

    return files;
  }

  private shouldIgnore(filePath: string): boolean {
    const relativePath = relative(this.directory, filePath);

    for (const pattern of this.options.ignored ?? []) {
      if (minimatch(relativePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  private calculateChanges(
    oldSnapshots: Map<string, FileSnapshot>,
    newSnapshots: Map<string, FileSnapshot>
  ): FileChange[] {
    const changes: FileChange[] = [];

    // Check for modified files
    for (const [filePath, newSnapshot] of newSnapshots) {
      const oldSnapshot = oldSnapshots.get(filePath);

      if (!oldSnapshot) {
        // New file - treat entire content as added
        changes.push({
          filePath,
          additions: newSnapshot.content.split("\n").length,
          deletions: 0,
          hunks: [
            {
              oldStart: 0,
              oldLines: 0,
              newStart: 1,
              newLines: newSnapshot.content.split("\n").length,
              lines: newSnapshot.content.split("\n").map((line) => ({
                type: "added" as const,
                content: line,
              })),
            },
          ],
        });
      } else if (newSnapshot.mtime !== oldSnapshot.mtime) {
        // File was modified
        try {
          const hunks = this.computeDiff(oldSnapshot.content, newSnapshot.content);
          const additions = hunks.reduce(
            (sum, h) => sum + h.lines.filter((l) => l.type === "added").length,
            0
          );
          const deletions = hunks.reduce(
            (sum, h) => sum + h.lines.filter((l) => l.type === "removed").length,
            0
          );

          if (additions > 0 || deletions > 0) {
            changes.push({
              filePath,
              additions,
              deletions,
              hunks,
            });
          }
        } catch (diffErr) {
          logger.warn(`Failed to compute diff for: ${filePath}`, {
            error: String(diffErr),
          });
          // Continue with other files
          continue;
        }
      }
    }

    // Check for deleted files (not included in changes for now)

    return changes;
  }

  private computeDiff(oldContent: string, newContent: string): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const diff = diffLines(oldContent, newContent);

    let currentHunk: DiffHunk | null = null;
    let oldLineNumber = 1;
    let newLineNumber = 1;

    for (const change of diff) {
      const line = change.value.trimEnd();

      if (change.added) {
        if (!currentHunk) {
          currentHunk = {
            oldStart: oldLineNumber - 1,
            oldLines: 0,
            newStart: newLineNumber,
            newLines: 0,
            lines: [],
          };
        }
        currentHunk.lines.push({
          type: "added",
          content: line,
          lineNumber: newLineNumber,
        });
        currentHunk.newLines++;
        newLineNumber++;
      } else if (change.removed) {
        if (!currentHunk) {
          currentHunk = {
            oldStart: oldLineNumber,
            oldLines: 0,
            newStart: newLineNumber - 1,
            newLines: 0,
            lines: [],
          };
        }
        currentHunk.lines.push({
          type: "removed",
          content: line,
          lineNumber: oldLineNumber,
        });
        currentHunk.oldLines++;
        oldLineNumber++;
      } else {
        if (currentHunk) {
          hunks.push(currentHunk);
          currentHunk = null;
        }
        oldLineNumber++;
        newLineNumber++;
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return hunks;
  }
}
