# Diff Shepherd - Project Constitution

## 🎯 Vision & Core Principle
Build a Claude Code MCP server that provides a **non-intrusive, batch-review interface** for changes made by Claude Code. The user works in their main file (e.g., in VS Code). Diff Shepherd watches the workspace, and every 15 seconds, updates a side pane showing a summary of pending changes. The user can quickly tab through files, see brightly colored diffs, and "Accept All" with a single command, then seamlessly return to their work. The experience should be **polished, keyboard-driven, and feel like a superpower for pair-programming with Claude.**

## 🏗️ Architecture & Key Decisions
1.  **Foundation:** Fork/copy the architecture of `dvdsgl/claude-canvas`. It is an MCP server that uses `tmux` to split panes and `ink` (React for terminals) to render a UI.
2.  **Core Mechanism:** A **polling-based file watcher** (not live listeners) that takes snapshots of the workspace, calculates diffs, and presents them in a batched summary.
3.  **UI Philosophy:** **No live jumping.** The side pane uses:
    *   **Subtle, timed background color changes** (every 15s) to indicate "new diffs are ready."
    *   **Bright colors** only for the actual diff lines when a user is actively reviewing a file.
    *   Clear summaries: "3 files changed, 47 lines added."
4.  **Interaction Model:**
    *   Keyboard shortcuts to tab through changed files.
    *   `A` to "Accept All" changes in the currently viewed file.
    *   `Shift+A` to "Accept All" changes in the entire batch.
    *   A command to return focus to the "main" file the user was editing.

## 📁 Project Structure
diff-shepherd/
├── package.json # Based on claude-canvas, add our deps (chokidar, diff)
├── tsconfig.json # Copy from claude-canvas
├── src/
│ ├── index.ts # MCP server setup. COPY LOGIC FROM CANVAS.
│ ├── shepherd/ # Our new core logic
│ │ ├── watcher.ts # Polling file watcher & diff calculator
│ │ ├── state.ts # Manages pending changes, accepted state
│ │ └── render/ # UI components
│ │ ├── summary-view.tsx # Shows "3 files changed"
│ │ └── diff-view.tsx # Shows bright colored diffs for one file
│ └── cli.ts # Called by bin/ script to launch
├── bin/
│ └── diff-shepherd # CLI entry point. COPY PATTERN FROM CANVAS.
└── CLAUDE.md # This file

## 🤝 Collab Mode: Build Plan for Claude
We will build this in 5 focused prompts. Do not write all the code at once. After each prompt, you will output only the code for that step and a brief status.

**Developer's Note to Claude:** Follow this plan exactly. When I give you a prompt number (e.g., `#Prompt 1`), execute only that step. The files from `dvdsgl/claude-canvas` that we are using as-is are:
- The MCP server bootstrapping in `src/index.ts`
- The `tmux` pane spawning logic
- The React/Ink (`ink`) TUI rendering setup
Your job is to integrate our new `shepherd` logic into this existing scaffold.

### Prompt 1: Project Setup & Scaffolding
**Task:** Initialize the project. Create `package.json` and `tsconfig.json` by adapting them from `claude-canvas`. Install core dependencies (`chokidar`, `diff`). Create the basic folder structure. Write the `bin/diff-shepherd` CLI launcher.

### Prompt 2: The Watcher & State Core
**Task:** Create `src/shepherd/watcher.ts` and `state.ts`.
- `watcher.ts`: Implement a function that, given a directory path, polls every 15 seconds, takes a file snapshot, and uses the `diff` library to detect changes against the old snapshot. Emit structured diff hunks.
- `state.ts`: Create a `ShepherdState` class to store `pendingChanges` (mapped by file) and handle actions like `acceptAllInFile(filepath)` and `acceptAll()`.

### Prompt 3: The Summary View Component
**Task:** Create `src/shepherd/render/summary-view.tsx`.
- This React (ink) component listens to `ShepherdState`.
- It displays: "🐑 3 files changed (+120, -73)".
- It has a list of changed file names. Use `ink`'s `Select` or `useInput` to let the user "tab" through them with arrow keys.
- Pressing `Enter` on a file should switch the view to the detailed diff for that file.

### Prompt 4: The Diff View Component
**Task:** Create `src/shepherd/render/diff-view.tsx`.
- For a selected file, display the diff hunks brightly colored (green for additions, red for removals).
- At the top, show buttons/instr.: `[A]ccept All in File | [Shift+A]ccept All Batch | [Esc] Back to List`.
- Implement the key handlers to trigger the state acceptance methods.

### Prompt 5: Integration & Final Polish
**Task:** Integrate the new components into the main `src/index.ts`.
- Modify the existing canvas MCP server: when Claude calls the `start_shepherd` tool, it should:
    1.  Start the watcher on the provided directory.
    2.  Spawn the tmux pane (using existing canvas logic).
    3.  Render the `summary-view` in that pane, connected to the state.
- Ensure the 15-second poll triggers a subtle UI update (e.g., a brief, low-contrast background flash in the summary header).

**After Prompt 5, provide the following Markdown Report:**
```markdown
## Diff Shepherd - Build Progress Report
**Phase:** Integration Complete
**Core Status:** [ ] Watcher Polling | [ ] State Management | [ ] Summary UI | [ ] Diff UI | [ ] MCP Integration
**Key Implementation Decisions:**
1.
2.
3.
**Next Immediate Blockers/Questions:**
1.
2.