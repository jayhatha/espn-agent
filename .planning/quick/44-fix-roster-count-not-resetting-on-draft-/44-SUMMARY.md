---
phase: quick-44
plan: 01
subsystem: extension
tags: [zustand, persist, hydration, chrome-extension, race-condition]

# Dependency graph
requires:
  - phase: 10
    provides: Chrome extension draft sidebar with Zustand persist state
provides:
  - Hydration-aware draft initialization preventing stale roster state on reload
affects: [extension, draft-state]

# Tech tracking
tech-stack:
  added: []
  patterns: [zustand-persist-hydration-await]

key-files:
  created: []
  modified:
    - packages/extension/entrypoints/content.tsx

key-decisions:
  - "Await hydration before any store access (not just before initializeDraft) to prevent all stale state reads"
  - "Helper function pattern (waitForHydration) resolves immediately if already hydrated, subscribes to onFinishHydration otherwise"

patterns-established:
  - "Zustand persist hydration gate: always await persist.hasHydrated()/onFinishHydration() before first getState() in async content scripts"

requirements-completed: [QUICK-44]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Quick-44: Fix Roster Count Not Resetting on Draft Page Reload

**Zustand persist hydration gate in content.tsx prevents async chrome.storage.local merge() from overwriting cleared roster state**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T16:43:34Z
- **Completed:** 2026-03-05T16:46:14Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added waitForHydration() helper that resolves when chrome.storage.local hydration completes or immediately if already hydrated
- Inserted await before first useDraftStore.getState() call, ensuring initializeDraft() reset runs after hydration merge
- Roster count now correctly resets to 0 on page reload instead of showing stale persisted count

## Task Commits

Each task was committed atomically:

1. **Task 1: Await Zustand persist hydration before initializeDraft()** - `0a9dd98` (fix)

## Files Created/Modified
- `packages/extension/entrypoints/content.tsx` - Added waitForHydration() helper and await call before first store access

## Decisions Made
- Await hydration before any store access (not just before initializeDraft) to prevent all stale state reads during initialization
- Used onFinishHydration subscription pattern with hasHydrated() fast-path for robustness

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Extension draft state initialization is now hydration-safe
- Future store access patterns in content.tsx should maintain the hydration-first ordering

---
*Phase: quick-44*
*Completed: 2026-03-05*
