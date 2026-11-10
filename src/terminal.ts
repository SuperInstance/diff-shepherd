import { spawn, spawnSync } from "child_process";
import { getLogger } from "./utils/logger.js";
import { tmpdir } from "os";
import { join } from "path";

const logger = getLogger();

export interface TerminalEnvironment {
  inTmux: boolean;
  summary: string;
  sessionName?: string;
}

export interface ShepherdPaths {
  paneIdFile: string;
  lockFile: string;
  socket: string;
}

// Get configurable paths for shepherd files
export function getShepherdPaths(id: string = "shepherd-1"): ShepherdPaths {
  const tmpDir = tmpdir();
  return {
    paneIdFile: join(tmpDir, `diff-shepherd-pane-id`),
    lockFile: join(tmpDir, `diff-shepherd.lock`),
    socket: join(tmpDir, `shepherd-${id}.sock`),
  };
}

export function detectTerminal(): TerminalEnvironment {
  const inTmux = !!process.env.TMUX;
  const summary = inTmux ? "tmux" : "no tmux";

  if (inTmux) {
    // Try to get the tmux session name
    try {
      const result = spawnSync(
        "tmux",
        ["display-message", "-p", "#{session_name}"],
        { encoding: "utf-8" }
      );
      if (result.status === 0 && result.stdout) {
        const sessionName = result.stdout.trim();
        logger.debug(`Detected tmux session: ${sessionName}`);
        return { inTmux, summary, sessionName };
      }
    } catch (err) {
      // Ignore errors
      logger.debug(`Error detecting tmux session: ${err}`);
    }
  }

  return { inTmux, summary };
}

export interface SpawnResult {
  method: string;
  paneId?: string;
  reused?: boolean;
}

export interface SpawnOptions {
  socketPath?: string;
  forceNew?: boolean; // Force creation of a new pane
}

// Check if tmux session is still active
export function isTmuxSessionActive(): boolean {
  try {
    const result = spawnSync("tmux", ["display-message", "-p", "1"]);
    return result.status === 0;
  } catch {
    return false;
  }
}

// Get all shepherd panes in the current session
function getShepherdPanes(): string[] {
  try {
    const result = spawnSync(
      "tmux",
      ["list-panes", "-a", "-F", "#{pane_id} #{pane_current_command}"],
      { encoding: "utf-8" }
    );

    if (result.status !== 0 || !result.stdout) {
      return [];
    }

    // Find panes running diff-shepherd
    const lines = result.stdout.trim().split("\n");
    const shepherdPanes: string[] = [];

    for (const line of lines) {
      const parts = line.split(" ");
      const paneId = parts[0];
      const command = parts[1];
      if (paneId && command && (command.includes("diff-shepherd") || command.includes("node"))) {
        shepherdPanes.push(paneId);
      }
    }

    return shepherdPanes;
  } catch {
    return [];
  }
}

export async function spawnShepherd(
  id: string,
  directory: string,
  options?: SpawnOptions
): Promise<SpawnResult> {
  const env = detectTerminal();

  if (!env.inTmux) {
    throw new Error("Shepherd requires tmux. Please run inside a tmux session.");
  }

  // Check if tmux session is still active
  if (!isTmuxSessionActive()) {
    throw new Error("tmux session is no longer active. Please start a new tmux session.");
  }

  // Check for existing shepherd panes
  if (!options?.forceNew) {
    const existingPanes = getShepherdPanes();
    if (existingPanes.length > 0) {
      logger.info(`Found existing shepherd pane(s): ${existingPanes.join(", ")}`);
      // Use the first existing pane
      const existingPaneId = existingPanes[0];
      if (existingPaneId) {
        const reused = await reuseExistingPane(existingPaneId, directory, id, options);
        if (reused) {
          return { method: "tmux", paneId: existingPaneId, reused: true };
        }
      }
    }
  }

  // Create a new pane
  const paneId = await createNewPane(directory, id, options);
  if (paneId) {
    return { method: "tmux", paneId, reused: false };
  }

  throw new Error("Failed to spawn tmux pane");
}

async function getShepherdPaneId(id: string = "shepherd-1"): Promise<string | null> {
  const paths = getShepherdPaths(id);
  try {
    const { readFile } = await import("fs/promises");
    const content = await readFile(paths.paneIdFile, "utf-8");
    const paneId = content.trim();

    if (!paneId) {
      return null;
    }

    // Verify the pane still exists
    const result = spawnSync("tmux", ["display-message", "-t", paneId, "-p", "#{pane_id}"]);
    const output = result.stdout?.toString().trim();

    // Pane exists only if command succeeds AND returns the same pane ID
    if (result.status === 0 && output === paneId) {
      return paneId;
    }

    // Stale pane reference - clean up the file
    logger.debug("Stale pane ID found, cleaning up");
    const { writeFile } = await import("fs/promises");
    await writeFile(paths.paneIdFile, "");
  } catch (err) {
    // File doesn't exist or can't be read
    logger.debug(`Error reading pane ID file: ${err}`);
  }
  return null;
}

