---
phase: 36-code-cleanup
plan: "01"
subsystem: backend, extension
tags: [draft-engine, auction-values, normalization, caching, typescript]

# Dependency graph
requires: []
provides:
  - Fixed UTIL replacement level calculation (excludes UTIL from batterSlotKeys sum)
  - Fixed category_id == 0 validation (null check instead of falsy)
  - Canonical normalizeName in lib/engine/normalizer.ts (NFKD, strips all non-alphanumeric)
  - Engine cache isolation with leagueId in all cache keys
  - resetEngineCache() export for clearing all module-level caches
affects: [draft-rankings, draft-engine, extension-cache, player-matching]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single canonical normalizer at lib/engine/normalizer.ts - all extension files import from here"
    - "Engine cache keys include leagueId to prevent cross-session contamination"
    - "resetEngineCache() called at draft init in content.tsx"

key-files:
  created:
    - packages/extension/lib/engine/normalizer.ts
  modified:
    - packages/backend/src/agents/draft-rankings.ts
    - packages/backend/src/api/draft.ts
    - packages/extension/lib/engine/index.ts
    - packages/extension/lib/engine/types.ts
    - packages/extension/lib/engine/archetype.ts
    - packages/extension/lib/engine/category-floor.ts
    - packages/extension/lib/draft-state.ts
    - packages/extension/lib/api-client.ts
    - packages/extension/lib/use-draft-engine.ts
    - packages/extension/components/AuctionRecommendations.tsx
    - packages/extension/components/AuctionPlayerCard.tsx
    - packages/extension/components/DraftRecommendations.tsx
    - packages/extension/components/SnakeTurnPairs.tsx
    - packages/extension/entrypoints/content.tsx

key-decisions:
  - "NFKD + strip-all-non-alphanumeric chosen as canonical normalizer (more aggressive than NFD, better for fuzzy matching)"
  - "archetype.ts and draft-state.ts re-export normalizeName from normalizer.ts for backward compatibility"
  - "leagueId added as optional field to DraftEngineInput; cache keys use leagueId ?? 'unknown'"
  - "resetEngineCache clears all 7 module-level cache variables including projection maps"

patterns-established:
  - "Normalizer consolidation: single source of truth at lib/engine/normalizer.ts, backward-compat re-exports at call sites"
  - "Cache isolation: always include leagueId in engine cache keys to prevent stale cross-session results"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-09
---

# Phase 36 Plan 01: Code Cleanup — Backend + Extension Correctness Bugs Summary

**Four correctness bugs fixed: UTIL double-count inflating auction values, category_id=0 rejection, 5+ divergent name normalizers consolidated to one NFKD canonical, and engine caches isolated by leagueId with reset function**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T00:00:00Z
- **Completed:** 2026-03-09T00:05:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Removed UTIL from batterSlotKeys in draft-rankings.ts — UTIL replacement level no longer double-counts the UTIL slot in the batter sum, fixing inflated auction values for UTIL-eligible hitters
- Fixed category_id falsy check to `== null` in draft.ts — ESPN category_id of 0 now passes validation instead of being silently rejected
- Created `lib/engine/normalizer.ts` as the single canonical `normalizeName` (NFKD, strips all non-alphanumeric) and removed 5+ local implementations from components, api-client, archetype, and draft-state
- Added leagueId to all engine cache keys and exported `resetEngineCache()` called at draft init — prevents stale recommendations from a previous session leaking into a new draft

## Task Commits

1. **Task 1: Fix backend correctness bugs (B-02, B-12)** - `86cae4e` (fix)
2. **Task 2: Consolidate normalizers and add engine cache isolation (E-02, E-12)** - `93ac9f7` (fix)

## Files Created/Modified

- `packages/extension/lib/engine/normalizer.ts` - New canonical normalizeName (NFKD, strips all non-alphanumeric)
- `packages/backend/src/agents/draft-rankings.ts` - Remove UTIL from batterSlotKeys
- `packages/backend/src/api/draft.ts` - Change !cat.category_id to cat.category_id == null
- `packages/extension/lib/engine/index.ts` - Import normalizeName from normalizer, add leagueId to all cache keys, add resetEngineCache export
- `packages/extension/lib/engine/types.ts` - Add optional leagueId to DraftEngineInput
- `packages/extension/lib/engine/archetype.ts` - Remove local normalizeName, import + re-export from normalizer
- `packages/extension/lib/engine/category-floor.ts` - Import normalizeName from normalizer instead of archetype
- `packages/extension/lib/draft-state.ts` - Remove local normalizeName, re-export from normalizer
- `packages/extension/lib/api-client.ts` - Remove local normalizeName, import from normalizer
- `packages/extension/lib/use-draft-engine.ts` - Pass leagueId to engine, add to memo deps
- `packages/extension/components/AuctionRecommendations.tsx` - Import normalizeName from normalizer
- `packages/extension/components/AuctionPlayerCard.tsx` - Import normalizeName from normalizer
- `packages/extension/components/DraftRecommendations.tsx` - Import normalizeName from normalizer
- `packages/extension/components/SnakeTurnPairs.tsx` - Import normalizeName from normalizer
- `packages/extension/entrypoints/content.tsx` - Import normalizeName from normalizer, call resetEngineCache on init

## Decisions Made

- NFKD + strip-all-non-alphanumeric chosen as the canonical normalizer over NFD. NFKD is more aggressive (better for fuzzy matching); any name that matches under NFD also matches under NFKD.
- archetype.ts and draft-state.ts re-export normalizeName from normalizer.ts rather than removing the export symbol, ensuring zero breakage for existing callers.
- leagueId uses `?? 'unknown'` fallback in cache keys so the type remains optional without breaking the cache isolation logic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added leagueId field to DraftEngineInput**
- **Found during:** Task 2 (engine cache isolation)
- **Issue:** DraftEngineInput had no leagueId field, so the cache isolation using `input.leagueId` would have been a TypeScript error
- **Fix:** Added `leagueId?: number | null` to DraftEngineInput in types.ts; passed leagueId from useDraftStore in use-draft-engine.ts
- **Files modified:** packages/extension/lib/engine/types.ts, packages/extension/lib/use-draft-engine.ts
- **Verification:** Extension builds without TypeScript errors
- **Committed in:** 93ac9f7 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Auto-fix necessary for the cache isolation to be type-safe. No scope creep.

## Issues Encountered

None - all tasks executed cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend correctness bugs fixed — UTIL auction values now correctly calculated
- Extension player matching now uses a single consistent normalizer — reduces silent lookup misses
- Engine cache isolation prevents cross-session stale data — safe to run back-to-back drafts
- Proceed to Phase 36 Plan 02 and Plan 03 for remaining code review items

---
*Phase: 36-code-cleanup*
*Completed: 2026-03-09*
