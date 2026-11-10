# Diff Shepherd - API Reference

Complete API documentation for the diff-shepherd TypeScript library.

## Table of Contents

- [Core Types](#core-types)
- [FileWatcher API](#filewatcher-api)
- [ShepherdState API](#shepherdstate-api)
- [MCP Server API](#mcp-server-api)
- [UI Components](#ui-components)

---

## Core Types

### FileSnapshot

Represents a snapshot of a file at a specific point in time.

```typescript
interface FileSnapshot {
  filePath: string;    // Absolute path to the file
  content: string;     // File contents
  mtime: number;       // Modification time in milliseconds (Epoch)
}
```

**Usage:**
```typescript
const snapshot: FileSnapshot = {
  filePath: "/path/to/file.ts",
  content: "export function hello() {}",
  mtime: 1705171200000
};
```

---

### FileChange

Represents changes detected between two file snapshots.

```typescript
interface FileChange {
  filePath: string;           // Absolute path to the changed file
  additions: number;          // Number of lines added
  deletions: number;          // Number of lines deleted
  hunks: DiffHunk[];          // Array of diff hunks
  detectedAt?: Date;          // When the change was detected (ShepherdState)
  currentMtime?: number;      // Current file modification time (ShepherdState)
}
```

**Usage:**
```typescript
const change: FileChange = {
  filePath: "/path/to/file.ts",
  additions: 5,
  deletions: 2,
  hunks: [
    {
      oldStart: 10,
      oldLines: 2,
      newStart: 10,
      newLines: 5,
      lines: [...]
    }
  ]
};
```

---

### DiffHunk

Represents a contiguous section of changes (diff hunk).

```typescript
interface DiffHunk {
  oldStart: number;    // Starting line number in old version
  oldLines: number;    // Number of lines in old version
  newStart: number;    // Starting line number in new version
  newLines: number;    // Number of lines in new version
  lines: DiffLine[];   // Array of changed lines
}
```

---

### DiffLine

Represents a single line in a diff hunk.

```typescript
interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;     // Line content (without the +/− prefix)
}
```

**Usage:**
```typescript
const line: DiffLine = {
  type: "added",
  content: "export function newFunction() {}"
};
```

---

### FileWatcherOptions

Configuration options for the FileWatcher.

```typescript
interface FileWatcherOptions {
  pollInterval?: number;      // Polling interval in milliseconds (default: 15000)
  ignored?: string[];         // Minimatch patterns to ignore (default: [])
  maxDepth?: number;          // Maximum directory depth to scan (default: 20)
  maxFiles?: number;          // Maximum files to scan (default: 10000)
  scanTimeout?: number;       // Timeout for file scanning in ms (default: 30000)
}
```

---

## FileWatcher API

### Class: FileWatcher

Monitors a directory for file changes and emits structured diff events.

#### Constructor

```typescript
constructor(directory: string, options?: FileWatcherOptions)
```

**Parameters:**
- `directory` - Absolute path to the directory to watch
- `options` - Optional configuration options

**Example:**
```typescript
const watcher = new FileWatcher("/home/user/project", {
  pollInterval: 10000,
  ignored: ["node_modules/**", "*.log"],
  maxDepth: 10
});
```

---

#### Methods

##### start()

Start watching the directory for changes.

```typescript
start(): void
```

**Example:**
```typescript
watcher.start();
```

---

##### stop()

Stop watching the directory.

```typescript
stop(): void
```

**Example:**
```typescript
watcher.stop();
```

---

#### Events

The FileWatcher emits events through callback properties in options.

##### onChange

Called when file changes are detected.

```typescript
onChange?: (changes: FileChange[]) => void
```

**Example:**
```typescript
const watcher = new FileWatcher("/path/to/dir", {
  onChange: (changes) => {
    console.log(`Detected ${changes.length} file changes`);
    for (const change of changes) {
      console.log(`${change.filePath}: +${change.additions} -${change.deletions}`);
    }
  }
});
```

---

##### onError

Called when an error occurs during file watching.

```typescript
onError?: (error: Error, filePath?: string) => void
```

**Example:**
```typescript
const watcher = new FileWatcher("/path/to/dir", {
  onError: (error, filePath) => {
    console.error(`Error watching ${filePath || "directory"}:`, error.message);
  }
});
```

---

## ShepherdState API

### Class: ShepherdState

Manages the state of pending file changes with support for navigation, filtering, and bulk operations.

#### Constructor

```typescript
constructor()
```

**Example:**
```typescript
const state = new ShepherdState();
```

---

#### Methods

##### addChanges()

Add new file changes to the state.

```typescript
addChanges(changes: FileChange[]): Promise<void>
```

**Parameters:**
- `changes` - Array of file changes to add

**Example:**
```typescript
await state.addChanges([
  { filePath: "/path/to/file.ts", additions: 5, deletions: 2, hunks: [...] }
]);
```

---

##### getChanges()

Get all pending file changes.

```typescript
getChanges(): FileChange[]
```

**Returns:** Array of all pending file changes

**Example:**
```typescript
const changes = state.getChanges();
console.log(`Pending changes: ${changes.length}`);
```

---

##### getSelectedFile()

Get the currently selected file change.

```typescript
getSelectedFile(): FileChange | undefined
```

**Returns:** The selected file change or undefined

**Example:**
```typescript
const selected = state.getSelectedFile();
if (selected) {
  console.log(`Selected: ${selected.filePath}`);
}
```

---

##### getSelectedFileIndex()

Get the index of the currently selected file.

```typescript
getSelectedFileIndex(): number
```

**Returns:** Index of the selected file (-1 if no selection)

---

##### selectNextFile()

Select the next file in the list.

```typescript
selectNextFile(): void
```

---

##### selectPreviousFile()

Select the previous file in the list.

```typescript
selectPreviousFile(): void
```

---

##### acceptAllInFile()

Accept all changes for a specific file.

```typescript
acceptAllInFile(filePath: string): Promise<void>
```

**Parameters:**
- `filePath` - Path to the file to accept changes for

**Throws:** Error if file was modified since diff was calculated (integrity check)

**Example:**
```typescript
try {
  await state.acceptAllInFile("/path/to/file.ts");
  console.log("Changes accepted");
} catch (error) {
  console.error("File modified, cannot accept");
}
```

---

##### acceptAll()

Accept all pending changes.

```typescript
acceptAll(): void
```

---

##### acceptAllSmart()

Accept changes in the active file first, then all others.

```typescript
acceptAllSmart(): void
```

**Uses the active file tracking from `ActiveFileTracker` to prioritize the file the user is currently editing.**

---

##### rejectFile()

Reject all changes for a specific file.

```typescript
rejectFile(filePath: string): void
```

---

##### rejectSelectedFile()

Reject the currently selected file's changes.

```typescript
rejectSelectedFile(): void
```

---

##### rejectAll()

Reject all pending changes.

```typescript
rejectAll(): void
```

---

##### isFileActive()

Check if a file is currently active (being edited by the user).

```typescript
isFileActive(filePath: string): boolean
```

---

##### getActiveFileChanges()

Get changes for the currently active file.

```typescript
getActiveFileChanges(): FileChange[]
```

---

##### getSummary()

Get a summary of all pending changes.

```typescript
getSummary(): { additions: number; deletions: number; fileCount: number }
```

**Returns:** Object with total additions, deletions, and file count

---

##### subscribe()

Subscribe to state changes.

```typescript
subscribe(callback: () => void): () => void
```

**Parameters:**
- `callback` - Function to call when state changes

**Returns:** Unsubscribe function

**Example:**
```typescript
const unsubscribe = state.subscribe(() => {
  console.log("State changed!");
});

// Later: unsubscribe();
```

---

## MCP Server API

### MCP Tools

The diff-shepherd MCP server implements the Model Context Protocol for integration with AI assistants.

---

#### start_diff_shepherd

Start Diff Shepherd to review code changes in a tmux side panel.

**Input Schema:**
```typescript
{
  directory?: string;  // Directory to watch (default: current working directory)
  id?: string;         // Session identifier (default: "shepherd-1")
}
```

**Returns:** Success message with pane ID or error message

**Example:**
```json
{
  "name": "start_diff_shepherd",
  "arguments": {
    "directory": "/home/user/project",
    "id": "my-session"
  }
}
```

---

#### set_focus_file

Set the file the user is currently editing for context-aware highlighting.

**Input Schema:**
```typescript
{
  filePath: string;  // Path to the file being edited
}
```

**Returns:** Confirmation message

**Example:**
```json
{
  "name": "set_focus_file",
  "arguments": {
    "filePath": "/home/user/project/src/main.ts"
  }
}
```

---

#### clear_focus_file

Clear the manual focus file and enable auto-detection from tmux.

**Input Schema:**
```typescript
{} // No parameters
```

**Returns:** Confirmation message

---

## UI Components

### CLI Options

```typescript
interface CLIOptions {
  directory?: string;     // Directory to watch (default: current directory)
  id?: string;            // Session identifier (default: "shepherd-1")
  ui?: "ink" | "blessed" | "terminal-kit";  // UI backend (default: "ink")
}
```

---

### Configuration

Configuration is loaded from (in priority order):
1. `~/.config/diff-shepherd/config.json` (global)
2. `./config.json` (project root)
3. Default values in code

**Config Schema:**
```typescript
interface Config {
  pollInterval?: number;
  diffDisplayStyle?: "foreground" | "background";
  ignorePatterns?: string[];
}
```

---

## Usage Examples

### Basic File Watching

```typescript
import { FileWatcher } from "./shepherd/watcher.js";

const watcher = new FileWatcher("/path/to/project", {
  pollInterval: 5000,
  ignored: ["node_modules/**", "dist/**"]
});

watcher.start();
```

### State Management

```typescript
import { ShepherdState } from "./shepherd/state.js";

const state = new ShepherdState();

// Subscribe to changes
const unsubscribe = state.subscribe(() => {
  renderUI(state.getChanges());
});

// Add changes
await state.addChanges(detectedChanges);

// Accept all in active file
state.acceptAllSmart();
```

### MCP Integration

```typescript
// Via stdio
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"start_diff_shepherd","arguments":{"directory":"/path/to/project"}},"id":1}' | tsx src/index.ts
```

---

## Type Guards

### isFileChange()

Check if an object is a FileChange.

```typescript
function isFileChange(obj: unknown): obj is FileChange
```

---

### isValidFilePath()

Validate a file path for security.

```typescript
function isValidFilePath(path: string): boolean
```

---

**Last Updated:** 2026-01-13
**Version:** 0.1.0
