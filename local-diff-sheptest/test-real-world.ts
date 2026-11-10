#!/usr/bin/env node
/**
 * Real-world test for Diff Shepherd
 * Tests various edge cases and error scenarios
 */

import { writeFile, readFile, stat, unlink } from "fs/promises";
import { join } from "path";
import { ShepherdState } from "../src/shepherd/state.js";
import { FileWatcher } from "../src/shepherd/watcher.js";
import { getLogger } from "../src/utils/logger.js";

const logger = getLogger(LogLevel.INFO);

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testFileWatcherEdgeCases() {
  logger.info("🧪 Testing FileWatcher Edge Cases");

  const testDir = "/tmp/diff-shepherd-real-test";
  const state = new ShepherdState();
  let watcherStarted = false;
  let watcherStopped = false;

  // Test 1: Rapid file modifications
  logger.info("Test 1: Rapid file modifications");
  const watcher = new FileWatcher(testDir, {
    onChange: (changes) => {
      logger.info(`Detected ${changes.length} changes during rapid test`);
      state.addChanges(changes);
    },
    onError: (error) => {
      logger.warn(`Watcher error: ${error.message}`);
    }
  }, { pollInterval: 1000 });

  watcher.start();
  watcherStarted = true;

  // Create and modify file rapidly
  const testFile = join(testDir, "rapid-test.txt");
  await writeFile(testFile, "initial content");
  await sleep(500);

  for (let i = 0; i < 5; i++) {
    await writeFile(testFile, `rapid change ${i} ${new Date().toISOString()}`);
    await sleep(200);
  }

  await sleep(2000); // Wait for watcher to catch up

  // Test 2: Large file handling
  logger.info("Test 2: Large file handling");
  const largeFile = join(testDir, "large-file.txt");
  const largeContent = "x".repeat(100000); // 100KB file
  await writeFile(largeFile, largeContent);
  await writeFile(largeFile, largeContent + "\nadditional line\n");
  await sleep(2000);

  // Test 3: Binary file handling
  logger.info("Test 3: Binary file handling");
  const binaryFile = join(testDir, "binary.bin");
  const binaryBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
  await writeFile(binaryFile, binaryBuffer);
  await writeFile(binaryFile, Buffer.concat([binaryBuffer, Buffer.from("more data")]));
  await sleep(2000);

  // Test 4: Permission issues
  logger.info("Test 4: Permission issues (simulated)");
  const restrictedFile = join(testDir, "restricted.txt");
  await writeFile(restrictedFile, "should be readable");
  // Note: Can't actually change permissions in test environment easily

  watcher.stop();
  watcherStopped = true;

  logger.info(`📊 Final state: ${state.getChanges().length} changes tracked`);
  return { state, watcherStarted, watcherStopped };
}

async function testStateManagementEdgeCases() {
  logger.info("🧪 Testing State Management Edge Cases");

  const state = new ShepherdState();

  // Test concurrent modifications
  logger.info("Test: Concurrent file modifications");
  const testFile = "/tmp/concurrent-test.txt";

  // Simulate multiple rapid changes
  for (let i = 0; i < 10; i++) {
    state.addChanges([{
      filePath: testFile,
      additions: 1,
      deletions: 0,
      hunks: [{
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        lines: [{ type: "added", content: `line ${i}` }]
      }]
    }]);
    await sleep(50);
  }

  logger.info(`After concurrent adds: ${state.getChanges().length} files`);

  // Test integrity checking with non-existent files
  logger.info("Test: Integrity checking with missing files");
  const result = await state.acceptAllInFile("/non/existent/file.txt");
  logger.info(`Accept non-existent file: ${result.success} - ${result.reason}`);

  // Test smart accept with empty state
  logger.info("Test: Smart accept with empty state");
  const smartResult = await state.acceptAllSmart();
  logger.info(`Smart accept result: ${smartResult.accepted.length} accepted, ${smartResult.failed.length} failed`);

  return state;
}

async function testTmuxIntegration() {
  logger.info("🧪 Testing Tmux Integration");

  // Check if we're in tmux
  const inTmux = !!process.env.TMUX;
  logger.info(`Current environment in tmux: ${inTmux}`);

  if (inTmux) {
    logger.info(`TMUX_PANE: ${process.env.TMUX_PANE || 'not set'}`);
    logger.info(`TMUX session: ${process.env.TMUX || 'not set'}`);
  } else {
    logger.warn("Not running in tmux - some features will be limited");
  }

  // Test terminal detection
  const { detectTerminal } = await import("../src/terminal.js");
  const terminal = detectTerminal();
  logger.info(`Terminal detected: ${terminal.summary}${terminal.sessionName ? ` (${terminal.sessionName})` : ''}`);
}

async function main() {
  logger.info("🚀 Starting Real-World Diff Shepherd Test");

  try {
    // Create test directory
    const { mkdir } = await import("fs/promises");
    await mkdir("/tmp/diff-shepherd-real-test", { recursive: true });

    // Run tests
    const watcherTest = await testFileWatcherEdgeCases();
    const stateTest = await testStateManagementEdgeCases();
    await testTmuxIntegration();

    // Cleanup
    const { unlink } = await import("fs/promises");
    try {
      await unlink("/tmp/diff-shepherd-real-test/rapid-test.txt");
      await unlink("/tmp/diff-shepherd-real-test/large-file.txt");
      await unlink("/tmp/diff-shepherd-real-test/binary.bin");
      await unlink("/tmp/diff-shepherd-real-test/restricted.txt");
    } catch {}

    logger.info("✅ All real-world tests completed successfully");

  } catch (error) {
    logger.error("❌ Test failed", { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
}

main().catch(console.error);