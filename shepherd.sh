#!/bin/bash
# Diff Shepherd - One-command startup with tmux split-panel

SESSION="shepherd"

# Get the script's directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if tmux is installed
if ! command -v tmux &> /dev/null; then
    echo "Error: tmux is not installed. Install it first:"
    echo "  Ubuntu/Debian: sudo apt-get install tmux"
    echo "  macOS: brew install tmux"
    exit 1
fi

# Kill existing session if it exists
tmux has-session -t "$SESSION" 2>/dev/null && tmux kill-session -t "$SESSION"

# Create new session with work terminal in first pane
tmux new-session -d -s "$SESSION" -n "shepherd"

# Split window vertically (creates new pane on right)
tmux split-window -h -t "$SESSION:0"

# Start Diff Shepherd in right pane (pane 1) with terminal-kit UI
tmux send-keys -t "$SESSION:0.1" "cd '$SCRIPT_DIR' && npx tsx src/cli.ts terminal-kit" "Enter"

# Start work terminal in left pane (pane 0)
tmux send-keys -t "$SESSION:0.0" "cd '$SCRIPT_DIR'" "Enter"

# Switch to work pane (left)
tmux select-pane -t "$SESSION:0.0"

# Attach to the session
tmux attach-session -t "$SESSION"
