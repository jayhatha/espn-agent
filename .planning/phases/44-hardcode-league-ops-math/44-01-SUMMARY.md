---
phase: 44-hardcode-league-ops-math
plan: "01"
subsystem: config
tags: [league-defaults, ops, rate-stats, shared-config]

requires: []
provides:
  - Shared league-defaults.ts with hardcoded league 112523 settings
  - OPS wired as rate stat with component math (formula_id ops)
  - DEFAULT_DRAFT_CONFIG for backend and extension consumption
affects: [draft-engine, extension-sidebar, backend-draft-api]

tech-stack:
  added: []
  patterns: [shared-config-single-source-of-truth]

key-files:
  created:
    - packages/shared/src/league-defaults.ts
  modified:
    - packages/shared/src/index.ts
    - packages/extension/entrypoints/content.tsx

key-decisions:
  - "OPS replaces AVG as the default hitting rate stat for league 112523"
  - "Shared league-defaults.ts serves as single source of truth for both backend and extension"

patterns-established:
  - "Shared config pattern: league-specific defaults in packages/shared/src/league-defaults.ts"

requirements-completed: [CONF-01, CONF-02, CONF-03]

duration: 4min
completed: 2026-03-15
---

# Phase 44 Plan 01: Hardcode League 112523 Defaults & OPS Rate Stat Summary

**Shared league-defaults.ts with ESPN league 112523 config (13 teams, team 13) and OPS as rate stat replacing AVG in 5x5 categories**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T17:25:39Z
- **Completed:** 2026-03-15T17:29:15Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Created packages/shared/src/league-defaults.ts with all league 112523 hardcoded settings
- OPS wired as RATE stat with formula_id "ops", direction HIGHER_BETTER, required_components [AB, H, BB, HBP, SF, TB]
- Extension fallback defaults now import from shared config instead of inline AVG-based 5x5

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared league-defaults.ts** - `dbcebca` (feat)
2. **Task 2: Update extension fallback defaults** - `4c44f3c` (feat)
3. **Task 3: Verify build** - no commit (verification only)

## Files Created/Modified
- `packages/shared/src/league-defaults.ts` - Hardcoded league 112523 defaults: IDs, categories, roster slots, budget
- `packages/shared/src/index.ts` - Added export for league-defaults module
- `packages/extension/entrypoints/content.tsx` - Replaced inline 5x5 defaults with shared config imports

## Decisions Made
- OPS replaces AVG as the default hitting rate stat, matching league 112523 scoring settings
- Created league-defaults.ts in shared package so both backend and extension can import from one place
- Kept DEFAULT_ROSTER_SLOTS identical to prior inline defaults (no changes to roster structure)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Shared defaults available for backend draft API consumption
- Extension uses OPS-based categories by default when DOM detection fails
- formulas.ts already had OPS implementation (OBP + SLG), no changes needed there

---
*Phase: 44-hardcode-league-ops-math*
*Completed: 2026-03-15*

## Self-Check: PASSED
