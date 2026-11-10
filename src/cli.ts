#!/usr/bin/env node
import { program } from "commander";
import { render } from "ink";
import React from "react";
import { FileWatcher } from "./shepherd/watcher.js";
import { ShepherdState } from "./shepherd/state.js";
import { App } from "./app.js";
import { loadConfig } from "./utils/config.js";

// Set window title via ANSI escape codes
function setWindowTitle(title: string) {
  process.stdout.write(`\x1b]0;${title}\x07`);
}

// Clear screen and hide cursor
function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[H\x1b[?25l");
}

// Show cursor on exit
function showCursor() {
  process.stdout.write("\x1b[?25h");
}

program
  .name("diff-shepherd")
  .description("Non-intrusive, batch-review interface for Claude Code changes")
  .version("0.1.0");

async function runShepherd(directory: string, id: string) {
  // Set window title
  setWindowTitle(`shepherd: ${id}`);

  // Clear screen before rendering
  clearScreen();

  // Ensure cursor is shown on exit
  process.on("exit", showCursor);
  process.on("SIGINT", () => {
    showCursor();
    process.exit();
  });

  // Resolve directory to absolute path
  const { resolve } = await import("path");
  const absoluteDir = resolve(directory);

  // Load configuration
  const config = await loadConfig(absoluteDir);

  // Create state
  const state = new ShepherdState();

  // Create and start watcher with config
  const watcher = new FileWatcher(
    absoluteDir,
    {
      onChange: (changes) => {
        state.addChanges(changes);
      },
    },
    {
      pollInterval: config.pollInterval,
      ignored: config.ignorePatterns,
    }
  );

  watcher.start();

  // Render the app
  const { waitUntilExit } = render(React.createElement(App, { state }), {
    exitOnCtrlC: true,
    patchConsole: false,
  });

  await waitUntilExit();

  // Cleanup
  watcher.stop();
}

program
  .command("start [directory]")
  .description("Start watching for file changes in the given directory")
  .option("--id <id>", "Shepherd session ID", "shepherd-1")
  .action(async (directory = ".", options) => {
    await runShepherd(directory, options.id);
  });

program
  .command("spawn [directory]")
  .description("Spawn a shepherd pane in tmux")
  .option("--id <id>", "Shepherd session ID", "shepherd-1")
  .action(async (directory = ".", options) => {
    const { spawnShepherd } = await import("./terminal.js");
    const { resolve } = await import("path");

    const absoluteDir = resolve(directory);
    const result = await spawnShepherd(options.id, absoluteDir);
    console.log(`Spawned shepherd '${options.id}' via ${result.method}`);
  });

program
  .command("show [directory]")
  .description("Show shepherd in the current terminal")
  .option("--id <id>", "Shepherd session ID", "shepherd-1")
  .option("--socket <path>", "Socket path for IPC (optional)")
  .action(async (directory = ".", options) => {
    await runShepherd(directory, options.id);
  });

program
  .command("blessed [directory]")
  .description("Start with blessed UI (clickable buttons)")
  .action(async (directory = ".") => {
    // Resolve directory to absolute path
    const { resolve } = await import("path");
    const absoluteDir = resolve(directory);

    // Load configuration
    const config = await loadConfig(absoluteDir);

    // Create state
    const state = new ShepherdState();

    // Create and start watcher with config
    const watcher = new FileWatcher(
      absoluteDir,
      {
        onChange: (changes) => {
          state.addChanges(changes);
        },
      },
      {
        pollInterval: config.pollInterval,
        ignored: config.ignorePatterns,
      }
    );

    watcher.start();

    // Create blessed UI
    const { createBlessedUI } = await import("./shepherd/render/blessed-ui.js");
    const { cleanup } = createBlessedUI(state);

    // Handle cleanup on exit
    const cleanupOnExit = () => {
      cleanup();
      watcher.stop();
    };

    process.on("exit", cleanupOnExit);
    process.on("SIGINT", () => {
      cleanupOnExit();
      process.exit();
    });
  });

program
  .command("terminal-kit [directory]")
  .description("Start with terminal-kit UI (working hover effects)")
  .action(async (directory = ".") => {
    // Resolve directory to absolute path
    const { resolve } = await import("path");
    const absoluteDir = resolve(directory);

    // Load configuration
    const config = await loadConfig(absoluteDir);

    // Create state
    const state = new ShepherdState();

    // Create and start watcher with config
    const watcher = new FileWatcher(
      absoluteDir,
      {
        onChange: (changes) => {
          state.addChanges(changes);
        },
      },
      {
        pollInterval: config.pollInterval,
        ignored: config.ignorePatterns,
      }
    );

    watcher.start();

    // Import terminal-kit using createRequire
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const term = require("terminal-kit").terminal;

    // Setup terminal (don't use fullscreen, just clear and use grabInput)
    term.clear();
    term.grabInput({ mouse: "button" });
    term.hideCursor();

    // Keep process alive
    let running = true;
    setInterval(() => {
      if (!running) process.exit(0);
    }, 1000);

    let currentView: "summary" | "diff" = "summary";

    // Button definitions
    const buttons = [
      { label: "[a] Accept File", x: 0, bg: "blue", key: "a", action: async () => {
        const selectedFile = state.getSelectedFile();
        if (selectedFile) await state.acceptAllInFile(selectedFile.filePath);
      }},
      { label: "[A] Accept All", x: 21, bg: "blue", key: "A", action: () => {
        const activeChanges = state.getActiveFileChanges();
        if (activeChanges.length > 0) state.acceptAllSmart();
        else state.acceptAll();
      }},
      { label: "[r] Reject + Next", x: 42, bg: "red", key: "r", action: () => {
        state.rejectSelectedFile();
      }},
      { label: "[R] Reject All", x: 68, bg: "red", key: "R", action: () => {
        state.rejectAll();
      }},
    ];

    let hoveredButton = -1;

    // Draw header
    function drawHeader() {
      const summary = state.getSummary();
      const changes = state.getChanges();
      const activeFileChanges = state.getActiveFileChanges();

      term.moveTo(1, 1);
      term.green("🐑 Diff Shepherd");

      term.moveTo(3, 2);
      if (changes.length > 0) {
        term.white(`${changes.length} file${changes.length !== 1 ? "s" : ""} changed `);
        term.green(`(+${summary.additions})`);
        term.red(`(-${summary.deletions})`);
        if (activeFileChanges.length > 0) {
          term.moveTo(3, 3);
          term.yellow(`${activeFileChanges.length} in your active file`);
        }
      } else {
        term.white("No pending changes");
      }
    }

    // Draw instructions
    function drawInstructions() {
      term.moveTo(1, 6);
      term.yellow("[↑/k] Up [↓/j] Down [Enter] View Diff • Click buttons or use hotkeys");
    }

    // Draw file list
    function drawFileList() {
      const changes = state.getChanges();
      for (let i = 8; i < term.height - 3; i++) {
        term.eraseLine(1, i);
      }

      if (changes.length === 0) {
        term.moveTo(1, 8);
        term.grey("Watching for file changes...");
      } else {
        changes.forEach((change, index) => {
          const isSelected = index === state.getSelectedFileIndex();
          const isActive = state.isFileActive(change.filePath);

          let prefix = "  ";
          if (isActive) prefix = "📁 ";
          else if (isSelected) prefix = "► ";

          let line = `${prefix}${change.filePath}`;
          line += ` +${change.additions} -${change.deletions}`;

          if (isActive) {
            line += ` • You are editing`;
          }

          term.moveTo(1, 8 + index);
          if (isActive) {
            term.yellow(line);
          } else if (isSelected) {
            term.cyan(line);
          } else {
            term.white(line);
          }
        });
      }
    }

    // Draw buttons
    function drawButtons(hoverIdx: number = -1) {
      const buttonY = term.height;
      buttons.forEach((btn, i) => {
        term.moveTo(btn.x + 1, buttonY);
        const isHovered = i === hoverIdx;
        const color = btn.bg.charAt(0).toUpperCase() + btn.bg.slice(1);
        if (isHovered) {
          term.styleReset.bg(`Bright${color}`)(` ${btn.label} `);
        } else {
          term.styleReset.bg(color)(` ${btn.label} `);
        }
      });
      term.styleReset();
    }

    // Update UI function
    function updateUI() {
      if (currentView !== "summary") return;
      drawHeader();
      drawInstructions();
      drawFileList();
      drawButtons(hoveredButton);
    }

    // Subscribe to state changes
    const unsubscribe = state.subscribe(updateUI);

    // Track mouse position for hover detection
    let mouseX = 0;
    let mouseY = 0;

    // Mouse handler
    term.on("mouse", (name: string, data: any) => {
      if (currentView === "diff") return;

      mouseX = data.x;
      mouseY = data.y;

      const buttonY = term.height;

      // Update hover on any mouse event (button mode sends events on movement)
      let found = -1;
      buttons.forEach((btn, i) => {
        const btnWidth = btn.label.length + 2;
        if (mouseY === buttonY && mouseX >= btn.x + 1 && mouseX <= btn.x + btnWidth) {
          found = i;
        }
      });

      if (found !== hoveredButton) {
        hoveredButton = found;
        drawButtons(hoveredButton);
      }

      // Handle button clicks
      if (name === "MOUSE_LEFT_BUTTON_PRESSED" && found >= 0) {
        buttons[found]?.action();
      }
    });

    // Keyboard handler
    term.on("key", (key: string, data: any) => {
      if (key === "ESCAPE" && currentView === "diff") {
        currentView = "summary";
        term.clear();
        updateUI();
        return;
      }

      if (currentView === "summary") {
        if (key === "a") {
          const selectedFile = state.getSelectedFile();
          if (selectedFile) state.acceptAllInFile(selectedFile.filePath);
        } else if (key === "A") {
          const activeChanges = state.getActiveFileChanges();
          if (activeChanges.length > 0) state.acceptAllSmart();
          else state.acceptAll();
        } else if (key === "r") {
          state.rejectSelectedFile();
        } else if (key === "R") {
          state.rejectAll();
        } else if (key === "q" || key === "CTRL_C") {
          running = false;
          term.grabInput(false);
          term.showCursor();
          term.styleReset();
          term.clear();
          watcher.stop();
          process.exit(0);
        } else if (key === "UP" || key === "k") {
          state.selectPreviousFile();
        } else if (key === "DOWN" || key === "j") {
          state.selectNextFile();
        } else if (key === "ENTER") {
          const selectedFile = state.getSelectedFile();
          if (selectedFile) {
            state.enterDiffView();
            currentView = "diff";
            term.clear();
            term.moveTo(1, 1);
            term.blue(`🐑 ${selectedFile.filePath}`);
            term.moveTo(1, 2);
            term.green(`+${selectedFile.additions} additions • `);
            term.red(`-${selectedFile.deletions} deletions`);
            term.moveTo(1, 4);
            term.yellow("Press [Esc] to return, [a] Accept, [r] Reject");

            let y = 6;
            for (const hunk of selectedFile.hunks) {
              term.moveTo.cyan(1, y)(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
              y++;
              for (const line of hunk.lines) {
                const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
                if (line.type === "added") term.green(`${prefix} ${line.content}`);
                else if (line.type === "removed") term.red(`${prefix} ${line.content}`);
                else term.grey(`${prefix} ${line.content}`);
                y++;
                if (y > term.height - 3) {
                  term.moveTo.cyan(1, term.height - 2)("... (truncated)");
                  break;
                }
              }
              y++;
            }
          }
        }
      }
    });

    // Initial render
    updateUI();
  });

program.parse();
