// @ts-ignore - terminal-kit doesn't have TypeScript types
import { terminal as term } from "terminal-kit";
import type { ShepherdState } from "../state.js";

export function createTerminalKitUI(state: ShepherdState) {
  // Clear screen and setup
  term.clear();
  term.fullscreen(true);
  term.grabInput({ mouse: "button" });

  // Track current view
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
    // Clear file list area
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

  // Track hover state
  let hoveredButton = -1;

  // Mouse handler
  term.on("mouse", (name: string, data: any) => {
    if (currentView === "diff") return;

    const buttonY = term.height;
    const y = data.y;
    const x = data.x;

    // Check if over any button
    let found = -1;
    buttons.forEach((btn, i) => {
      const btnWidth = btn.label.length + 2;
      if (y === buttonY && x >= btn.x + 1 && x <= btn.x + btnWidth) {
        found = i;
      }
    });

    // Handle hover
    if (found !== hoveredButton) {
      hoveredButton = found;
      drawButtons(hoveredButton);
    }

    // Handle click
    if (name === "MOUSE_LEFT_BUTTON_PRESSED" && found >= 0) {
      buttons[found]?.action();
    }
  });

  // Keyboard handler
  term.on("key", (key: string, data: any) => {
    if (key === "ESCAPE" && currentView === "diff") {
      hideDiffView();
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
        cleanup();
        process.exit(0);
      } else if (key === "UP" || key === "k") {
        state.selectPreviousFile();
      } else if (key === "DOWN" || key === "j") {
        state.selectNextFile();
      } else if (key === "ENTER") {
        const selectedFile = state.getSelectedFile();
        if (selectedFile) {
          state.enterDiffView();
          showDiffView();
        }
      }
    }
  });

  // Initial render
  updateUI();

  function showDiffView() {
    currentView = "diff";
    // Clear screen for diff view
    term.clear();
    const selectedFile = state.getSelectedFile();
    if (selectedFile) {
      term.moveTo(1, 1);
      term.blue(`🐑 ${selectedFile.filePath}`);
      term.moveTo(1, 2);
      term.green(`+${selectedFile.additions} additions • `);
      term.red(`-${selectedFile.deletions} deletions`);
      term.moveTo(1, 4);
      term.yellow("Press [Esc] to return to file list, [a] Accept, [r] Reject");

      // Show diff
      let y = 6;
      for (const hunk of selectedFile.hunks) {
        term.moveTo.cyan(1, y)(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
        y++;
        for (const line of hunk.lines) {
          const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
          if (line.type === "added") {
            term.green(`${prefix} ${line.content}`);
          } else if (line.type === "removed") {
            term.red(`${prefix} ${line.content}`);
          } else {
            term.grey(`${prefix} ${line.content}`);
          }
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

  function hideDiffView() {
    currentView = "summary";
    term.clear();
    updateUI();
  }

  function cleanup() {
    unsubscribe();
    term.fullscreen(false);
    term.grabInput(false);
    term.clear();
    term.styleReset();
  }

  return {
    cleanup,
  };
}
