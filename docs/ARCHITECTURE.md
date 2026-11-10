# Diff Shepherd - Architecture Documentation

Complete architectural overview of the diff-shepherd project.

## Table of Contents

1. [Overview](#overview)
2. [Design Principles](#design-principles)
3. [System Architecture](#system-architecture)
4. [Component Diagrams](#component-diagrams)
5. [Data Flow](#data-flow)
6. [Module Organization](#module-organization)
7. [Design Patterns](#design-patterns)
8. [Technology Stack](#technology-stack)

---

## Overview

Diff Shepherd is a TypeScript CLI tool and MCP (Model Context Protocol) server that provides **batch code review for AI pair programming**. It watches a workspace for file changes and presents them in a non-intrusive terminal UI, allowing users to review and accept changes in bulk without leaving their workflow.

### Key Features

- **Polling-based file watching** (not live listeners) to prevent distraction during active coding
- **Snapshot-based diffs** using the `diff` library for precise change detection
- **Centralized state management** with subscription pattern for reactive UI updates
- **Integrity checking** to prevent accepting stale changes
- **Context awareness** via `ActiveFileTracker` for "smart accept" functionality
- **Multiple UI backends** (Ink/React, Blessed, terminal-kit)
- **MCP server** integration for AI assistant communication

---

## Design Principles

### 1. Non-Intrusiveness

The tool should never interrupt the user's workflow:
- Uses polling (15s default) instead of live file events
- Displays changes in a separate tmux pane
- Waits for user to explicitly review changes

### 2. Integrity First

Never accept changes without verification:
- Compares file mtime before accepting
- Rejects stale changes with clear error messages
- Provides "accept all in file" with atomic operations

### 3. Context Awareness

The tool knows what the user is working on:
- Detects active file from tmux pane title/command
- Highlights active file changes in the UI
- Prioritizes active file in "smart accept" operations

### 4. Flexibility

Support multiple workflows and environments:
- Pluggable UI backends
- Configurable ignore patterns
- MCP protocol for AI integration
- Tmux integration for terminal workflows

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Environment                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐         ┌──────────────────┐             │
│  │   Code Editor    │         │   Diff Shepherd  │             │
│  │   (Main Pane)    │         │   (Side Pane)    │             │
│  │                  │         │                  │             │
│  │  - Writing code  │◄────────┤  - Review diffs  │             │
│  │  - Making        │         │  - Accept/Reject │             │
│  │    changes       │         │  - Bulk actions  │             │
│  └──────────────────┘         └──────────────────┘             │
│          │                              ▲                        │
│          │                              │                        │
│          └──────────┬───────────────────┘                        │
│                     │                                            │
│              ┌──────▼──────┐                                     │
│              │    tmux     │  (tmux split-pane, IPC)            │
│              │   Server    │                                     │
│              └─────────────┘                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Diff Shepherd Process                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    CLI Entry Point                       │  │
│  │                    (src/cli.ts)                          │  │
│  └───────────────────────┬──────────────────────────────────┘  │
│                          │                                       │
│         ┌────────────────┼────────────────┐                     │
│         ▼                ▼                ▼                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │ FileWatcher  │ │ ShepherdState│ │ UI Backend   │           │
│  │              │ │              │ │              │           │
│  │ - Poll files │ │ - Manage     │ │ - Ink/React  │           │
│  │ - Calc diffs │ │   changes    │ │ - Blessed    │           │
│  │ - Emit events│ │ - Integrity  │ │ - term-kit   │           │
│  └──────────────┘ └──────────────┘ └──────────────┘           │
│         │                │                │                      │
│         └────────────────┼────────────────┘                     │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Shared Services                        │  │
│  │                                                          │  │
│  │  - Logger (src/utils/logger.ts)                         │  │
│  │  - Config (src/utils/config.ts)                         │  │
│  │  - ActiveFileTracker (src/utils/active-file-tracker.ts) │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Diagrams

### FileWatcher Component

```
┌─────────────────────────────────────────────────────────────┐
│                      FileWatcher                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Configuration:                                               │
│  - pollInterval: number                                      │
│  - ignored: string[]                                         │
│  - maxDepth: number                                          │
│  - maxFiles: number                                          │
│  - scanTimeout: number                                       │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  Methods:                                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ start()    → Starts polling timer                   │    │
│  │ stop()     → Stops polling timer                    │    │
│  │ takeSnapshot() → Captures current file states       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  Events:                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ onChange(changes: FileChange[])                     │    │
│  │ onError(error: Error, filePath?: string)            │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  Internal Flow:                                              │
│                                                               │
│  ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐ │
│  │  Poll   │───▶│  Scan    │───▶│ Compare  │───▶│ Emit   │ │
│  │ Timer   │    │ Directory│    │ Snapshots│    │ Changes│ │
│  └─────────┘    └──────────┘    └──────────┘    └────────┘ │
│       │              │               │                       │
│       │              ▼               ▼                       │
│       │        ┌──────────┐    ┌──────────┐                 │
│       │        │ Read     │    │ Calculate│                 │
│       │        │ Files    │    │   Diffs  │                 │
│       │        └──────────┘    └──────────┘                 │
│       │                                                   │
│       └─────────────────────► (every pollInterval)        │
│                                                           │
└─────────────────────────────────────────────────────────────┘
```

### ShepherdState Component

```
┌─────────────────────────────────────────────────────────────┐
│                     ShepherdState                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  State:                                                      │
│  - changes: FileChange[] (pending changes)                  │
│  - selectedIndex: number (current selection)                │
│  - activeFilePath: string | null (from ActiveFileTracker)   │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  Public Methods:                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ addChanges(changes)        → Add new changes        │    │
│  │ getChanges()               → Get all changes        │    │
│  │ getSelectedFile()          → Get current selection  │    │
│  │ selectNext/Previous()      → Navigate              │    │
│  │ acceptAllInFile(path)      → Accept file changes   │    │
│  │ acceptAll()                → Accept all            │    │
│  │ acceptAllSmart()           → Prioritize active     │    │
│  │ rejectFile/All()           → Reject changes        │    │
│  │ subscribe(callback)        → Observe changes       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  Integrity Checks:                                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Before accept:                                     │    │
│  │ 1. Check file exists                               │    │
│  │ 2. Compare current mtime with stored mtime          │    │
│  │ 3. Throw if mismatch (file modified)                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  Subscription Pattern:                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ subscribers: Set<() => void>                        │    │
│  │ notify() → calls all subscribers                    │    │
│  │ subscribe() → adds callback, returns unsubscribe     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### MCP Server Component

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server (index.ts)                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Protocol: JSON-RPC 2.0 over stdio                          │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  Tools:                                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ start_diff_shepherd(directory?, id?)               │    │
│  │   → Spawns shepherd in tmux pane                    │    │
│  │                                                      │    │
│  │ set_focus_file(filePath)                            │    │
│  │   → Sets active file for context                    │    │
│  │                                                      │    │
│  │ clear_focus_file()                                  │    │
│  │   → Enables auto-detection from tmux                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  Security:                                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ - validatePath()     → Prevent path traversal        │    │
│  │ - validateSessionId()→ Prevent injection            │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Tmux Integration                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Functions:                                                  │
│  - createNewPane()      → spawn("tmux", ["split-window"    │
│  - saveShepherdPaneId() → Store pane ID for later           │
│  - getShepherdPaneId()  → Retrieve pane ID                  │
│  - detectActiveFile()   → Parse pane title/command          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Change Detection Flow

```
1. FileWatcher.poll() triggered (every pollInterval ms)
        │
        ▼
2. takeSnapshot() - Scan directory, read files
        │
        ▼
3. Compare new snapshots with old snapshots
        │
        ▼
4. For each changed file:
        │
        ├───▶ calculateChanges(oldContent, newContent)
        │         │
        │         ▼
        │     Use diff.diffLines() to generate hunks
        │         │
        │         ▼
        │     Create FileChange { filePath, additions, deletions, hunks }
        │
        ▼
5. Emit onChange event with FileChange[]
        │
        ▼
6. ShepherdState.addChanges() receives changes
        │
        ├───▶ Capture current mtime for each file
        │         │
        │         ▼
        │     Store changes with detectedAt timestamp
        │
        ▼
7. State.notify() triggers all subscribers
        │
        ▼
8. UI components re-render with new changes
```

### Accept Changes Flow

```
1. User selects file in UI
        │
        ▼
2. User triggers "Accept File" action
        │
        ▼
3. ShepherdState.acceptAllInFile(filePath)
        │
        ├───▶ INTEGRITY CHECK
        │         │
        │         ├──▶ File still exists?
        │         ├──▶ Compare current mtime with stored mtime
        │         └──▶ Match? → Proceed / Mismatch? → Throw error
        │
        ▼
4. Remove file change from state
        │
        ▼
5. State.notify() triggers subscribers
        │
        ▼
6. UI updates (file removed from list)
        │
        ▼
7. If no more changes, show "All caught up!" message
```

---

## Module Organization

```
src/
├── index.ts              # MCP server entry point
├── cli.ts                # CLI entry point with commander
├── app.tsx               # Root React/Ink component
├── terminal.ts           # Tmux pane spawning logic
├── config.ts             # Global configuration loader
│
├── utils/
│   ├── logger.ts         # File + console logging
│   ├── config.ts         # Config file resolution
│   └── active-file-tracker.ts  # Context awareness
│
├── shepherd/
│   ├── watcher.ts        # File watching with diff calculation
│   ├── state.ts          # Central state management
│   └── render/
│       ├── summary-view.tsx   # Ink summary component
│       ├── diff-view.tsx      # Ink diff detail component
│       ├── blessed-ui.ts      # Blessed TUI
│       ├── blessed-diff-view.ts
│       ├── terminal-kit-ui.ts # terminal-kit UI
│       └── terminal-kit-diff-view.ts
│
├── components/
│   └── Button.tsx        # Reusable button component
│
└── hooks/
    └── useMouse.ts       # Mouse interaction hook
```

---

## Design Patterns

### 1. Observer Pattern (Subscription)

Used in `ShepherdState` for reactive updates:

```typescript
class ShepherdState {
  private subscribers: Set<() => void> = new Set();

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify(): void {
    this.subscribers.forEach(cb => cb());
  }
}
```

### 2. Strategy Pattern (UI Backends)

Multiple UI implementations sharing a common interface:

```typescript
// Each UI backend implements the same pattern:
// - Create terminal/screen
// - Subscribe to state changes
// - Render on update
// - Handle user input
// - Cleanup on exit
```

### 3. Snapshot Pattern

FileWatcher uses snapshots to detect changes:

```typescript
interface FileSnapshot {
  filePath: string;
  content: string;
  mtime: number;
}

// Compare snapshots to calculate diffs
```

### 4. Guard Pattern (Security)

Input validation functions prevent attacks:

```typescript
function validatePath(inputPath: string): string | null {
  // Reject traversal attempts
  if (inputPath.includes("..")) return null;
  return resolve(inputPath);
}
```

### 5. Factory Pattern (MCP Tools)

Tool definitions are declarative:

```typescript
export const MCP_TOOLS = [
  { name: "start_diff_shepherd", ... },
  { name: "set_focus_file", ... },
  // ...
];
```

---

## Technology Stack

### Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| TypeScript | 5.7.2 | Type safety |
| diff | 5.2.0 | Diff calculation |
| minimatch | 10.1.1 | Pattern matching |
| chokidar | 4.0.1 | File system events (备用) |

### UI Frameworks

| Package | Purpose |
|---------|---------|
| React | 19.2.3 | UI framework |
| Ink | 6.6.0 | Terminal React renderer |
| Blessed | 0.1.81 | Terminal UI library |
| terminal-kit | 3.1.2 | Alternative terminal UI |

### MCP & CLI

| Package | Purpose |
|---------|---------|
| Commander | 14.0.2 | CLI argument parsing |
| child_process | Built-in | Process spawning (tmux) |

### Development

| Package | Purpose |
|---------|---------|
| tsx | 4.21.0 | TypeScript execution |
| @types/* | Various | Type definitions |

---

## Security Architecture

### Input Validation

```
User Input
    │
    ▼
┌─────────────────────────┐
│  validatePath()         │  ← Reject "..", "~"
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  validateSessionId()    │  ← Alphanumeric only
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  Shell Escape           │  ← Quote arguments
└──────────┬──────────────┘
           │
           ▼
    Safe System Call
```

### Path Traversal Protection

```
┌─────────────────────────────────────────────────┐
│  isPathWithinDirectory(parent, child)          │
├─────────────────────────────────────────────────┤
│  1. Resolve both paths absolutely              │
│  2. Calculate relative path                    │
│  3. Check if relative path starts with ".."    │
│  4. Reject if traversal detected               │
└─────────────────────────────────────────────────┘
```

---

## Performance Considerations

### Polling Optimization

- Configurable poll interval (default: 15s)
- Skip polling during high system load
- Debounce rapid successive changes

### Memory Management

- Limit max files scanned (default: 10,000)
- Limit scan depth (default: 20 levels)
- Timeout for long scans (default: 30s)

### Large File Handling

- Stream file reading for large files
- Truncate diff display for long hunks
- Skip binary files automatically

---

## Future Architecture Improvements

### 1. Concurrency

```typescript
// Use worker threads for file scanning
const worker = new Worker("./file-scanner.worker.js");
```

### 2. Caching

```typescript
// Cache file contents to reduce I/O
const contentCache = new LRUCache<string, string>(1000);
```

### 3. Event-based Watching

```typescript
// Optional: Use chokidar for live watching
if (options.useLiveWatching) {
  const watcher = chokidar.watch(directory);
  watcher.on("change", ...);
}
```

---

**Last Updated:** 2026-01-13
**Version:** 0.1.0
