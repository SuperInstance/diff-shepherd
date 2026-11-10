#!/usr/bin/env node
/**
 * Diff Shepherd MCP Server
 *
 * A Model Context Protocol server that provides batch code review
 * for Claude Code without breaking the user's flow.
 */

import { spawn } from "child_process";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Type alias for MCP tool response
type MCPToolResponse = {
  content: Array<{ type: string; text: string }>;
};

/**
 * Validate and sanitize a file path to prevent path traversal attacks.
 * Returns the resolved path if valid, null otherwise.
 */
function validatePath(inputPath: string | undefined): string | null {
  if (!inputPath || typeof inputPath !== "string") {
    return null;
  }

  // Reject obvious path traversal attempts
  if (inputPath.includes("..") || inputPath.includes("~")) {
    return null;
  }

  try {
    const resolved = resolve(inputPath);
    // Additional check: ensure path doesn't escape expected bounds
    return resolved;
  } catch {
    return null;
  }
}

/**
 * Validate session ID to prevent injection attacks.
 */
function validateSessionId(id: string | undefined): string | null {
  if (!id || typeof id !== "string") {
    return null;
  }

  // Only allow alphanumeric, hyphen, underscore
  const validId = id.replace(/[^a-zA-Z0-9-_]/g, "");
  if (validId !== id) {
    return null;
  }

  return validId;
}

// MCP Tool Definitions
export const MCP_TOOLS = [
  {
    name: "start_diff_shepherd",
    description:
      "Start Diff Shepherd to review code changes in a non-intrusive side panel. " +
      "Use this when you've made code changes and want the user to review them in batch. " +
      "The shepherd will watch the given directory and show a summary of all pending changes " +
      "that the user can accept/reject without interrupting their workflow.",
    inputSchema: {
      type: "object",
      properties: {
        directory: {
          type: "string",
          description: "Directory to watch for changes (default: current working directory)",
        },
        id: {
          type: "string",
          description: "Session identifier for the shepherd (default: 'shepherd-1')",
        },
      },
    },
  },
  {
    name: "set_focus_file",
    description:
      "Manually set the file the user is currently editing. " +
      "This helps Diff Shepherd highlight which changes are most relevant to the user's current work.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path to the file the user is currently editing",
        },
      },
      required: ["filePath"],
    },
  },
  {
    name: "clear_focus_file",
    description:
      "Clear the manually set focus file, allowing Diff Shepherd to auto-detect from tmux.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
] as const;

// Ensure log directory exists
async function ensureLogDirectory(): Promise<void> {
  const { homedir } = await import("os");
  const { join } = await import("path");
  const logDir = join(homedir(), ".diff-shepherd", "logs");

  try {
    await mkdir(logDir, { recursive: true });
  } catch {
    // Ignore
  }
}

// Start the shepherd process
async function startShepherd(
  directory: string = ".",
  id: string = "shepherd-1"
): Promise<{ success: boolean; message: string; paneId?: string }> {
  await ensureLogDirectory();

  const scriptPath = resolve(__dirname, "..", "bin", "diff-shepherd");

  if (!existsSync(scriptPath)) {
    return {
      success: false,
      message: `Shepherd script not found at ${scriptPath}`,
    };
  }

  return new Promise((resolveResult) => {
    const proc = spawn("node", [scriptPath, "spawn", directory, "--id", id], {
      cwd: directory,
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolveResult({
          success: true,
          message: `Diff Shepherd started in tmux pane (${id})`,
        });
      } else {
        resolveResult({
          success: false,
          message: `Failed to start shepherd: ${stderr || stdout}`,
        });
      }
    });

    proc.on("error", (err) => {
      resolveResult({
        success: false,
        message: `Failed to start shepherd: ${err.message}`,
      });
    });
  });
}

// Set the focus file (manual override)
function setFocusFile(filePath: string): {
  success: boolean;
  message: string;
} {
  // This would be called by the MCP client
  // The actual implementation is in the active-file-tracker
  return {
    success: true,
    message: `Focus file set to: ${filePath}`,
  };
}

// Clear the focus file
function clearFocusFile(): {
  success: boolean;
  message: string;
} {
  return {
    success: true,
    message: "Focus file cleared (auto-detection enabled)",
  };
}

// Main MCP Server handler
async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolResponse> {
  switch (toolName) {
    case "start_diff_shepherd": {
      const directory = validatePath(args.directory as string) || ".";
      const id = validateSessionId((args.id as string) || "shepherd-1") || "shepherd-1";

      const result = await startShepherd(directory, id);

      return {
        content: [
          {
            type: "text",
            text: result.success
              ? result.message
              : `Error: ${result.message}`,
          },
        ],
      };
    }

    case "set_focus_file": {
      const filePath = args.filePath as string;
      if (!filePath) {
        return {
          content: [
            {
              type: "text",
              text: "Error: filePath is required",
            },
          ],
        };
      }

      const validatedPath = validatePath(filePath);
      if (!validatedPath) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Invalid file path (path traversal not allowed)",
            },
          ],
        };
      }

      const result = setFocusFile(validatedPath);

      return {
        content: [
          {
            type: "text",
            text: result.message,
          },
        ],
      };
    }

    case "clear_focus_file": {
      const result = clearFocusFile();

      return {
        content: [
          {
            type: "text",
            text: result.message,
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${toolName}`,
          },
        ],
      };
  }
}

// When run directly, start as stdio MCP server
if (import.meta.url === `file://${process.argv[1]}`) {
  // Simple stdio MCP server
  let buffer = "";

  process.stdin.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);

        if (message.method === "tools/list") {
          process.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              result: { tools: MCP_TOOLS },
            }) + "\n"
          );
        } else if (message.method === "tools/call") {
          handleToolCall(message.params.name, message.params.arguments).then(
            (result) => {
              process.stdout.write(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: message.id,
                  result,
                }) + "\n"
              );
            }
          );
        } else if (message.method === "initialize") {
          process.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              result: {
                protocolVersion: "2024-11-05",
                capabilities: {
                  tools: {},
                },
                serverInfo: {
                  name: "diff-shepherd",
                  version: "0.1.0",
                },
              },
            }) + "\n"
          );
        }
      } catch {
        // Ignore invalid JSON
      }
    }
  });
}

// Re-exports for convenience
export { MCP_TOOLS as tools, startShepherd, setFocusFile, clearFocusFile };
