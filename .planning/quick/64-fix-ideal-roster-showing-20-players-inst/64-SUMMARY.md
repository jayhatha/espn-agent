---
phase: 64-fix-ideal-roster-duplicates
plan: 01
subsystem: extension
tags: [zustand, dedup, draft-state, chrome-extension]

# Dependency graph
requires: []
provides:
  - "Name-based dedup in addPick and updateRoster preventing duplicate players from multiple DOM scan paths"
affects: [draft-state, ideal-roster, auction-draft]

# Tech tracking
tech-stack:
  added: []
  patterns: [normalizeName for player name comparison]

key-files:
  created: []
  modified:
    - packages/extension/lib/draft-state.ts

key-decisions:
  - "Used OR logic (playerId OR normalized name) rather than replacing playerId dedup to preserve backward compatibility"
  - "Kept cost guard on addPick dedup to avoid merging genuinely different auction events"
  - "Removed teamId from addPick dedup since different DOM parse paths yield different teamIds for same player"

patterns-established:
  - "normalizeName: lowercase, strip diacritics, remove Jr/Sr/II/III/IV suffixes, collapse whitespace"

requirements-completed: [DEDUP-01]

# Metrics
duration: 1min
completed: 2026-03-07
---

# Quick 64: Fix Ideal Roster Showing 20 Players Instead of 10 Summary

**Name-based dedup fallback in draft-state.ts preventing duplicate myRoster/allPicks entries from multiple DOM scan paths**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-08T05:41:42Z
- **Completed:** 2026-03-08T05:42:48Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `normalizeName` helper that lowercases, strips diacritics, removes common suffixes (Jr., Sr., II, III, IV), and collapses whitespace
- `updateRoster` now deduplicates by playerId OR normalized playerName, preventing the same player from being added to myRoster twice when parsed from different DOM paths
- `addPick` now deduplicates by (playerId OR normalized playerName) AND cost, removing the teamId check that was allowing through duplicates

## Task Commits

Each task was committed atomically:

1. **Task 1: Add name-based dedup to updateRoster and addPick** - `c783e2e` (fix)

## Files Created/Modified
- `packages/extension/lib/draft-state.ts` - Added normalizeName helper, updated addPick and updateRoster dedup logic

## Decisions Made
- Used OR logic (playerId OR normalized name) rather than replacing playerId dedup, preserving backward compatibility
- Kept cost guard on addPick dedup to avoid merging genuinely different auction events (same player re-nominated at different price)
- Removed teamId from addPick dedup since different DOM parse paths (scanCompletedPicks vs scanEntireDocument) yield different teamIds for the same player

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dedup fix is complete and ready for use
- Pre-existing TypeScript errors in extension package (unrelated to this change) remain

## Self-Check: PASSED

- FOUND: packages/extension/lib/draft-state.ts
- FOUND: 64-SUMMARY.md
- FOUND: commit c783e2e

---
*Phase: 64-fix-ideal-roster-duplicates*
*Completed: 2026-03-07*
