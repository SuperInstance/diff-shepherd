import type { FileChange } from "./watcher.js";
import { stat } from "fs/promises";
import { getLogger } from "../utils/logger.js";
import type { ActiveFileContext } from "../utils/active-file-tracker.js";
import { isActiveFile } from "../utils/active-file-tracker.js";

const logger = getLogger();

export type ViewMode = "summary" | "diff";

// Extended FileChange with timestamp for integrity checking
export interface TrackedChange extends FileChange {
  detectedAt: number; // When the change was detected
  currentMtime: number; // File mtime when change was detected
}

export interface AcceptResult {
  success: boolean;
  filePath: string;
  reason?: string;
}

// User context for tracking active file
export interface UserContext {
  activeFilePath: string | null;
  activePane: string | null;
  activeDirectory: string | null;
  timestamp: number;
}

export class ShepherdState {
  private pendingChanges = new Map<string, TrackedChange>();
  private selectedFileIndex = 0;
  private currentView: ViewMode = "summary";
  private listeners = new Set<() => void>();
  private integrityCheck = true; // Can be toggled via config
  private userContext: UserContext = {
    activeFilePath: null,
    activePane: null,
    activeDirectory: null,
    timestamp: Date.now(),
  };

  constructor(options?: { integrityCheck?: boolean }) {
    this.integrityCheck = options?.integrityCheck ?? true;
  }

  // Add a listener for state changes
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Notify all listeners of state change
  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  // Get user context
  getUserContext(): UserContext {
    return this.userContext;
  }

  // Update user context
  updateUserContext(context: ActiveFileContext): void {
    this.userContext = {
      activeFilePath: context.activeFilePath,
      activePane: context.activePane,
      activeDirectory: context.activeDirectory,
      timestamp: context.timestamp,
    };
    this.notify();
  }

  // Check if a file is the active file
  isFileActive(filePath: string): boolean {
    return isActiveFile(filePath, this.userContext);
  }

  // Get changes affecting the active file
  getActiveFileChanges(): FileChange[] {
    const changes = this.getChanges();
    return changes.filter((change) => this.isFileActive(change.filePath));
  }

  // Get all pending changes
  getChanges(): FileChange[] {
    return Array.from(this.pendingChanges.values());
  }

  // Get a specific file change by path
  getChange(filePath: string): FileChange | undefined {
    return this.pendingChanges.get(filePath);
  }

  // Get the currently selected file
  getSelectedFile(): FileChange | undefined {
    const changes = this.getChanges();
    if (this.selectedFileIndex >= 0 && this.selectedFileIndex < changes.length) {
      return changes[this.selectedFileIndex];
    }
    return undefined;
  }

  // Get the index of the currently selected file
  getSelectedFileIndex(): number {
    return this.selectedFileIndex;
  }

  // Get the current view mode
  getViewMode(): ViewMode {
    return this.currentView;
  }

  // Add new changes (called by watcher)
  addChanges(changes: FileChange[]): void {
    const now = Date.now();

    for (const change of changes) {
      // Get current file mtime for integrity checking
      stat(change.filePath)
        .then((stats) => {
          this.pendingChanges.set(change.filePath, {
            ...change,
            detectedAt: now,
            currentMtime: stats.mtimeMs,
          });
          this.notify();
        })
        .catch(() => {
          // File might not exist, but still track the change
          this.pendingChanges.set(change.filePath, {
            ...change,
            detectedAt: now,
            currentMtime: 0,
          });
          this.notify();
        });
    }
  }

  // Check if a file has been modified since the diff was calculated
  private async verifyFileIntegrity(filePath: string): Promise<{ valid: boolean; reason?: string }> {
    const tracked = this.pendingChanges.get(filePath);
    if (!tracked) {
      return { valid: false, reason: "Change not found in pending changes" };
    }

    if (!this.integrityCheck) {
      return { valid: true };
    }

    try {
      const stats = await stat(filePath);
      const currentMtime = stats.mtimeMs;

      // Check if file was modified after the change was detected
      if (currentMtime !== tracked.currentMtime) {
        return {
          valid: false,
          reason: `File was modified after diff was calculated (was: ${new Date(tracked.currentMtime).toISOString()}, now: ${new Date(currentMtime).toISOString()})`,
        };
      }

      return { valid: true };
    } catch {
      return { valid: false, reason: "File no longer exists or cannot be accessed" };
    }
  }

  // Accept all changes in a specific file
  async acceptAllInFile(filePath: string): Promise<AcceptResult> {
    // Verify integrity if enabled
    if (this.integrityCheck) {
      const { valid, reason } = await this.verifyFileIntegrity(filePath);
      if (!valid) {
        logger.warn(`Integrity check failed for: ${filePath}`, { reason });
        return {
          success: false,
          filePath,
          reason,
        };
      }
    }

    this.pendingChanges.delete(filePath);

    // Adjust selected index if needed
    const changes = this.getChanges();
    if (this.selectedFileIndex >= changes.length) {
      this.selectedFileIndex = Math.max(0, changes.length - 1);
    }

    // If we're in diff view and the file was accepted, go back to summary
    if (this.currentView === "diff" && changes.length === 0) {
      this.currentView = "summary";
    }

    this.notify();

    return { success: true, filePath };
  }

