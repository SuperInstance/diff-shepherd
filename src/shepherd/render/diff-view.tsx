import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { ShepherdState } from "../state.js";
import type { FileChange, DiffLine } from "../watcher.js";

interface DiffViewProps {
  state: ShepherdState;
}

export function DiffView({ state }: DiffViewProps) {
  const { exit } = useApp();
  const [selectedFile, setSelectedFile] = useState<FileChange | undefined>();

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = state.subscribe(() => {
      setSelectedFile(state.getSelectedFile());
    });

    // Initial state
    setSelectedFile(state.getSelectedFile());

    return unsubscribe;
  }, [state]);

  // Handle keyboard input
  useInput(async (input, key) => {
    if (key.escape) {
      // Escape to go back to summary
      state.exitToSummary();
    } else if ((key.ctrl && input === "c") || input === "q") {
      // Ctrl+C or q to quit
      exit();
    } else if ((key.ctrl && input === "a") || input === "A") {
      // Ctrl+A or Shift+A to accept all batch
      state.acceptAll();
    } else if (input === "a") {
      // a to accept all in this file
      if (selectedFile) {
        await state.acceptAllInFile(selectedFile.filePath);
      }
    } else if (input === "r") {
      // r to reject this file
      if (selectedFile) {
        state.rejectFile(selectedFile.filePath);
      }
    } else if ((key.ctrl && input === "r") || input === "R") {
      // Ctrl+R or R to reject all changes
      state.rejectAll();
    }
  });

  if (!selectedFile) {
    return (
      <Box key="no-file" padding={1}>
        <Text dimColor>No file selected</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box
        key="diff-header"
        backgroundColor="blue"
        paddingX={1}
        paddingY={1}
        marginBottom={1}
        borderStyle="single"
        borderColor="blue"
        flexDirection="column"
      >
        <Text bold color="white">
          🐑 {selectedFile.filePath}
        </Text>
        <Text color="white">
          {" "}
          <Text key="diff-additions">+{selectedFile.additions}</Text> <Text key="diff-deletions">-{selectedFile.deletions}</Text> changes
        </Text>
      </Box>

      {/* Instructions */}
      <Box key="diff-instructions" marginBottom={1} paddingX={1}>
        <Text bold color="yellow">
          [a] Accept File [A] Accept All [r] Reject File [R] Reject All [Esc] Back [q] Quit
        </Text>
      </Box>

      {/* Diff content */}
      <Box key="diff-content-box" flexDirection="column">
        {selectedFile.hunks.map((hunk, hunkIndex) => (
          <Box key={`hunk-${hunk.oldStart}-${hunk.newStart}-${hunkIndex}`} flexDirection="column" marginBottom={1}>
            {/* Hunk header */}
            <Box key="hunk-header" marginBottom={1}>
              <Text bold color="cyan">
                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},
                {hunk.newLines} @@
              </Text>
            </Box>

            {/* Diff lines */}
            {hunk.lines.map((line, lineIndex) => (
              <DiffLineComponent key={`${hunkIndex}-${lineIndex}-${line.type}`} line={line} />
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

interface DiffLineComponentProps {
  line: DiffLine;
}

function DiffLineComponent({ line }: DiffLineComponentProps) {
  const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";

  // Use foreground colors with symbols for better terminal compatibility
  if (line.type === "added") {
    return (
      <Box key="added">
        <Text bold color="green">
          {prefix} {line.content || ""}
        </Text>
      </Box>
    );
  }

  if (line.type === "removed") {
    return (
      <Box key="removed">
        <Text bold color="red">
          {prefix} {line.content || ""}
        </Text>
      </Box>
    );
  }

  return (
    <Box key="unchanged">
      <Text dimColor color="grey">
        {prefix} {line.content || ""}
      </Text>
    </Box>
  );
}
