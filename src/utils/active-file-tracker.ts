import { spawn } from "child_process";
import { getLogger } from "./logger.js";

const logger = getLogger();

export interface ActiveFileContext {
  activeFilePath: string | null;
  activePane: string | null;
  activeDirectory: string | null;
  timestamp: number;
}

// Manual focus file set by user
let manualFocusFile: string | null = null;

export function setManualFocusFile(filePath: string | null): void {
  manualFocusFile = filePath;
  if (filePath) {
    logger.info(`Manual focus file set: ${filePath}`);
  } else {
    logger.info("Manual focus file cleared");
  }
}

export function getManualFocusFile(): string | null {
  return manualFocusFile;
}

export function clearManualFocusFile(): void {
  manualFocusFile = null;
}

// Helper function for async tmux commands with timeout
async function execTmux(args: string[], timeout = 1000): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn("tmux", args);
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill();
      resolve(null);
    }, timeout);

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout) {
        resolve(stdout.trim());
      } else {
        resolve(null);
      }
    });

    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

// Get the current tmux pane ID (the pane where the user is working)
export async function getCurrentPaneId(): Promise<string | null> {
  // First check environment variable (fastest)
  const tmuxPane = process.env.TMUX_PANE;
  if (tmuxPane) {
    return tmuxPane;
  }

  // Try to get the active pane from tmux (async, non-blocking)
  return await execTmux(["display-message", "-p", "#{pane_id}"]);
}

// Get all panes in the current session to find the "main" pane
// (the one that's not the shepherd pane)
export async function getMainPaneId(shepherdPaneId?: string): Promise<string | null> {
  const result = await execTmux(["list-panes", "-F", "#{pane_id} #{pane_active}"]);

  if (!result) {
    return null;
  }

  const lines = result.trim().split("\n");
  for (const line of lines) {
    const [paneId, isActive] = line.split(" ");
    // Skip the shepherd pane and return the active pane
    if (paneId && paneId !== shepherdPaneId) {
      if (isActive === "1") {
        return paneId;
      }
    }
  }

  // If no active pane found, return the first non-shepherd pane
  for (const line of lines) {
    const [paneId] = line.split(" ");
    if (paneId && paneId !== shepherdPaneId) {
      return paneId;
    }
  }

  return null;
}

// Get the current working directory of a pane
export async function getPaneWorkingDirectory(paneId: string): Promise<string | null> {
  const result = await execTmux([
    "display-message",
    "-p",
    "-t",
    paneId,
    "#{pane_current_path}",
  ]);

  if (result && result !== "~") {
    return result;
  }

  return null;
}

// Get the current command/title of a pane
export async function getPaneTitle(paneId: string): Promise<string | null> {
  return await execTmux(["display-message", "-p", "-t", paneId, "#{pane_title}"]);
}

// Get the current command of a pane
export async function getPaneCommand(paneId: string): Promise<string | null> {
  return await execTmux([
    "display-message",
    "-p",
    "-t",
    paneId,
    "#{pane_current_command}",
  ]);
}

// Parse file path from common editor patterns
function parseFilePathFromTitle(title: string, workingDir: string | null): string | null {
  if (!title) {
    return null;
  }

  // Pattern 1: nvim/vim/vi often shows "filename - NVIM"
  const vimMatch = title.match(/^([^,\s-]+)[\s-]*.*?(?:NVIM|VIM|Vi)$/i);
  if (vimMatch && vimMatch[1] && workingDir) {
    const filePath = vimMatch[1];
    // If it's not an absolute path, prepend working directory
    if (!filePath.startsWith("/")) {
      return `${workingDir}/${filePath}`;
    }
    return filePath;
  }

  // Pattern 2: emacs shows "filename" or "path/to/file"
  const emacsMatch = title.match(/^([^\s]+)(?:\s+\(.*?\))?$/);
  if (emacsMatch && emacsMatch[1] && workingDir) {
    const filePath = emacsMatch[1];
    if (!filePath.startsWith("/")) {
      return `${workingDir}/${filePath}`;
    }
    return filePath;
  }

  // Pattern 3: VS Code in terminal might show file path
  if (title.includes("/") || title.includes("\\")) {
    const parts = title.split(/[\s,]+/);
    for (const part of parts) {
      if (part && (part.startsWith("/") || (part.includes(":") && part.match(/^[a-zA-Z]:/)))) {
        return part;
      }
    }
  }

  // Pattern 4: nano "filename" format
  const nanoMatch = title.match(/^.*?:\s+(.+)$/);
  if (nanoMatch && nanoMatch[1]) {
    return nanoMatch[1];
  }

  return null;
}

