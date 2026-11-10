import blessed from "blessed";
import type { ShepherdState } from "../state.js";
import type { FileChange, DiffLine } from "../watcher.js";

export interface BlessedDiffViewOptions {
  screen: blessed.Widgets.Screen;
  state: ShepherdState;
  onBack: () => void;
}

export function createBlessedDiffView({ screen, state, onBack }: BlessedDiffViewOptions) {
  // Container for the diff view (leaves room for button bar at bottom)
  const container = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%-3",
    tags: true,
    hidden: true,
    style: {
      fg: "white",
    },
  });

  // Header showing file path and change counts
  const header = blessed.box({
    parent: container,
    top: 0,
    left: 0,
    width: "100%",
    height: 5,
    tags: true,
    border: { type: "line" },
    style: {
      fg: "white",
      border: { fg: "blue" },
      bg: "blue",
    },
  });

  // Instructions showing keyboard shortcuts
  const instructions = blessed.box({
    parent: container,
    top: 5,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    style: {
      fg: "yellow",
    },
  });

  // Scrollable diff content area
  const diffContent = blessed.box({
    parent: container,
    top: 8,
    left: 0,
    width: "100%",
    height: "100%-14",
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    vi: true,
    style: {
      fg: "white",
    },
  });

  // Button bar at the bottom
  const buttonBar = blessed.box({
    parent: container,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    style: {
      fg: "white",
    },
  });

  // Back button
  const backBtn = blessed.button({
    parent: buttonBar,
    left: 0,
    width: 15,
    height: 3,
    content: "[Esc] Back",
    mouse: true,
    style: {
      fg: "white",
      bg: "cyan",
      focus: { bg: "bright-cyan" },
      hover: { bg: "bright-cyan", bold: true },
    },
  });

  // Accept button
  const acceptBtn = blessed.button({
    parent: buttonBar,
    left: 16,
    width: 20,
    height: 3,
    content: "[a] Accept File",
    mouse: true,
    style: {
      fg: "white",
      bg: "green",
      focus: { bg: "bright-green" },
      hover: { bg: "bright-green", bold: true },
    },
  });

  // Reject button
  const rejectBtn = blessed.button({
    parent: buttonBar,
    left: 37,
    width: 20,
    height: 3,
    content: "[r] Reject File",
    mouse: true,
    style: {
      fg: "white",
      bg: "red",
      focus: { bg: "bright-red" },
      hover: { bg: "bright-red", bold: true },
    },
  });

  // Accept All button
  const acceptAllBtn = blessed.button({
    parent: buttonBar,
    left: 58,
    width: 20,
    height: 3,
    content: "[A] Accept All",
    mouse: true,
    style: {
      fg: "white",
      bg: "green",
      focus: { bg: "bright-green" },
      hover: { bg: "bright-green", bold: true },
    },
  });

  // Reject All button
  const rejectAllBtn = blessed.button({
    parent: buttonBar,
    left: 79,
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

  // Track whether diff view is visible
  let isVisible = false;

  // Show the diff view
  function show() {
    isVisible = true;
    container.show();
    update();
    screen.render();
  }

  // Hide the diff view
  function hide() {
    isVisible = false;
    container.hide();
    screen.render();
  }

  // Format a diff line with appropriate colors
  function formatDiffLine(line: DiffLine): string {
    const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
    const content = line.content || "";

    switch (line.type) {
      case "added":
        return `{green-fg}${prefix} ${content}{/green-fg}`;
      case "removed":
        return `{red-fg}${prefix} ${content}{/red-fg}`;
      default:
        return `{grey-fg}${prefix} ${content}{/grey-fg}`;
    }
  }

  // Format hunk header
  function formatHunkHeader(hunk: { oldStart: number; oldLines: number; newStart: number; newLines: number }): string {
    return `{cyan-fg}{bold}@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@{/bold}{/cyan-fg}`;
  }

  // Update the diff view content
  function update() {
    const selectedFile = state.getSelectedFile();

    if (!selectedFile) {
      header.setContent("{blue-fg}{bold}🐑 No File Selected{/bold}{/blue-fg}");
      instructions.setContent("{yellow-fg}Press [Esc] to return to file list{/yellow-fg}");
      diffContent.setContent("{grey-fg}No file selected{/grey-fg}");
      screen.render();
      return;
    }

    // Update header
    header.setContent(
      `{blue-fg}{bold}🐑 ${selectedFile.filePath}{/bold}{/blue-fg}\n` +
        `  {green-fg}+${selectedFile.additions}{/green-fg} additions • {red-fg}-${selectedFile.deletions}{/red-fg} deletions`
    );

    // Update instructions
    instructions.setContent(
      `{yellow-fg}[a] Accept File [A] Accept All [r] Reject File [R] Reject All [Esc] Back to List • Scroll: ↑↓ or PageUp/Down{/yellow-fg}`
    );

    // Build diff content
    let diffText = "";
    for (const hunk of selectedFile.hunks) {
      diffText += formatHunkHeader(hunk) + "\n";
      for (const line of hunk.lines) {
        diffText += formatDiffLine(line) + "\n";
      }
      diffText += "\n";
    }

    diffContent.setContent(diffText || "{grey-fg}No changes to display{/grey-fg}");
    screen.render();
  }

  // Subscribe to state changes
  const unsubscribe = state.subscribe(() => {
    if (isVisible) {
      update();
    }
  });

  // Button click handlers
  backBtn.on("click", () => {
    onBack();
  });

  acceptBtn.on("click", async () => {
    const selectedFile = state.getSelectedFile();
    if (selectedFile) {
      await state.acceptAllInFile(selectedFile.filePath);
      // If no more files, go back to summary
      if (state.getChanges().length === 0) {
        onBack();
      }
    }
  });

  rejectBtn.on("click", () => {
    const selectedFile = state.getSelectedFile();
    if (selectedFile) {
      state.rejectFile(selectedFile.filePath);
      // If no more files, go back to summary
      if (state.getChanges().length === 0) {
        onBack();
      }
    }
  });

  acceptAllBtn.on("click", () => {
    const activeChanges = state.getActiveFileChanges();
    if (activeChanges.length > 0) {
      state.acceptAllSmart();
    } else {
      state.acceptAll();
    }
    onBack();
  });

  rejectAllBtn.on("click", () => {
    state.rejectAll();
    onBack();
  });

  // Keyboard shortcuts
  container.key(["escape", "C-c"], () => {
    onBack();
  });

  container.key(["a"], async () => {
    const selectedFile = state.getSelectedFile();
    if (selectedFile) {
      await state.acceptAllInFile(selectedFile.filePath);
      // If no more files, go back to summary
      if (state.getChanges().length === 0) {
        onBack();
      }
    }
  });

  container.key(["A"], () => {
    const activeChanges = state.getActiveFileChanges();
    if (activeChanges.length > 0) {
      state.acceptAllSmart();
    } else {
      state.acceptAll();
    }
    onBack();
  });

  container.key(["r"], () => {
    const selectedFile = state.getSelectedFile();
    if (selectedFile) {
      state.rejectFile(selectedFile.filePath);
      // If no more files, go back to summary
      if (state.getChanges().length === 0) {
        onBack();
      }
    }
  });

  container.key(["R"], () => {
    state.rejectAll();
    onBack();
  });

  // Scroll with keyboard
  container.key(["up", "k"], () => {
    diffContent.scroll(-1);
    screen.render();
  });

  container.key(["down", "j"], () => {
    diffContent.scroll(1);
    screen.render();
  });

  container.key(["pageup"], () => {
    diffContent.scroll(-(diffContent.height as number) / 2);
    screen.render();
  });

  container.key(["pagedown"], () => {
    diffContent.scroll((diffContent.height as number) / 2);
    screen.render();
  });

  // Mouse wheel support for scrolling
  diffContent.on("wheeldown", () => {
    diffContent.scroll(1);
    screen.render();
  });

  diffContent.on("wheelup", () => {
    diffContent.scroll(-1);
    screen.render();
  });

  return {
    container,
    show,
    hide,
    cleanup: () => {
      unsubscribe();
      container.destroy();
    },
  };
}
