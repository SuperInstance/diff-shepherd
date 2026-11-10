# 🐑 Diff Shepherd

**Batch code review for AI pair programming, without breaking your flow.**

Diff Shepherd is a Claude Code plugin that watches your workspace for changes made by Claude, presents them in a batched, non-intrusive side panel, and lets you review & accept them with keyboard shortcuts—all without leaving your terminal.

> **The Vision:** You stay focused on `main.c`. Claude refactors `utils.py`. Every 15 seconds, a subtle flash tells you "changes are ready." You press a key, tab through the diffs, hit `A` to accept all, and continue typing. No context switches.

## ✨ Features

- **🕰️ Batch-Oriented Polling:** Checks for changes every 15 seconds (configurable). No live-typing distraction.
- **🎨 Terminal-Native TUI:** A beautiful, keyboard-driven interface using React (via `ink`).
- **🧠 Context-Aware:** Knows which file you're actively editing and prioritizes its changes.
- **✅ Smart Acceptance:** Accept all changes in the current file, or accept the entire batch.
- **🔧 Fully Configurable:** Set poll intervals, ignore patterns, and color themes.
- **🤝 MCP Native:** Integrates seamlessly with Claude Code as a Model Context Protocol server.
- **📝 Integrity Checking:** Verifies files haven't changed since diff was calculated before accepting.
- **📊 Logging:** Debug information logged to `~/.diff-shepherd/logs/` for troubleshooting.

## 📦 Installation

### Prerequisites
- **Node.js** (v18 or higher) and `npm`
- **Claude Code** installed and configured
- **Tmux** (for the automatic side-pane experience)

### Quick Install
1. Clone or navigate to the repository:
   ```bash
   cd /path/to/diff-shepherd
   ```
2. Install dependencies and set up the MCP server:
   ```bash
   ./install.sh
   ```
3. Restart your Claude Code terminal session.

### Manual Setup
If the script isn't for you, manually add the server to your Claude Code MCP configuration (`~/.config/claude-code/mcp_servers.json`):
```json
{
  "diff-shepherd": {
    "command": "npx",
    "args": ["tsx", "/absolute/path/to/diff-shepherd/src/index.ts"]
  }
}
```

## 🚀 Usage

### Starting Diff Shepherd

**From Claude Code:**
```
"Start Diff Shepherd to review changes"
```

**From command line:**
```bash
diff-shepherd start /path/to/project
```

### The Interface

```
┌─────────────────────────────────────────┐
│ 🔄 Diff Shepherd                        │
│  • 3 files changed (+120, -73)           │
│  • 1 in your active file                 │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📁 You are editing: /home/user/app.ts  │
└─────────────────────────────────────────┘

[↑/j] Down [↓/k] Up [Enter] View Diff [a] Accept File [A] Accept All [q] Quit

   /home/user/app.ts                     📁 • You are editing this file  +45 -12
   /home/user/utils.ts                                                  +30 -20
   /home/user/types.ts                                                  +45 -41
```

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `j` | Move up through file list |
| `↓` / `k` | Move down through file list |
| `Enter` | View detailed diff for selected file |
| `a` | Accept changes in selected file |
| `A` | Accept all changes (smart - active file first) |
| `Esc` | Return to summary from diff view |
| `q` | Quit Diff Shepherd |

## 🎯 MCP Tools

### `start_diff_shepherd`

Start Diff Shepherd in a tmux side panel to watch for code changes.

**Parameters:**
- `directory` (string, optional): Directory to watch for changes (default: current working directory)
- `id` (string, optional): Session identifier for the shepherd (default: "shepherd-1")

**Example:**
```json
{
  "directory": "/home/user/project",
  "id": "my-project-shepherd"
}
```

### `set_focus_file`

Manually set the file you're currently editing for context-aware highlighting.

**Parameters:**
- `filePath` (string, required): Path to the file you're currently editing

**Example:**
```json
{
  "filePath": "/home/user/project/src/app.ts"
}
```

### `clear_focus_file`

Clear the manual focus file and enable automatic detection from tmux.

## ⚙️ Configuration

Create `~/.config/diff-shepherd/config.json` or `config.json` in the project root:

```json
{
  "pollInterval": 15000,
  "diffDisplayStyle": "foreground",
  "ignorePatterns": [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/*.log",
    "**/.claude/**"
  ]
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pollInterval` | number | `15000` | File watching interval in milliseconds |
| `diffDisplayStyle` | string | `"foreground"` | Display style: `"foreground"` or `"background"` |
| `ignorePatterns` | string[] | `[...]` | Glob patterns for files/directories to ignore |

## 🏗️ Architecture

### Project Structure
```
diff-shepherd/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── cli.ts                # CLI commands
│   ├── app.tsx               # Main React component
│   ├── terminal.ts           # Tmux pane spawning
│   ├── config.ts             # Configuration loader
│   ├── utils/
│   │   ├── logger.ts         # File + console logging
│   │   └── active-file-tracker.ts  # Context awareness
│   └── shepherd/
│       ├── watcher.ts        # File watching + diffs
│       ├── state.ts          # State management
│       └── render/
│           ├── summary-view.tsx   # Summary UI
│           └── diff-view.tsx      # Diff UI
└── bin/
    └── diff-shepherd        # CLI launcher
```

### Key Components

- **FileWatcher**: Polls filesystem every 15s, calculates diffs using the `diff` library
- **ShepherdState**: Manages pending changes, active file context, and accept/reject operations
- **ActiveFileTracker**: Detects which file you're editing from tmux pane title/command
- **SummaryView**: Ink component showing all pending changes with keyboard navigation
- **DiffView**: Detailed diff viewer with green/red foreground highlighting

## 🧪 Development

### Running Tests

```bash
# Run the smoke test suite
npx tsx test-smoke.ts
```

### TypeScript Build

```bash
# Verify compilation
npx tsc --noEmit
```

### CLI Commands

```bash
# Start watching directory
npm run start -- /path/to/project

# Spawn in tmux pane
npm run start -- spawn /path/to/project

# Show in current terminal
npm run start -- show /path/to/project
```

## 🐛 Troubleshooting

### "tmux session is no longer active"

**Problem:** The tmux session was closed.

**Solution:** Start a new tmux session:
```bash
tmux new-session -d
tmux attach
```

### Changes not detected

**Problem:** Poll interval too long or file not in watched directory.

**Solution:**
- Reduce `pollInterval` in config.json
- Ensure you're watching the correct directory
- Check that files don't match ignore patterns

### Pane not spawning

**Problem:** Not in a tmux session.

**Solution:**
- Install tmux: `sudo apt-get install tmux` (Ubuntu) or `brew install tmux` (macOS)
- Start inside tmux: `tmux new-session`

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📚 See Also

- [Claude Code Documentation](https://code.anthropic.com)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Ink - React for CLIs](https://github.com/vadimdemedes/ink)
# Test change
# Test change do you see me?
# Test change 