// Detect the active file the user is editing
export async function detectActiveFile(shepherdPaneId?: string): Promise<ActiveFileContext> {
  // If manual focus file is set, use it
  if (manualFocusFile) {
    return {
      activeFilePath: manualFocusFile,
      activePane: "manual",
      activeDirectory: null,
      timestamp: Date.now(),
    };
  }

  const currentPane = await getCurrentPaneId();
  const mainPane = shepherdPaneId ? await getMainPaneId(shepherdPaneId) : currentPane;

  if (!mainPane) {
    return {
      activeFilePath: null,
      activePane: null,
      activeDirectory: null,
      timestamp: Date.now(),
    };
  }

  const workingDir = await getPaneWorkingDirectory(mainPane);
  const title = await getPaneTitle(mainPane);
  const command = await getPaneCommand(mainPane);

  logger.debug("Active file detection", {
    mainPane,
    workingDir,
    title,
    command,
  });

  // Try to parse file from title
  let activeFilePath: string | null = null;

  if (title) {
    activeFilePath = parseFilePathFromTitle(title, workingDir);
  }

  // If no file from title, try command
  if (!activeFilePath && command) {
    // Check for editor commands like: nvim file.ts, vim file.py, etc.
    const editorMatch = command.match(/(?:nvim|vim|vi|nano|emacs|code)\s+([^\s]+)/);
    if (editorMatch && editorMatch[1]) {
      activeFilePath = editorMatch[1];
      if (activeFilePath && !activeFilePath.startsWith("/") && workingDir) {
        activeFilePath = `${workingDir}/${activeFilePath}`;
      }
    }
  }

  // If still no file, use the working directory
  if (!activeFilePath && workingDir) {
    activeFilePath = workingDir;
  }

  return {
    activeFilePath,
    activePane: mainPane,
    activeDirectory: workingDir,
    timestamp: Date.now(),
  };
}

// Check if a file path matches the active context
export function isActiveFile(filePath: string, context: ActiveFileContext): boolean {
  if (!context.activeFilePath) {
    return false;
  }

  // Exact match
  if (filePath === context.activeFilePath) {
    return true;
  }

  // Relative match (if activeFilePath is a directory)
  if (filePath.startsWith(context.activeFilePath + "/")) {
    return true;
  }

  // Basename match (if editing same file in different location)
  const activeBasename = context.activeFilePath.split("/").pop();
  const fileBasename = filePath.split("/").pop();

  if (activeBasename && fileBasename && activeBasename === fileBasename) {
    return true;
  }

  return false;
}

// Create a poller to periodically update the active file context
export class ActiveFilePoller {
  private interval?: ReturnType<typeof setInterval>;
  private currentContext: ActiveFileContext = {
    activeFilePath: null,
    activePane: null,
    activeDirectory: null,
    timestamp: Date.now(),
  };
  private listeners = new Set<(context: ActiveFileContext) => void>();
  private shepherdPaneId?: string;
  private pollInterval: number;
  private polling = false; // Prevent overlapping polls

  constructor(pollInterval = 5000) {
    this.pollInterval = pollInterval;
    this.poll = this.poll.bind(this);
  }

  start(shepherdPaneId?: string): void {
    this.shepherdPaneId = shepherdPaneId;

    // Initial poll (async, don't await)
    this.poll().catch((err) => {
      logger.debug("Initial poll error", { error: String(err) });
    });

    // Start polling
    this.interval = setInterval(() => {
      this.poll().catch((err) => {
        logger.debug("Poll error", { error: String(err) });
      });
    }, this.pollInterval);
    logger.debug("Active file poller started");
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    logger.debug("Active file poller stopped");
  }

  private async poll(): Promise<void> {
    // Prevent overlapping polls
    if (this.polling) {
      logger.debug("Skipping poll - previous poll still in progress");
      return;
    }

    this.polling = true;
    try {
      const newContext = await detectActiveFile(this.shepherdPaneId);

      // Check if context changed
      if (
        newContext.activeFilePath !== this.currentContext.activeFilePath ||
        newContext.activePane !== this.currentContext.activePane
      ) {
        this.currentContext = newContext;
        logger.debug("Active file context changed", {
          activeFilePath: newContext.activeFilePath,
          activePane: newContext.activePane,
        });
        this.notify();
      }
    } finally {
      this.polling = false;
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.currentContext);
    }
  }

  getContext(): ActiveFileContext {
    return this.currentContext;
  }

  subscribe(listener: (context: ActiveFileContext) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
