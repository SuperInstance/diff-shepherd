# Diff Shepherd - User Guide

## The Vision

**Diff Shepherd** is a non-intrusive, batch-review interface for Claude Code changes. It solves a common problem: when Claude makes multiple file changes, reviewing them one-by-one interrupts your flow. With Diff Shepherd, all pending changes appear in a side panel where you can review and accept them in bulk.

### Key Features

- **Batch Review**: See all pending changes at once
- **Context-Aware**: Knows which file you're actively editing
- **Non-Intrusive**: Runs in a tmux side panel, doesn't block Claude
- **Smart Accept**: Prioritizes changes in your active file
- **Integrity Checks**: Verifies files haven't changed since diff was calculated

---

## Installation

### Prerequisites

- **Node.js** (v18 or higher)
- **tmux** (for the side panel experience)
- **Claude Code** (with MCP support)

### Quick Install

Run the installation script:

```bash
cd /path/to/diff-shepherd
./install.sh
```

### Manual Install

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Make CLI executable:**
   ```bash
   chmod +x bin/diff-shepherd
   ```

3. **Add to Claude Code MCP:**

   Edit `~/.config/claude-code/mcp_servers.json`:

   ```json
   {
     "diff-shepherd": {
       "command": "node",
       "args": ["-e", "require('/absolute/path/to/diff-shepherd/src/index.ts')"]
     }
   }
   ```

4. **Restart Claude Code**

---

## Basic Workflow

### Starting Diff Shepherd

**Option 1: From Claude Code**
```
"Start Diff Shepherd to review changes"
```

**Option 2: From command line**
```bash
diff-shepherd start /path/to/project
```

### Using the Interface

Once started, Diff Shepherd opens in a tmux side panel:

```
┌─────────────────────────────────────────┐
│ 🐑 Diff Shepherd                        │
│  • 3 files changed (+120, -73)           │
│  • 1 in your active file                 │
└─────────────────────────────────────────┘

[↑/j] Down [↓/k] Up [Enter] View Diff [a] Accept File [A] Accept All [q] Quit

   /home/user/app.ts                     📁 • You are editing this file  +45 -12
   /home/user/utils.ts                                                  +30 -20
   /home/user/types.ts                                                  +45 -41
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `j` | Move up |
| `↓` / `k` | Move down |
| `Enter` | View diff for selected file |
| `a` | Accept selected file |
| `A` | Accept all files (smart - active file first) |
| `Esc` | Back to summary (from diff view) |
| `q` | Quit Diff Shepherd |

---

## Features in Detail

### Context Awareness

Diff Shepherd knows which file you're actively editing:

- **Yellow banner**: Shows "📁 You are editing: {filepath}"
- **Yellow highlighting**: Active files have yellow background
- **Smart Accept**: Pressing `A` accepts active file changes first

### Diff View

Press `Enter` on any file to see the detailed diff:

```
@@ -1,3 +1,4 @@
 Line 1
-Line 2
+Line 2 modified
 Line 3
+Line 4 added
```

- **Green (+)**: Added lines
- **Red (-)**: Removed lines
- `a`: Accept all in this file
- `A`: Accept all changes (batch)
- `Esc`: Back to summary

### Integrity Checking

Diff Shepherd won't let you accept changes if:
- The file was modified after the diff was calculated
- The file no longer exists
- The file is inaccessible

This prevents accepting stale or incorrect changes.

---

## Configuration

### Config File

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

| Option | Default | Description |
|--------|---------|-------------|
| `pollInterval` | `15000` | File watching interval (ms) |
| `diffDisplayStyle` | `"foreground"` | `"foreground"` or `"background"` |
| `ignorePatterns` | `["**/node_modules/**", ...]` | Glob patterns to ignore |

---

## MCP Tools

### `start_diff_shepherd`

Start Diff Shepherd in a side panel.

```json
{
  "directory": "/path/to/project",
  "id": "shepherd-1"
}
```

### `set_focus_file`

Manually set the file you're editing (for context-aware highlighting).

```json
{
  "filePath": "/home/user/project/app.ts"
}
```

### `clear_focus_file`

Clear manual focus file and enable auto-detection from tmux.

---

## Troubleshooting

### "tmux session is no longer active"

**Problem**: The tmux session was closed.

**Solution**: Start a new tmux session:
```bash
tmux new-session -d
tmux attach
```

### Changes not detected

**Problem**: Poll interval too long or file not in watched directory.

**Solution**:
- Reduce `pollInterval` in config.json
- Ensure you're watching the correct directory
- Check that files match ignore patterns

### Pane not spawning

**Problem**: Tmux not available or not in a tmux session.

**Solution**:
- Install tmux: `sudo apt-get install tmux` (Ubuntu) or `brew install tmux` (macOS)
- Start inside tmux: `tmux new-session`

---

## Tips & Tricks

1. **Run once per session**: Start Diff Shepherd when you begin a coding session and leave it running
2. **Use context awareness**: Edit files normally; Diff Shepherd will highlight what you're working on
3. **Smart accept**: Use `A` to accept active file changes first, then review others
4. **Custom ignore**: Add patterns to `ignorePatterns` in config.json to exclude noise
5. **Manual focus**: Use `set_focus_file` if auto-detection doesn't work with your editor

---

## Uninstallation

To remove Diff Shepherd from Claude Code:

1. Edit `~/.config/claude-code/mcp_servers.json`
2. Remove the `"diff-shepherd"` entry
3. Restart Claude Code

To remove the project entirely:

```bash
rm -rf /path/to/diff-shepherd
rm -rf ~/.config/diff-shepherd
rm -rf ~/.diff-shepherd
```

---

## Support

For issues, questions, or contributions, please visit the project repository.
