# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Diff Shepherd is a TypeScript CLI tool and MCP (Model Context Protocol) server that provides batch code review for AI pair programming. It watches a workspace for file changes and presents them in a non-intrusive terminal UI, allowing users to review and accept changes in bulk without leaving their workflow.

## Development Commands

```bash
# Start watching a directory (main entry point)
npm start /path/to/directory
npx tsx src/cli.ts

# Run with specific UI backends
npx tsx src/cli.ts ink        # React/Ink UI (default)
npx tsx src/cli.ts blessed     # Blessed TUI
npx tsx src/cli.ts terminal-kit # terminal-kit UI

# Auto tmux split pane setup
npm run ui
./shepherd.sh

# Run as MCP server
npm run mcp
npx tsx src/index.ts

# Run smoke tests
npm test
npx tsx test-smoke.ts

# TypeScript compilation check
npx tsc --noEmit
```

## Architecture

### Core Components

```
src/
├── index.ts              # MCP server entry point (stdio-based JSON-RPC 2.0)
├── cli.ts                # CLI entry point with commander argument parsing
├── app.tsx               # Root React/Ink component
├── terminal.ts           # Tmux pane spawning logic
├── config.ts             # Global configuration loader
├── utils/
│   ├── logger.ts         # File + console logging to ~/.diff-shepherd/logs/
│   ├── config.ts         # Config file resolution and defaults
│   └── active-file-tracker.ts  # Context awareness from tmux/editor
├── shepherd/
│   ├── watcher.ts        # Polling-based file watcher with diff calculation
│   ├── state.ts          # Central state management with integrity checking
│   └── render/
│       ├── summary-view.tsx   # Ink summary component
│       ├── diff-view.tsx      # Ink diff detail component
│       ├── blessed-ui.ts      # Blessed UI implementation
│       ├── blessed-diff-view.ts
│       └── terminal-kit-diff-view.ts
├── components/
│   └── Button.tsx        # Reusable button component
└── hooks/
    └── useMouse.ts       # Mouse interaction hook
```

### Key Design Patterns

1. **Polling, Not Live Watching**: FileWatcher polls every 15 seconds (configurable) rather than using live file listeners. This prevents distraction during active coding.

2. **Snapshot-Based Diffs**: The watcher takes snapshots of file contents and calculates diffs using the `diff` library. Changes are emitted as structured `FileChange` objects with `DiffHunk` arrays.

3. **Centralized State with Subscriptions**: `ShepherdState` manages all pending changes and uses a subscription pattern (`subscribe()` returns unsubscribe function) to notify UI components of changes.

4. **Integrity Checking**: Before accepting changes, the state verifies files haven't been modified since the diff was calculated (using mtime comparison).

5. **Context Awareness**: `ActiveFileTracker` detects the active file from tmux pane title/command, enabling "smart accept" that prioritizes the active file.

6. **Multiple UI Backends**: The same core logic supports three renderers:
   - Ink (React) - Default, component-based
   - Blessed - Full TUI with mouse support
   - terminal-kit - Performance-focused

## MCP Integration

The MCP server (`src/index.ts`) implements stdio-based JSON-RPC 2.0 protocol. Tools are defined in `MCP_TOOLS` array and registered in `package.json` under `claude.tools`.

### MCP Tools
- `start_diff_shepherd(directory?, id?)` - Spawns shepherd in tmux pane
- `set_focus_file(filePath)` - Manually set active file for context
- `clear_focus_file()` - Enable auto-detection from tmux

## Configuration

Config resolution order (higher priority wins):
1. `~/.config/diff-shepherd/config.json` (global)
2. `config.json` in project root
3. Defaults in `src/utils/config.ts`

Key options:
- `pollInterval`: File watching interval in ms (default: 15000)
- `diffDisplayStyle`: "foreground" or "background" (default: "foreground")
- `ignorePatterns`: Array of minimatch glob patterns to exclude

## File Watching Implementation Details

The `FileWatcher` class (`src/shepherd/watcher.ts`):
- Uses `readdir()` recursive traversal rather than `chokidar`'s native watching
- Filters files using `minimatch` against ignore patterns
- Stores `FileSnapshot` objects with content + mtime
- Calculates diffs using `diffLines()` from the `diff` library
- Handles new files as "all added", modifications as proper diffs
- Gracefully continues on file read errors

## State Management Patterns

`ShepherdState` (`src/shepherd/state.ts`) extends `FileChange` with `detectedAt` and `currentMtime` for integrity checking. Key methods:
- `addChanges()` - Adds new pending changes with async mtime capture
- `acceptAllInFile()` - Verifies integrity before accepting
- `acceptAllSmart()` - Accepts active file changes first
- `rejectFile()` - Removes changes and adjusts selection index
- Navigation: `selectNextFile()`, `selectPreviousFile()`, `enterDiffView()`, `exitToSummary()`

## Tmux Integration

Terminal spawning (`src/terminal.ts`) uses `tmux split-window -h` to create side panes. Active file detection reads pane titles/commands to infer what file the user is editing.

## Testing

The smoke test (`test-smoke.ts`) creates a temporary directory, writes test files, and validates:
- FileWatcher detects changes
- ShepherdState tracks pending changes
- Accept/reject operations work correctly
- Integrity checking prevents stale acceptance

No formal test framework is used - tests are procedural with console output and ANSI colors.

## Important Conventions

- **ES Modules**: Entire codebase uses ES import/export syntax
- **Absolute Imports**: Use `import { getLogger } from "../utils/logger.js"` (note `.js` extension required)
- **Type Safety**: Strict TypeScript with comprehensive interfaces
- **Async/Await**: Promises used throughout for file operations
- **Error Handling**: File operations wrapped in try/catch, graceful degradation
- **Logging**: Use `getLogger()` from utils/logger.ts for structured logging
