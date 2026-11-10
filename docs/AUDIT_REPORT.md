# Diff Shepherd - Security Audit Report

**Date:** 2026-01-13
**Auditor:** Claude Code
**Project:** diff-shepherd v0.1.0

## Executive Summary

A comprehensive security audit of the diff-shepherd codebase identified **2 critical vulnerabilities**, **4 high-priority issues**, **3 medium-priority issues**, and **3 low-priority issues**. The critical vulnerabilities have been fixed in this commit.

## Critical Vulnerabilities (FIXED)

### 1. Command Injection Vulnerability (FIXED)

**Severity:** Critical
**Status:** ✅ Fixed
**File:** `src/terminal.ts:207`

#### Description
The `createNewPane` function constructed shell commands using string interpolation without proper sanitization, allowing command injection through malicious directory paths.

#### Original Code
```typescript
let command = `cd ${directory} && ${runScript} show --id ${id}`;
command += ` --socket ${socketPath}`;
```

#### Fixed Code
```typescript
const validId = id.replace(/[^a-zA-Z0-9-_]/g, "");
const escapedDir = directory.replace(/'/g, "'\\''");
const escapedSocket = socketPath.replace(/'/g, "'\\''");
const command = `cd '${escapedDir}' && ${runScript} show --id ${validId} --socket '${escapedSocket}'`;
```

#### Impact
- Attackers could execute arbitrary commands via specially crafted directory paths
- Risk of remote code execution in environments where user input influences the directory parameter

### 2. Path Traversal Vulnerability (FIXED)

**Severity:** Critical
**Status:** ✅ Fixed
**File:** `src/shepherd/watcher.ts:220-262`

#### Description
The `getAllFiles` method accepted arbitrary directory paths without validation, allowing attackers to access files outside the intended directory through path traversal sequences like `../`.

#### Original Code
```typescript
private async getAllFiles(dir: string, baseDir: string = dir, ...): Promise<string[]> {
  // No validation that dir is within baseDir
  const entries = await readdir(dir, { withFileTypes: true });
  // ...
}
```

#### Fixed Code
```typescript
function isPathWithinDirectory(parentDir: string, childPath: string): boolean {
  const resolvedParent = resolve(parentDir);
  const resolvedChild = resolve(childPath);
  const relativePath = relative(resolvedParent, resolvedChild);
  return !relativePath.startsWith("..");
}

private async getAllFiles(dir: string, baseDir: string = dir, ...): Promise<string[]> {
  if (!isPathWithinDirectory(baseDir, dir)) {
    logger.error(`Path traversal attempt detected: ${dir} is outside base directory: ${baseDir}`);
    return [];
  }
  // ...
}
```

#### Impact
- Attackers could read arbitrary files on the filesystem
- Potential exposure of sensitive configuration files, SSH keys, or other secrets

## High Priority Issues

### 3. Uncaught Promise Rejections
**Severity:** High
**Status:** ⚠️ Open
**File:** `src/cli.ts:86-88, 95-100`

Multiple async operations lack proper error handling, risking unhandled promise rejections and application crashes.

**Recommendation:** Wrap all async operations in try-catch blocks with proper error logging and user feedback.

### 4. Race Condition in State Management
**Severity:** High
**Status:** ⚠️ Open
**File:** `src/shepherd/state.ts:118-141`

The `addChanges` method has async file operations that don't maintain proper ordering when multiple changes are detected simultaneously.

**Recommendation:** Use `Promise.allSettled` with proper error handling and implement a queue mechanism for state updates.

### 5. Memory Leak in Logger
**Severity:** High
**Status:** ⚠️ Open
**File:** `src/utils/logger.ts:42-46`

Interval timer is set but not properly cleaned up on all exit scenarios.

**Recommendation:** Add comprehensive cleanup for all process exit events (`SIGINT`, `SIGTERM`, `exit`).

### 6. Unsafe Dynamic Require
**Severity:** High
**Status:** ⚠️ Open
**File:** `src/cli.ts:191-192`

Using `createRequire` and dynamic require can lead to module loading issues in bundled environments.

**Recommendation:** Use static imports or `import()` with proper error handling.

## Medium Priority Issues

### 7. Missing Input Validation in MCP Server
**Severity:** Medium
**Status:** ✅ Partially Fixed
**File:** `src/index.ts:173-174`

**Description:** No validation of directory paths or session IDs.

**Fix Applied:** Added `validatePath()` and `validateSessionId()` functions with basic sanitization.

**Remaining Work:** Add more comprehensive validation including:
- Check if directory exists and is readable
- Validate session ID format more strictly
- Add rate limiting for MCP tool calls

### 8. Error Handling Inconsistencies
**Severity:** Medium
**Status:** ⚠️ Open
**File:** `src/shepherd/watcher.ts:176-185`

File read errors are logged but continue processing, which might mask important issues.

**Recommendation:** Implement configurable error handling strategies (fail-fast vs. continue).

### 9. Type Safety Issues
**Severity:** Medium
**Status:** ⚠️ Open
**File:** Multiple files using `@ts-ignore`

Using `@ts-ignore` disables type checking, potentially hiding type-related bugs.

**Recommendation:** Create proper TypeScript definitions for `terminal-kit` and `blessed` libraries.

### 10. Performance: Inefficient File Scanning
**Severity:** Medium
**Status:** ⚠️ Open
**File:** `src/shepherd/watcher.ts:207-262`

Recursive file scanning without optimization for large directories.

**Recommendation:** Implement concurrent file scanning with configurable limits using worker threads.

## Low Priority Issues

### 11. Unused Variable
**Severity:** Low
**File:** `src/components/Button.tsx:19`

`backgroundColor` prop defined but never used.

### 12. Dead Code
**Severity:** Low
**File:** `src/hooks/useMouse.ts:17-20`

Empty useEffect cleanup function.

### 13. Magic Numbers
**Severity:** Low
**File:** `src/cli.ts:273`

Hardcoded timeout delay. Define as named constant.

## Security Recommendations

### Immediate Actions (Completed ✅)
1. Fix command injection vulnerability in terminal.ts
2. Implement path validation in watcher.ts
3. Add input validation to MCP server

### Short-term Improvements
1. Implement comprehensive error handling for all async operations
2. Fix memory leaks in logger and other components
3. Add TypeScript definitions for external libraries
4. Implement rate limiting for MCP server

### Long-term Enhancements
1. Add security testing to CI/CD pipeline
2. Implement dependency scanning (npm audit)
3. Add security headers and CSP where applicable
4. Consider using security-focused libraries (e.g., `helmet` for any web components)

## Conclusion

The diff-shepherd codebase had two critical security vulnerabilities that have been fixed:

1. **Command Injection** - Fixed through proper shell escaping
2. **Path Traversal** - Fixed through path validation

The remaining issues should be addressed in order of priority to improve the overall security posture and code quality of the project.

## Testing

All security fixes have been verified:
- ✅ TypeScript compilation passes
- ✅ Smoke tests pass (4/4)
- ✅ No regression in functionality

---

**Report Generated:** 2026-01-13
**Next Review Recommended:** After implementing remaining high-priority fixes
