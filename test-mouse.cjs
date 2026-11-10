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
term.white("  • Move your mouse over the button area below\n");
term.white("  • Click in the button area\n");
term.white("  • Look for feedback messages below\n");
term.white("  • Press Ctrl+C or 'q' to exit\n\n");

// Draw a button area manually - add newlines!
term.moveTo(1, 10);
term.bgBlue.white("       ╔══════════════════════════╗       \n");
term.bgBlue.white("       ║   🐑 Hover & Click Me    ║       \n");
term.bgBlue.white("       ╚══════════════════════════╝       \n");

// Status area
term.moveTo.cyan(1, 14)("Status:\n");
term.grey("  Waiting for mouse events...\n");

// Enable mouse tracking
term.grabInput({ mouse: "button" });

// Track mouse position for hover detection
let mouseX = 0;
let mouseY = 0;
let isHovering = false;
let eventCount = 0;
let running = true;

term.on("mouse", (name, data) => {
  eventCount++;
  mouseX = data.x;
  mouseY = data.y;

  // Button area: x=8-38, y=10-12 (7 spaces padding, 3 lines of box)
  const inButtonArea = mouseX >= 8 && mouseX <= 38 && mouseY >= 10 && mouseY <= 12;

  if (inButtonArea && !isHovering) {
    isHovering = true;
    term.eraseLineAfter(1, 15);
    term.moveTo.cyan(1, 15)(`→ HOVERING! Position: ${mouseX}, ${mouseY} | Events: ${eventCount}\n`);
  } else if (!inButtonArea && isHovering) {
    isHovering = false;
    term.eraseLineAfter(1, 15);
    term.moveTo.grey(1, 15)(`  Left button. Position: ${mouseX}, ${mouseY} | Events: ${eventCount}\n`);
  }

  if (name === "MOUSE_LEFT_BUTTON_PRESSED") {
    if (inButtonArea) {
      term.eraseLineAfter(1, 16);
      term.moveTo.green(1, 16)(`✓ CLICKED inside button at ${mouseX}, ${mouseY}!\n`);
    } else {
      term.eraseLineAfter(1, 16);
      term.moveTo.yellow(1, 16)(`  Clicked outside button at ${mouseX}, ${mouseY}\n`);
    }
  }
});

term.on("key", (name, matches, data) => {
  if (name === "CTRL_C" || name === "q") {
    running = false;
    term.grabInput(false);
    term.styleReset("\n");
    process.exit(0);
  }
});

// Keep the process alive with a setInterval
setInterval(() => {
  if (!running) {
    process.exit(0);
  }
}, 1000);

term.moveTo.green(1, 17)("✓ Test running! Move your mouse over the button area above.\n");
