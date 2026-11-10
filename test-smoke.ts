#!/usr/bin/env node
/**
 * Smoke test for Diff Shepherd
 * Tests the FileWatcher and ShepherdState integration
 */

import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { FileWatcher } from "./src/shepherd/watcher.js";
import { ShepherdState } from "./src/shepherd/state.js";

// ANSI colors for output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log("");
  log("=".repeat(60), colors.cyan);
  log(` ${title}`, colors.cyan);
  log("=".repeat(60), colors.cyan);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSmokeTest(): Promise<boolean> {
  let testDir: string | null = null;
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Step 1: Create temporary directory
    logSection("Step 1: Creating Test Directory");
    testDir = await mkdtemp(join(tmpdir(), "diff-shepherd-test-"));
    log(`Created: ${testDir}`, colors.green);

    // Step 2: Initialize State
    logSection("Step 2: Initializing ShepherdState");
    const state = new ShepherdState();
    log("ShepherdState created", colors.green);

    // Subscribe to state changes
    let changeDetected = false;
    let detectedChanges: any[] = [];
    state.subscribe(() => {
      const changes = state.getChanges();
      if (changes.length > 0) {
        changeDetected = true;
        detectedChanges = changes;
      }
    });
    log("State listener attached", colors.green);

    // Step 3: Create FileWatcher
    logSection("Step 3: Creating FileWatcher");
    const watcher = new FileWatcher(
      testDir,
      {
        onChange: (changes) => {
          log(`Watcher detected ${changes.length} change(s)`, colors.yellow);
          for (const change of changes) {
            log(
              `  - ${change.filePath}: +${change.additions} -${change.deletions}`,
              colors.yellow
            );
          }
          state.addChanges(changes);
        },
      },
      {
        pollInterval: 2000, // 2 seconds for faster testing
      }
    );
    log("FileWatcher created (pollInterval: 2000ms)", colors.green);

    // Step 4: Start watching
    logSection("Step 4: Starting Watcher");
    watcher.start();
    log("Watcher started", colors.green);
    log("Waiting for initial snapshot...", colors.blue);

    // Wait for initial snapshot
    await sleep(3000);

    // Step 5: Create a test file
    logSection("Step 5: Creating Test File");
    const testFile = join(testDir, "test.txt");
    await writeFile(testFile, "Line 1\nLine 2\nLine 3");
    log(`Created: test.txt with 3 lines`, colors.green);

    // Wait for next poll
    log("Waiting for watcher to detect changes...", colors.blue);
    await sleep(3000);

    // Step 6: Check if change was detected
    logSection("Step 6: Verifying Detection");
    if (changeDetected) {
      log("✓ Change detected!", colors.green);
      testsPassed++;

      const summary = state.getSummary();
      log(`  Files changed: ${summary.fileCount}`, colors.cyan);
      log(`  Additions: ${summary.additions}`, colors.cyan);
      log(`  Deletions: ${summary.deletions}`, colors.cyan);

      // Verify the diff details
      if (detectedChanges.length > 0) {
        const change = detectedChanges[0];
        log(`  Hunks detected: ${change.hunks.length}`, colors.cyan);

        if (change.hunks.length > 0) {
          const hunk = change.hunks[0];
          log(`  First hunk:`, colors.cyan);
          log(`    - Old: ${hunk.oldStart}, ${hunk.oldLines} lines`, colors.cyan);
          log(`    - New: ${hunk.newStart}, ${hunk.newLines} lines`, colors.cyan);
          log(`    - Lines in hunk: ${hunk.lines.length}`, colors.cyan);

          // Check line details
          let addedCount = 0;
          let removedCount = 0;
          for (const line of hunk.lines) {
            if (line.type === "added") addedCount++;
            if (line.type === "removed") removedCount++;
          }
          log(`    - Added lines: ${addedCount}`, colors.cyan);
          log(`    - Removed lines: ${removedCount}`, colors.cyan);

          if (addedCount === 3 && removedCount === 0) {
            log("✓ Diff calculation correct!", colors.green);
            testsPassed++;
          } else {
            log(`✗ Diff calculation incorrect (expected 3 added, 0 removed)`, colors.red);
            testsFailed++;
          }
        }
      }
    } else {
      log("✗ No change detected", colors.red);
      testsFailed++;
    }

    // Step 7: Modify the file
    logSection("Step 7: Modifying Test File");
    await writeFile(testFile, "Line 1\nLine 2 modified\nLine 3\nLine 4 added");
    log("Modified: test.txt (changed line 2, added line 4)", colors.green);

    // Clear previous state changes
    state.acceptAll();
    changeDetected = false;
    detectedChanges = [];

    await sleep(3000);

    if (changeDetected) {
      log("✓ Modification detected!", colors.green);
      testsPassed++;

      const summary = state.getSummary();
      log(`  Additions: ${summary.additions}`, colors.cyan);
      log(`  Deletions: ${summary.deletions}`, colors.cyan);
    } else {
      log("✗ Modification not detected", colors.red);
      testsFailed++;
    }

    // Step 8: Test state acceptance
    logSection("Step 8: Testing State Acceptance");
    const beforeAccept = state.getChanges().length;
    log(`Changes before accept: ${beforeAccept}`, colors.cyan);

    state.acceptAll();
    const afterAccept = state.getChanges().length;
    log(`Changes after accept: ${afterAccept}`, colors.cyan);

    if (afterAccept === 0) {
      log("✓ Accept all works!", colors.green);
      testsPassed++;
    } else {
      log("✗ Accept all failed", colors.red);
      testsFailed++;
    }

    // Cleanup
    logSection("Cleanup");
    watcher.stop();
    log("Watcher stopped", colors.green);

    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
      log(`Removed test directory`, colors.green);
    }

    // Summary
    logSection("Test Summary");
    log(`Tests Passed: ${testsPassed}`, colors.green);
    log(`Tests Failed: ${testsFailed}`, testsFailed > 0 ? colors.red : colors.green);

    return testsFailed === 0;

  } catch (error) {
    log(`Error: ${error}`, colors.red);
    console.error(error);

    // Cleanup on error
    if (testDir) {
      try {
        await rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    return false;
  }
}

// Run the test
log("╔════════════════════════════════════════════════════════════╗", colors.cyan);
log("║           Diff Shepherd - Smoke Test                        ║", colors.cyan);
log("╚════════════════════════════════════════════════════════════╝", colors.cyan);

runSmokeTest()
  .then((success) => {
    logSection("Result");
    if (success) {
      log("✓ ALL TESTS PASSED - Core detection engine is functional!", colors.green);
      process.exit(0);
    } else {
      log("✗ SOME TESTS FAILED - See output above", colors.red);
      process.exit(1);
    }
  })
  .catch((error) => {
    log(`✗ FATAL ERROR: ${error}`, colors.red);
    console.error(error);
    process.exit(1);
  });
