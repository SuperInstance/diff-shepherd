#!/usr/bin/env node
// Test terminal-kit mouse handling
const term = require("terminal-kit").terminal;

// Clear screen and show instructions
term.clear();
term.moveTo(1, 1);
term.bgBlue.white("╔═══════════════════════════════════════════════════════╗\n");
term.bgBlue.white("║     Terminal-Kit Mouse Test - WSL Compatible          ║\n");
term.bgBlue.white("╚═══════════════════════════════════════════════════════╝\n");

term.moveTo.cyan(1, 5)("Instructions:\n");
term.white("  • Move your mouse over the button below to test HOVER\n");
term.white("  • Click the button to test CLICK\n");
term.white("  • Press Ctrl+C or 'q' to exit\n\n");

// Test 1: Simple inline button with hover
term.moveTo(1, 10)("Test: ");

const button = term.button({
  content: " 🐑 Hover & Click Me ",
  x: 7,
  y: 10,
  attr: { bg: "blue", fg: "white" },
  focusAttr: { bg: "bright-blue", fg: "white", bold: true },
  hoverAttr: { bg: "bright-blue", fg: "white", bold: true },
});

button.on("press", () => {
  term.moveTo.green(1, 14)("✓ Button CLICKED! Mouse support works!\n");
});

button.on("hover", () => {
  term.moveTo.cyan(1, 13)("→ Hovering! (bright-blue background)\n");
});

button.on("leave", () => {
  term.moveTo.grey(1, 13)("  Left button\n");
});

// Add exit handler
term.grabInput({ mouse: "button" });
term.on("key", (name: string, matches: any, data: any) => {
  if (name === "CTRL_C" || name === "q") {
    term.grabInput(false);
    term.moveTo(1, 16);
    term.styleReset("\n");
    process.exit(0);
  }
});
