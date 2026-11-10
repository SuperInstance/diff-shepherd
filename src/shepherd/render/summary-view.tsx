import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { ShepherdState } from "../state.js";
import type { FileChange } from "../watcher.js";

interface SummaryViewProps {
  state: ShepherdState;
}

export function SummaryView({ state }: SummaryViewProps) {
  const { exit } = useApp();
  const [updateFlash, setUpdateFlash] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileChange | undefined>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [userContext, setUserContext] = useState(state.getUserContext());

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = state.subscribe(() => {
      const file = state.getSelectedFile();
      setSelectedFile(file);
      setSelectedIndex(state.getSelectedFileIndex());
      setUserContext(state.getUserContext());

      // Flash on update (subtle indicator)
      setUpdateFlash(true);
      setTimeout(() => setUpdateFlash(false), 500);
    });

    // Initial state
    setSelectedFile(state.getSelectedFile());
    setSelectedIndex(state.getSelectedFileIndex());
    setUserContext(state.getUserContext());

    return unsubscribe;
  }, [state]);

  // Handle keyboard input and basic mouse detection
  useInput(async (input, key) => {
    if (key.return && selectedFile) {
      // Enter to view diff
      state.enterDiffView();
    } else if (key.upArrow || input === "k") {
      // Up arrow or k to move up
      state.selectPreviousFile();
    } else if (key.downArrow || input === "j") {
      // Down arrow or j to move down
      state.selectNextFile();
    } else if ((key.ctrl && input === "a") || input === "A") {
      // Ctrl+A or A to accept all (smart)
      // Use smart accept if active file changes exist
      const activeChanges = state.getActiveFileChanges();
      if (activeChanges.length > 0) {
        await state.acceptAllSmart();
      } else {
        state.acceptAll();
      }
    } else if (input === "a") {
      // a to accept selected file
      if (selectedFile) {
        await state.acceptAllInFile(selectedFile.filePath);
      }
    } else if (input === "r") {
      // r to reject selected file and go to next
      if (selectedFile) {
        state.rejectSelectedFile();
      }
    } else if ((key.ctrl && input === "r") || input === "R") {
      // Ctrl+R or R to reject all changes
      state.rejectAll();
    } else if (key.escape || (key.ctrl && input === "c") || input === "q") {
      // Escape or Ctrl+C or q to quit
      exit();
    }
    // Mouse click detection (basic)
    // Note: Ink's useInput doesn't directly support mouse coordinates
    // For full mouse support, we'd need a custom implementation
  });

  const summary = state.getSummary();
  const changes = state.getChanges();
  const activeFileChanges = state.getActiveFileChanges();

  // Subtle indicator: symbol and border color change on update
  const statusSymbol = updateFlash ? "🔄" : "🐑";
  const borderColor = updateFlash ? "yellow" : "green";

  // Active file indicator
  const hasActiveFileChanges = activeFileChanges.length > 0;
  const activeFilePath = userContext.activeFilePath;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box
        key="summary-header"
        paddingX={1}
        paddingY={1}
        marginBottom={1}
        borderStyle="double"
        borderColor={borderColor}
        flexDirection="column"
      >
        <Text bold color="green" key="summary-title">
          {statusSymbol} Diff Shepherd
        </Text>
        {changes.length > 0 ? (
          <Box key="summary-changes-box" flexDirection="column">
            <Text key="summary-changes-text">
              {" "}
              • {changes.length} file{changes.length !== 1 ? "s" : ""} changed{" "}
              <Text key="summary-additions-stat" color="green">(+{summary.additions})</Text>{" "}
              <Text key="summary-deletions-stat" color="red">(-{summary.deletions})</Text>
            </Text>
            {hasActiveFileChanges && (
              <Text key="summary-active" bold color="yellow">
                {" "}
                • {activeFileChanges.length} in your active file
              </Text>
            )}
          </Box>
        ) : (
          <Text key="summary-no-changes" dimColor> • No pending changes</Text>
        )}
      </Box>

      {/* Active file banner */}
      {hasActiveFileChanges && activeFilePath && (
        <Box
          key="summary-active-banner"
          backgroundColor="yellow"
          paddingX={1}
          paddingY={1}
          marginBottom={1}
          borderStyle="round"
          borderColor="yellow"
        >
          <Text bold color="black">
            📁 You are editing: {activeFilePath}
          </Text>
        </Box>
      )}

      {/* Instructions */}
      <Box key="summary-instructions" marginBottom={1} paddingX={1}>
        <Text dimColor>
          [↑/j] Down [↓/k] Up [Enter] View Diff [a] Accept File [A] Accept All
          [r] Reject File + Next [R] Reject All [q] Quit
        </Text>
      </Box>

      {/* File list */}
      {changes.length === 0 ? (
        <Box key="summary-empty-state" paddingX={1}>
          <Text dimColor>Watching for file changes...</Text>
        </Box>
      ) : (
        <Box key="summary-file-list" flexDirection="column">
          {changes.map((change, index) => {
            const isSelected = index === selectedIndex;
            const isActive = state.isFileActive(change.filePath);
            const relativePath = change.filePath;

            return (
              <Box
                key={change.filePath}
                backgroundColor={isSelected ? "blue" : isActive ? "yellow" : undefined}
                paddingX={1}
                paddingY={1}
              >
                <Text
                  key="summary-file-name"
                  bold={isSelected || isActive}
                  color={isSelected ? "white" : isActive ? "black" : undefined}
                >
                  {isSelected ? "► " : isActive ? "📁 " : "  "}
                  {relativePath}
                  {isActive && (
                    <Text key="summary-active-indicator" bold color="black">
                      {" "}• You are editing this file
                    </Text>
                  )}
                </Text>
                <Text
                  key="summary-file-stats"
                  color={isActive ? "black" : "grey"}
                >
                  {" "}
                  <Text key="summary-file-additions" color={isActive ? "greenBlack" : "green"}>+{change.additions}</Text>{" "}
                  <Text key="summary-file-deletions" color={isActive ? "redBlack" : "red"}>-{change.deletions}</Text>
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
