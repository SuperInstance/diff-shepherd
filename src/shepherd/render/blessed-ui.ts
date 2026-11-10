import blessed from "blessed";
import type { ShepherdState } from "../state.js";
import type { FileChange } from "../watcher.js";
import { createBlessedDiffView } from "./blessed-diff-view.js";

export function createBlessedUI(state: ShepherdState) {
  // Create blessed screen
  const screen = blessed.screen({
    smartCSR: true,
    title: "Diff Shepherd",
    fullUnicode: true,
    autoPadding: true,
    mouse: true, // Enable mouse at screen level
  });

  // Quit on Ctrl+C
  screen.key(["C-c"], () => {
    process.exit(0);
  });

  // Summary view container (holds file list, hides when diff view is shown)
  const summaryContainer = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: "100%-3",
    tags: true,
    style: {
      fg: "white",
    },
  });

  // Header box
  const headerBox = blessed.box({
    parent: summaryContainer,
    top: 0,
    left: 0,
    width: "100%",
    height: 5,
    tags: true,
    border: { type: "line" },
    style: {
      fg: "green",
      border: { fg: "green" },
    },
  });

  // Instructions box
  const instructionsBox = blessed.box({
    parent: summaryContainer,
    top: 5,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    style: {
      fg: "yellow",
    },
  });

  // File list box
  const fileListBox = blessed.list({
    parent: summaryContainer,
    top: 8,
    left: 0,
    width: "100%",
    height: "100%-8",
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    style: {
      fg: "white",
      selected: { bg: "blue", fg: "white" },
      item: { fg: "white", hover: { bg: "gray" } },
    },
  });

  // Button bar
  const buttonBar = blessed.box({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    style: {
      fg: "white",
    },
  });

  // Accept File button
  const acceptFileBtn = blessed.button({
    parent: buttonBar,
    left: 0,
    width: 20,
    height: 3,
    content: "[a] Accept File",
    mouse: true,
    style: {
      fg: "white",
      bg: "blue",
      focus: { bg: "bright-blue" },
      hover: { bg: "bright-blue", bold: true },
    },
  });

  // Accept All button
  const acceptAllBtn = blessed.button({
    parent: buttonBar,
    left: 21,
    width: 20,
    height: 3,
    content: "[A] Accept All",
    mouse: true,
    style: {
      fg: "white",
      bg: "blue",
      focus: { bg: "bright-blue" },
      hover: { bg: "bright-blue", bold: true },
    },
  });

  // Reject File + Next button
  const rejectFileBtn = blessed.button({
    parent: buttonBar,
    left: 42,
    width: 25,
    height: 3,
    content: "[r] Reject + Next",
    mouse: true,
    style: {
      fg: "white",
      bg: "red",
      focus: { bg: "bright-red" },
      hover: { bg: "bright-red", bold: true },
    },
  });

  // Reject All button
  const rejectAllBtn = blessed.button({
    parent: buttonBar,
    left: 68,
    width: 20,
    height: 3,
    content: "[R] Reject All",
    mouse: true,
    style: {
      fg: "white",
      bg: "red",
      focus: { bg: "bright-red" },
      hover: { bg: "bright-red", bold: true },
    },
  });

  // Append elements to screen
  screen.append(summaryContainer);
  screen.append(buttonBar);

  // Create diff view (hidden by default)
  const diffView = createBlessedDiffView({
    screen,
    state,
    onBack: () => {
      // Hide diff view, show summary
      diffView.hide();
      buttonBar.show();
      summaryContainer.show();
      fileListBox.focus();
      screen.render();
    },
  });

  // Initial render
  screen.render();

  // Track current changes
  let currentChanges: FileChange[] = [];

  // Update UI function
  function updateUI() {
    const summary = state.getSummary();
    const changes = state.getChanges();
    const activeFileChanges = state.getActiveFileChanges();
    const userContext = state.getUserContext();

    currentChanges = changes;

    // Update header
    if (changes.length > 0) {
      headerBox.setContent(
        `{green-fg}{bold}🐑 Diff Shepherd{/}{/green-fg}\n` +
        `  • {bold}${changes.length}{/} file${changes.length !== 1 ? "s" : ""} changed ` +
        `{green-fg}(+${summary.additions}){/green-fg} {red-fg}(-${summary.deletions}){/red-fg}` +
        (activeFileChanges.length > 0
          ? `\n  • {yellow-fg}${activeFileChanges.length} in your active file{/yellow-fg}`
          : "")
      );
    } else {
      headerBox.setContent(
        `{green-fg}{bold}🐑 Diff Shepherd{/}{/green-fg}\n` +
        `  • No pending changes`
      );
    }

    // Update instructions
    instructionsBox.setContent(
      `{yellow-fg}[↑/k] Down [↓/k] Up [Enter] View Diff • Click buttons or use hotkeys{/yellow-fg}`
    );

    // Update file list
    if (changes.length === 0) {
      fileListBox.setItems(["Watching for file changes..."]);
    } else {
      const items = changes.map((change, index) => {
        const isSelected = index === state.getSelectedFileIndex();
        const isActive = state.isFileActive(change.filePath);

        let prefix = "  ";
        if (isActive) prefix = "📁 ";
        else if (isSelected) prefix = "► ";

        let line = `${prefix}${change.filePath}`;
        line += ` {green-fg}+${change.additions}{/green-fg} {red-fg}-${change.deletions}{/red-fg}`;

        if (isActive) {
          line += ` {yellow-fg}• You are editing{/yellow-fg}`;
        }

        return line;
      });
      fileListBox.setItems(items);
    }

    screen.render();
  }

  // Subscribe to state changes
  const unsubscribe = state.subscribe(updateUI);

  // Initial render
  updateUI();

  // Remove the custom mouse handler and let blessed's built-in hover work
  // The hover styles are already defined in each button's style object

  // Button click handlers
  acceptFileBtn.on("click", async () => {
    const selectedFile = state.getSelectedFile();
    if (selectedFile) {
      await state.acceptAllInFile(selectedFile.filePath);
    }
  });

  acceptAllBtn.on("click", () => {
    const activeChanges = state.getActiveFileChanges();
    if (activeChanges.length > 0) {
      state.acceptAllSmart();
    } else {
      state.acceptAll();
    }
  });

  rejectFileBtn.on("click", () => {
    state.rejectSelectedFile();
  });

  rejectAllBtn.on("click", () => {
    state.rejectAll();
  });

  // Keyboard shortcuts
  screen.key(["a"], async () => {
    const selectedFile = state.getSelectedFile();
    if (selectedFile) {
      await state.acceptAllInFile(selectedFile.filePath);
    }
  });

  screen.key(["A"], () => {
    const activeChanges = state.getActiveFileChanges();
    if (activeChanges.length > 0) {
      state.acceptAllSmart();
    } else {
      state.acceptAll();
    }
  });

  screen.key(["r"], () => {
    state.rejectSelectedFile();
  });

  screen.key(["R"], () => {
    state.rejectAll();
  });

  screen.key(["q"], () => {
    process.exit(0);
  });

  // File list selection
  fileListBox.on("select", (item, index) => {
    state.selectFileByIndex(index);
  });

  fileListBox.on("click", (item) => {
    // Get the selected index from the list
    // @ts-ignore - blessed types are incomplete, items exists at runtime
    const index = fileListBox.items.indexOf(item);
    if (index >= 0) {
      state.selectFileByIndex(index);
    }
    // Also open diff view on click
    const selectedFile = state.getSelectedFile();
    if (selectedFile) {
      state.enterDiffView();
      summaryContainer.hide();
      buttonBar.hide();
      diffView.show();
    }
  });

  // Also try action event (double-click or Enter)
  fileListBox.on("action", (item, index) => {
    const selectedFile = state.getSelectedFile();
    if (selectedFile) {
      state.enterDiffView();
      summaryContainer.hide();
      buttonBar.hide();
      diffView.show();
    }
  });

  // Enter key on file list to view diff
  fileListBox.key(["enter"], () => {
    const selectedFile = state.getSelectedFile();
    if (selectedFile) {
      state.enterDiffView();
      summaryContainer.hide();
      buttonBar.hide();
      diffView.show();
    }
  });

  // Enter to view diff (fallback when not in list)
  screen.key(["enter"], () => {
    const selectedFile = state.getSelectedFile();
    if (selectedFile) {
      state.enterDiffView();
      summaryContainer.hide();
      buttonBar.hide();
      diffView.show();
    }
  });

  // Navigation
  screen.key(["up", "k"], () => {
    state.selectPreviousFile();
  });

  screen.key(["down", "j"], () => {
    state.selectNextFile();
  });

  return {
    screen,
    cleanup: () => {
      unsubscribe();
      diffView.cleanup();
      screen.destroy();
    },
  };
}
