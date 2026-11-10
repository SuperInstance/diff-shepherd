// @ts-ignore - terminal-kit doesn't have TypeScript types
import term from "terminal-kit";
import type { ShepherdState } from "../state.js";

export interface TerminalKitDiffViewOptions {
  document: any;
  state: ShepherdState;
  onBack: () => void;
}

export function createTerminalKitDiffView({ document, state, onBack }: TerminalKitDiffViewOptions) {
  // Container for diff view (hidden initially)
  let isVisible = false;

  // Header
  const header = term.Text({
    parent: document,
    content: "",
    x: 0,
    y: 0,
    width: "100%",
    height: 5,
    attr: { color: "blue", bg: "blue" },
    hidden: true,
  });

  // Instructions
  const instructions = term.Text({
    parent: document,
    content: "[a] Accept File [A] Accept All [r] Reject File [R] Reject All [Esc] Back to List • Scroll: ↑↓",
    x: 0,
    y: 5,
    width: "100%",
    height: 3,
    attr: { color: "yellow" },
    hidden: true,
  });

  // Diff content (scrollable)
  const diffContent = term.TextBox({
    parent: document,
    x: 0,
    y: 8,
    width: "100%",
    height: "100%-11",
    scrollable: true,
    vScroll: true,
    mouse: true,
    keys: true,
    attr: { color: "white" },
    hidden: true,
  });

  // Buttons at bottom
  const buttonY = 1; // From bottom

  // Back button
  const backBtn = term.Button({
    parent: document,
    content: "[Esc] Back",
    x: 0,
    y: buttonY,
    width: 15,
    height: 1,
    attr: { bg: "cyan", fg: "white" },
    focusAttr: { bg: "bright-cyan", fg: "white", bold: true },
    hoverAttr: { bg: "bright-cyan", fg: "white", bold: true },
    hidden: true,
  });

  // Accept button
  const acceptBtn = term.Button({
    parent: document,
    content: "[a] Accept File",
    x: 16,
    y: buttonY,
    width: 20,
    height: 1,
    attr: { bg: "green", fg: "white" },
    focusAttr: { bg: "bright-green", fg: "white", bold: true },
    hoverAttr: { bg: "bright-green", fg: "white", bold: true },
    hidden: true,
  });

  // Reject button
  const rejectBtn = term.Button({
    parent: document,
    content: "[r] Reject File",
    x: 37,
    y: buttonY,
    width: 20,
    height: 1,
    attr: { bg: "red", fg: "white" },
    focusAttr: { bg: "bright-red", fg: "white", bold: true },
    hoverAttr: { bg: "bright-red", fg: "white", bold: true },
    hidden: true,
  });

  // Accept All button
  const acceptAllBtn = term.Button({
    parent: document,
    content: "[A] Accept All",
    x: 58,
    y: buttonY,
    width: 20,
    height: 1,
    attr: { bg: "green", fg: "white" },
    focusAttr: { bg: "bright-green", fg: "white", bold: true },
    hoverAttr: { bg: "bright-green", fg: "white", bold: true },
    hidden: true,
  });

  // Reject All button
  const rejectAllBtn = term.Button({
    parent: document,
    content: "[R] Reject All",
    x: 79,
    y: buttonY,
    width: 20,
    height: 1,
    attr: { bg: "red", fg: "white" },
    focusAttr: { bg: "bright-red", fg: "white", bold: true },
    hoverAttr: { bg: "bright-red", fg: "white", bold: true },
    hidden: true,
  });

  // Format a diff line with appropriate colors
  function formatDiffLine(line: any): string {
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
      document.draw();
      return;
    }

    // Update header
    header.setContent(
      `{blue-fg}{bold}🐑 ${selectedFile.filePath}{/bold}{/blue-fg}\n` +
        `  {green-fg}+${selectedFile.additions}{/green-fg} additions • {red-fg}-${selectedFile.deletions}{/red-fg} deletions`
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
    document.draw();
  }

  // Subscribe to state changes
  const unsubscribe = state.subscribe(() => {
    if (isVisible) {
      update();
    }
  });

  // Button click handlers
  backBtn.on("press", () => {
    onBack();
  });

  acceptBtn.on("press", async () => {
    const selectedFile = state.getSelectedFile();
    if (selectedFile) {
      await state.acceptAllInFile(selectedFile.filePath);
      if (state.getChanges().length === 0) {
        onBack();
      }
    }
  });

  rejectBtn.on("press", () => {
    const selectedFile = state.getSelectedFile();
    if (selectedFile) {
      state.rejectFile(selectedFile.filePath);
      if (state.getChanges().length === 0) {
        onBack();
      }
    }
  });

  acceptAllBtn.on("press", () => {
    const activeChanges = state.getActiveFileChanges();
    if (activeChanges.length > 0) {
      state.acceptAllSmart();
    } else {
      state.acceptAll();
    }
    onBack();
  });

  rejectAllBtn.on("press", () => {
    state.rejectAll();
    onBack();
  });

  // Show the diff view
  function show() {
    isVisible = true;
    header.show();
    instructions.show();
    diffContent.show();
    backBtn.show();
    acceptBtn.show();
    rejectBtn.show();
    acceptAllBtn.show();
    rejectAllBtn.show();
    update();
  }

  // Hide the diff view
  function hide() {
    isVisible = false;
    header.hide();
    instructions.hide();
    diffContent.hide();
    backBtn.hide();
    acceptBtn.hide();
    rejectBtn.hide();
    acceptAllBtn.hide();
    rejectAllBtn.hide();
  }

  return {
    show,
    hide,
    cleanup: () => {
      unsubscribe();
    },
  };
}