  // Accept all pending changes (smart: prioritize active file)
  async acceptAllSmart(): Promise<{ accepted: string[]; failed: Array<{ filePath: string; reason?: string }> }> {
    const changes = this.getChanges();
    const activeChanges = this.getActiveFileChanges();
    const otherChanges = changes.filter((c) => !this.isFileActive(c.filePath));

    const accepted: string[] = [];
    const failed: Array<{ filePath: string; reason?: string }> = [];

    // First, accept active file changes
    for (const change of activeChanges) {
      const result = await this.acceptAllInFile(change.filePath);
      if (result.success) {
        accepted.push(change.filePath);
      } else {
        failed.push({ filePath: change.filePath, reason: result.reason });
      }
    }

    // Then, accept other changes
    for (const change of otherChanges) {
      const result = await this.acceptAllInFile(change.filePath);
      if (result.success) {
        accepted.push(change.filePath);
      } else {
        failed.push({ filePath: change.filePath, reason: result.reason });
      }
    }

    logger.info(`Smart accept: ${accepted.length} accepted, ${failed.length} failed`);

    return { accepted, failed };
  }

  // Accept all pending changes (original method for backward compatibility)
  acceptAll(): void {
    this.pendingChanges.clear();
    this.selectedFileIndex = 0;
    this.currentView = "summary";
    this.notify();
  }

  // Select a file by index (for keyboard navigation)
  selectFileByIndex(index: number): void {
    const changes = this.getChanges();
    if (index >= 0 && index < changes.length) {
      this.selectedFileIndex = index;
    }
  }

  // Select the next file
  selectNextFile(): void {
    const changes = this.getChanges();
    if (this.selectedFileIndex < changes.length - 1) {
      this.selectedFileIndex++;
    }
  }

  // Select the previous file
  selectPreviousFile(): void {
    if (this.selectedFileIndex > 0) {
      this.selectedFileIndex--;
    }
  }

  // Enter diff view for the selected file
  enterDiffView(): void {
    if (this.getSelectedFile()) {
      this.currentView = "diff";
      this.notify();
    }
  }

  // Return to summary view
  exitToSummary(): void {
    this.currentView = "summary";
    this.notify();
  }

  // Get summary statistics
  getSummary(): { fileCount: number; additions: number; deletions: number; activeFileCount: number } {
    const changes = this.getChanges();
    const additions = changes.reduce((sum, c) => sum + c.additions, 0);
    const deletions = changes.reduce((sum, c) => sum + c.deletions, 0);
    const activeFileCount = this.getActiveFileChanges().length;

    return {
      fileCount: changes.length,
      additions,
      deletions,
      activeFileCount,
    };
  }

  // Check if a file has integrity issues
  async checkFileIntegrity(filePath: string): Promise<{ valid: boolean; reason?: string }> {
    return this.verifyFileIntegrity(filePath);
  }

  // Set integrity checking on/off
  setIntegrityCheck(enabled: boolean): void {
    this.integrityCheck = enabled;
    logger.info(`Integrity checking ${enabled ? "enabled" : "disabled"}`);
  }

  // Get integrity check status
  isIntegrityCheckEnabled(): boolean {
    return this.integrityCheck;
  }

  // Reject (remove) a specific file's changes and move to next file
  rejectFile(filePath: string): void {
    const index = Array.from(this.pendingChanges.keys()).indexOf(filePath);
    this.pendingChanges.delete(filePath);

    // Move to next file, or stay at same position if at end
    const changes = this.getChanges();
    if (this.selectedFileIndex >= changes.length) {
      this.selectedFileIndex = Math.max(0, changes.length - 1);
    } else if (index >= 0 && index <= this.selectedFileIndex && this.selectedFileIndex > 0) {
      // If we rejected a file before or at the current position, stay at same index
      this.selectedFileIndex = Math.max(0, this.selectedFileIndex - 1);
    }

    // If we're in diff view and the file was rejected, go back to summary
    if (this.currentView === "diff" && changes.length === 0) {
      this.currentView = "summary";
    }

    logger.info(`Rejected changes for: ${filePath}`);
    this.notify();
  }

  // Reject the currently selected file and move to next
  rejectSelectedFile(): void {
    const selectedFile = this.getSelectedFile();
    if (selectedFile) {
      this.rejectFile(selectedFile.filePath);
      // Move to next file after rejection
      const changes = this.getChanges();
      if (this.selectedFileIndex < changes.length) {
        // Already moved due to rejection logic, ensure we're on next file
        this.selectNextFile();
      }
    }
  }

  // Reject all pending changes (clear everything)
  rejectAll(): void {
    const count = this.pendingChanges.size;
    this.pendingChanges.clear();
    this.selectedFileIndex = 0;
    this.currentView = "summary";
    logger.info(`Rejected all ${count} pending changes`);
    this.notify();
  }
}
