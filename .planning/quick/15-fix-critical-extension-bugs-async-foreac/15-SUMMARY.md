---
phase: quick-15
plan: 01
subsystem: extension
tags: [bugfix, async-handling, race-condition, production-safety]
dependency_graph:
  requires: [quick-14, 10-06]
  provides: [stable-pick-detection, single-threaded-mounting, production-safe-debug]
  affects: [extension-reliability, production-security]
tech_stack:
  patterns: [promise-all-pattern, guard-flags, tree-shaking]
key_files:
  created: []
  modified:
    - packages/extension/lib/dom-observers.ts
    - packages/extension/entrypoints/content.tsx
decisions:
  - Promise.all pattern over forEach async ensures proper error handling
  - Module-level guard flag prevents mounting race conditions
  - import.meta.env.DEV leverages Vite tree-shaking for production safety
metrics:
  duration_minutes: 2
  tasks_completed: 3
  files_modified: 2
  commits: 3
  bundle_size_reduction: 2.5KB
---

# Quick Task 15: Fix Critical Extension Bugs Summary

**One-liner:** Eliminated unhandled promise rejections, sidebar race conditions, and production debug exposure via Promise.all, guard flags, and DEV guards.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Fix async forEach promise rejections in MutationObserver | bdb4352 | ✅ Complete |
| 2 | Add mounting guard to prevent sidebar race condition | b3f4ba7 | ✅ Complete |
| 3 | Remove debug globals from production builds | 74fb264 | ✅ Complete |

## Changes Made

### 1. Promise.all Pattern for Async Pick Parsing

**Problem:** MutationObserver used `forEach` with async callbacks, creating fire-and-forget promises that couldn't be caught.

**Fix:**
- Replaced `forEach(async)` with `map(async)` + `Promise.all`
- Added outer try/catch for batch error handling
- Ensured all pick parsing promises are properly awaited

**Impact:** Eliminates unhandled promise rejections during pick detection, preventing silent failures and data loss.

**Files:** `packages/extension/lib/dom-observers.ts`

### 2. Mounting Guard Flag

**Problem:** Concurrent sidebar mounting from MutationObserver (line 522), heartbeat (line 535), and popout close (line 548) could create duplicate sidebars.

**Fix:**
- Added module-level `isMounting` flag
- Check flag before entering mountSidebar
- Use try/finally to ensure flag is always reset

**Impact:** Single-threaded mounting prevents duplicate UI elements and React root conflicts.

**Files:** `packages/extension/entrypoints/content.tsx`

### 3. Development-Only Debug Globals

**Problem:** `window.espnDraftAssistant` diagnostic utilities exposed in production, potential security concern.

**Fix:**
- Wrapped global assignment in `import.meta.env.DEV` guard
- WXT/Vite tree-shakes DEV code from production builds
- Diagnostic functions only available during development

**Impact:** Production builds do not expose debugging functions, reducing bundle size by 2.5 KB and eliminating potential attack surface.

**Files:** `packages/extension/entrypoints/content.tsx`

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

### Build Verification
- ✅ `grep -n "forEach(async"` returns 0 matches
- ✅ `Promise.all` present in pick parsing (line 276)
- ✅ `isMounting` flag present (declaration, check, finally reset)
- ✅ `import.meta.env.DEV` guard present (line 121)
- ✅ Extension builds without TypeScript errors
- ✅ Production bundle does not contain diagnostic function names
- ✅ Bundle size reduced from 238.4 KB to 235.9 KB

### Pattern Verification
- **Async handling:** All mutation observer async operations use Promise.all
- **Guard flag:** isMounting prevents re-entry from 3 concurrent sources
- **Tree-shaking:** Vite removes DEV-guarded code from production builds

## Technical Decisions

### Why Promise.all over async/await in forEach?

`forEach` doesn't return promises, so async callbacks become fire-and-forget. The try/catch inside the callback can't handle promise rejections that occur after the callback returns. `Promise.all` ensures:
- All promises are awaited before continuing
- Any rejection is caught at the batch level
- Observer continues functioning even if one pick fails

### Why module-level guard instead of debouncing?

Debouncing delays execution but doesn't prevent concurrent execution. If two mount calls happen within the debounce window, both will execute after the delay. A guard flag provides true mutual exclusion:
- First call sets flag and enters
- Second call sees flag and returns immediately
- Flag reset in finally ensures recovery from errors

### Why import.meta.env.DEV over process.env.NODE_ENV?

WXT uses Vite which provides `import.meta.env.DEV` as a compile-time constant. This enables:
- True dead code elimination (tree-shaking)
- Smaller production bundles
- No runtime checks

`process.env.NODE_ENV` requires runtime evaluation and may not tree-shake as effectively.

## Impact Assessment

### Reliability
- **Before:** Unhandled promise rejections could cause pick detection to fail silently
- **After:** All pick parsing errors are caught and logged with context

### UI Stability
- **Before:** Race conditions could create duplicate sidebars from concurrent mounts
- **After:** Single-threaded mounting ensures exactly one sidebar instance

### Production Safety
- **Before:** Diagnostic functions exposed to end users, potential security risk
- **After:** Debug tools only available during development, production builds are clean

## Self-Check: PASSED

### Created Files
- ✅ `.planning/quick/15-fix-critical-extension-bugs-async-foreac/15-SUMMARY.md` (this file)

### Modified Files
- ✅ `packages/extension/lib/dom-observers.ts` exists
- ✅ `packages/extension/entrypoints/content.tsx` exists

### Commits
- ✅ `bdb4352` exists (Promise.all fix)
- ✅ `b3f4ba7` exists (isMounting guard)
- ✅ `74fb264` exists (DEV guard)

### Build Artifacts
- ✅ Extension builds successfully
- ✅ Production bundle does not contain debug functions
- ✅ Bundle size reduced by 2.5 KB

## Recommendations for Future Work

1. **Integration test for pick detection:** Add test that simulates ESPN DOM mutations and verifies all picks are detected without errors
2. **Mount stress test:** Add test that rapidly triggers mount from multiple sources and verifies single sidebar
3. **Bundle analysis:** Add CI step to track bundle size changes and flag unexpected increases
4. **Error monitoring:** Consider adding error reporting service for production to catch any remaining edge cases

## Links

- **Plan:** `.planning/quick/15-fix-critical-extension-bugs-async-foreac/15-PLAN.md`
- **Commits:** bdb4352, b3f4ba7, 74fb264
- **Related Quick Tasks:** quick-14 (current player display), quick-10 (DOM detection improvements)