async function saveShepherdPaneId(paneId: string, id: string = "shepherd-1"): Promise<void> {
  const paths = getShepherdPaths(id);
  try {
    const { writeFile } = await import("fs/promises");
    await writeFile(paths.paneIdFile, paneId);
    logger.debug(`Saved pane ID: ${paneId}`);
  } catch (err) {
    logger.warn(`Failed to save pane ID: ${err}`);
  }
}

async function createNewPane(
  directory: string,
  id: string,
  options?: SpawnOptions
): Promise<string | null> {
  const paths = getShepherdPaths(id);
  return new Promise((resolve) => {
    // Get the directory of this script
    const scriptDir = new URL(".", import.meta.url).pathname;
    const runScript = `${scriptDir}/../bin/diff-shepherd`;

    // Auto-generate socket path for IPC if not provided
    const socketPath = options?.socketPath || paths.socket;

    // Validate and sanitize inputs to prevent command injection
    // Only allow alphanumeric, hyphen, underscore, slash, dot, and colon in paths
    const validId = id.replace(/[^a-zA-Z0-9-_]/g, "");
    const escapedDir = directory.replace(/'/g, "'\\''");
    const escapedSocket = socketPath.replace(/'/g, "'\\''");

    // Build the command using shell escaping to prevent injection
    const command = `cd '${escapedDir}' && ${runScript} show --id ${validId} --socket '${escapedSocket}'`;

    logger.info(`Creating new shepherd pane for: ${directory}`);

    // Use split-window -h for vertical split (side by side)
    // -p 67 gives shepherd 2/3 width (1:2 ratio, Claude:Shepherd)
    // -P -F prints the new pane ID so we can save it
    const args = ["split-window", "-h", "-p", "67", "-P", "-F", "#{pane_id}", command];
    const proc = spawn("tmux", args);
    let paneId = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      paneId += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", async (code) => {
      if (code === 0 && paneId.trim()) {
        const trimmedPaneId = paneId.trim();
        await saveShepherdPaneId(trimmedPaneId, id);
        logger.info(`Created new pane: ${trimmedPaneId}`);
        resolve(trimmedPaneId);
      } else {
        logger.error(`Failed to create pane (exit code: ${code})`, { stderr });
        resolve(null);
      }
    });

    proc.on("error", (err) => {
      logger.error("Failed to spawn tmux process", { error: String(err) });
      resolve(null);
    });
  });
}

async function reuseExistingPane(
  paneId: string,
  directory: string,
  id: string,
  options?: SpawnOptions
): Promise<boolean> {
  const paths = getShepherdPaths(id);
  return new Promise((resolve) => {
    // Get the directory of this script
    const scriptDir = new URL(".", import.meta.url).pathname;
    const runScript = `${scriptDir}/../bin/diff-shepherd`;

    // Auto-generate socket path for IPC if not provided
    const socketPath = options?.socketPath || paths.socket;

    // Build the command to run
    let command = `cd ${directory} && ${runScript} show --id ${id}`;
    command += ` --socket ${socketPath}`;

    logger.info(`Reusing existing pane: ${paneId}`);

    // Send Ctrl+C to interrupt any running process
    const killProc = spawn("tmux", ["send-keys", "-t", paneId, "C-c"]);

    killProc.on("close", () => {
      // Wait for process to terminate before sending new command
      setTimeout(() => {
        // Clear the terminal and run the new command
        const args = ["send-keys", "-t", paneId, `clear && ${command}`, "Enter"];
        const proc = spawn("tmux", args);

        proc.on("close", (code) => {
          if (code === 0) {
            logger.info(`Successfully reused pane: ${paneId}`);
          } else {
            logger.warn(`Failed to reuse pane: ${paneId}`);
          }
          resolve(code === 0);
        });

        proc.on("error", (err) => {
          logger.error("Failed to send keys to tmux", { error: String(err) });
          resolve(false);
        });
      }, 150);
    });

    killProc.on("error", (err) => {
      logger.error("Failed to interrupt existing process", { error: String(err) });
      resolve(false);
    });
  });
}

// Clean up stale pane tracking files
export async function cleanupStalePanes(): Promise<void> {
  try {
    const { unlink } = await import("fs/promises");

    // Clean up pane ID file if it points to a non-existent pane
    const paneId = await getShepherdPaneId();
    if (paneId === null) {
      // File is already cleaned up or doesn't exist
      return;
    }
  } catch (err) {
    logger.debug(`Error during cleanup: ${err}`);
  }
}
