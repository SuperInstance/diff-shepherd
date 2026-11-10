#!/bin/bash
# Diff Shepherd Installation Script
# This script installs Diff Shepherd as an MCP server for Claude Code

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Diff Shepherd - Installation Script               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

echo -e "${GREEN}• Project directory: ${PROJECT_DIR}${NC}"

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm is not installed. Please install Node.js and npm first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ npm found${NC}"

# Install dependencies
echo ""
echo -e "${BLUE}Installing dependencies...${NC}"
npm install --silent
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Build the project
echo ""
echo -e "${BLUE}Building Diff Shepherd...${NC}"
npx tsc --noEmit
echo -e "${GREEN}✓ Build successful${NC}"

# Make the CLI executable
chmod +x "$PROJECT_DIR/bin/diff-shepherd"
echo -e "${GREEN}✓ CLI made executable${NC}"

# Check if Claude Code's MCP config exists
CLAUDE_CONFIG_DIR="$HOME/.config/claude-code"
CLAUDE_MCP_FILE="$CLAUDE_CONFIG_DIR/mcp_servers.json"

# Create the config directory if it doesn't exist
mkdir -p "$CLAUDE_CONFIG_DIR"

# Add Diff Shepherd to MCP servers configuration
if [ -f "$CLAUDE_MCP_FILE" ]; then
    echo ""
    echo -e "${YELLOW}Existing MCP configuration found at: $CLAUDE_MCP_FILE${NC}"

    # Check if diff-shepherd is already configured
    if grep -q '"diff-shepherd"' "$CLAUDE_MCP_FILE"; then
        echo -e "${YELLOW}• Diff Shepherd is already configured in Claude Code MCP${NC}"
    else
        echo -e "${BLUE}Adding Diff Shepherd to MCP configuration...${NC}"

        # Create a backup
        cp "$CLAUDE_MCP_FILE" "$CLAUDE_MCP_FILE.backup"

        # Add diff-shepherd to the existing config
        if command -v jq &> /dev/null; then
            # Use jq to add the new server
            tmp=$(mktemp)
            jq ".\"diff-shepherd\" = {
                \"command\": \"node\",
                \"args\": [\"-e\", \"require('$PROJECT_DIR/src/index.ts')\"]
            }" "$CLAUDE_MCP_FILE" > "$tmp"
            mv "$tmp" "$CLAUDE_MCP_FILE"
        else
            echo -e "${YELLOW}• jq not found, manual configuration may be required${NC}"
            echo ""
            echo -e "${YELLOW}Please add the following to $CLAUDE_MCP_FILE:${NC}"
            echo ""
            echo -e "${GREEN}  \"diff-shepherd\": {${NC}"
            echo -e "${GREEN}    \"command\": \"node\",${NC}"
            echo -e "${GREEN}    \"args\": [\"-e\", \"require('$PROJECT_DIR/src/index.ts')\"]${NC}"
            echo -e "${GREEN}  }${NC}"
        fi
    fi
else
    echo ""
    echo -e "${BLUE}Creating new MCP configuration...${NC}"

    # Create the MCP config file
    cat > "$CLAUDE_MCP_FILE" << EOF
{
  "diff-shepherd": {
    "command": "node",
    "args": ["-e", "require('$PROJECT_DIR/src/index.ts')"]
  }
}
EOF

    echo -e "${GREEN}✓ MCP configuration created at: $CLAUDE_MCP_FILE${NC}"
fi

# Check if tmux is installed
echo ""
if command -v tmux &> /dev/null; then
    echo -e "${GREEN}✓ tmux found (required for shepherd panel)${NC}"
else
    echo -e "${RED}✗ tmux is not installed${NC}"
    echo -e "${YELLOW}  Install tmux for the best experience: ${NC}"
    echo -e "${YELLOW}  • macOS: brew install tmux${NC}"
    echo -e "${YELLOW}  • Ubuntu/Debian: sudo apt-get install tmux${NC}"
    echo -e "${YELLOW}  • Arch: sudo pacman -S tmux${NC}"
fi

# Summary
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Installation Complete!                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Usage:${NC}"
echo -e "${YELLOW}  1. Restart Claude Code${NC}"
echo -e "${YELLOW}  2. In Claude, use: ${NC}${GREEN}\"Start Diff Shepherd to review changes\"${NC}"
echo ""
echo -e "${BLUE}Or run directly from the command line:${NC}"
echo -e "${YELLOW}  $ diff-shepherd start /path/to/project${NC}"
echo ""
echo -e "${BLUE}For more information, see USER_GUIDE.md${NC}"
echo ""
