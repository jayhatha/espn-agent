---
phase: 21-dynamic-build-archetype-analysis
plan: 01
subsystem: extension
tags: [fangraphs, csv, json, typescript, draft-engine, chrome-extension]

# Dependency graph
requires:
  - phase: 20-deterministic-draft-engine
    provides: DraftEngineSignals and DraftEngineInput types that BuildArchetypeSignal extends
provides:
  - FanGraphs leaderboard projection JSON assets (hitters + pitchers) with full stat lines
  - FanGraphs auction calculator JSON assets (hitters + pitchers) with dollar values
  - Typed fangraphs-data.ts module with 4 interfaces and 4 typed data arrays
  - BuildArchetypeSignal, CategoryCeiling, PivotPlayer types in engine/types.ts
  - archetype field on DraftEngineSignals interface
  - Repeatable CSV-to-JSON conversion script
affects: [21-02-archetype-engine, 21-03-archetype-ui]

# Tech tracking
tech-stack:
  added: [tsx (dev dependency for conversion script)]
  patterns: [static JSON asset bundling with typed module wrapping, HA/BBA/HRA key aliasing for pitcher stat collision avoidance]

key-files:
  created:
    - packages/extension/scripts/convert-fangraphs-csvs.ts
    - packages/extension/assets/fangraphs-leaderboard-hitters.json
    - packages/extension/assets/fangraphs-leaderboard-pitchers.json
    - packages/extension/assets/fangraphs-auction-hitters.json
    - packages/extension/assets/fangraphs-auction-pitchers.json
    - packages/extension/lib/fangraphs-data.ts
  modified:
    - packages/extension/lib/engine/types.ts

key-decisions:
  - "Pitcher H/BB/HR stored as HA/BBA/HRA in JSON assets to avoid collision with hitter stat keys when used with calculateFinalRate from shared formulas"
  - "ESM-compatible __dirname replacement via fileURLToPath(import.meta.url) required because extension package uses ESNext modules"
  - "tsx installed as dev dependency only in extension package, not workspace root"
  - "Static JSON imports (not fetch) for bundled FanGraphs data — offline availability required for draft use"
  - "archetype field added to DraftEngineSignals as BuildArchetypeSignal | null — null when insufficient data, implementation deferred to Plan 02"

patterns-established:
  - "FanGraphs data pattern: parse CSV in Node script -> write compact JSON -> import statically in extension with typed wrapper module"
  - "Pitcher stat aliasing: HA/BBA/HRA keys in pitcher JSON to disambiguate from hitter H/BB/HR"

requirements-completed: []

# Metrics
duration: 41min
completed: 2026-03-04
---

# Phase 21 Plan 01: FanGraphs JSON Assets and Engine Types Summary

**Four FanGraphs JSON assets (3,154 players total) bundled as typed extension assets with BuildArchetypeSignal types wired into DraftEngineSignals**

## Performance

- **Duration:** 41 min
- **Started:** 2026-03-04T23:48:04Z
- **Completed:** 2026-03-04T00:29:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Created repeatable `convert-fangraphs-csvs.ts` script that reads 4 FanGraphs CSVs from project root, strips UTF-8 BOM, parses quoted fields, and writes compact JSON to extension assets
- Generated 4 bundled JSON files: 633 hitter projections, 810 pitcher projections, 1165 hitter auction values, 546 pitcher auction values
- Established pitcher stat aliasing pattern (HA/BBA/HRA) to prevent key collision with hitter stats in shared formula functions
- Created `fangraphs-data.ts` typed module with 4 TypeScript interfaces and 4 typed data arrays for safe consumption in downstream archetype engine code
- Extended `engine/types.ts` with `BuildArchetypeSignal`, `CategoryCeiling`, `PivotPlayer` types and `archetype` field on `DraftEngineSignals`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CSV-to-JSON conversion script and generate bundled JSON assets** - `4e215bd` (feat)
2. **Task 2: Create typed FanGraphs data module and extend engine types with BuildArchetypeSignal** - `a9d3ece` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `packages/extension/scripts/convert-fangraphs-csvs.ts` - Node/tsx script that reads 4 FanGraphs CSVs and writes 4 JSON assets
- `packages/extension/assets/fangraphs-leaderboard-hitters.json` - 633 hitter projections (HR, R, RBI, SB, AB, H, BB, HBP, SF, TB, PA, AVG, OPS)
- `packages/extension/assets/fangraphs-leaderboard-pitchers.json` - 810 pitcher projections (W, SV, HLD, ERA, WHIP, SO, IP, HA, ER, BBA, QS, HRA)
- `packages/extension/assets/fangraphs-auction-hitters.json` - 1165 hitter auction values with marginal SGP breakdowns
- `packages/extension/assets/fangraphs-auction-pitchers.json` - 546 pitcher auction values with marginal SGP breakdowns
- `packages/extension/lib/fangraphs-data.ts` - Typed import module with FgHitterProjection, FgPitcherProjection, FgAuctionHitter, FgAuctionPitcher interfaces + 4 typed data arrays
- `packages/extension/lib/engine/types.ts` - Added CategoryCeiling, PivotPlayer, BuildArchetypeSignal interfaces; added archetype field to DraftEngineSignals

## Decisions Made

- **Pitcher stat aliasing (HA/BBA/HRA):** FanGraphs pitcher CSV uses H/BB/HR column names that collide with hitter stat keys when both are passed to calculateFinalRate. Stored as HA/BBA/HRA in JSON assets to follow the existing convention in the shared formulas module.
- **ESM-compatible __dirname:** Extension package uses ESNext module resolution. The conversion script required `fileURLToPath(import.meta.url)` to replace CommonJS `__dirname`. Added as inline shim at top of script.
- **tsx scoped to extension package:** tsx installed as dev dependency in `packages/extension` only, not workspace root, to keep the install scope minimal.
- **archetype field deferred:** `computeDraftEngine` in `engine/index.ts` does not yet return `archetype` — this causes a single expected type error that will be resolved in Plan 02 when the archetype engine is implemented.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESM module scope error for __dirname**
- **Found during:** Task 1 (running conversion script)
- **Issue:** Extension uses ESNext modules; `__dirname` is not defined in ESM scope, causing `ReferenceError: __dirname is not defined` when running the script with tsx
- **Fix:** Added `import { fileURLToPath } from "url"` and computed `__filename`/`__dirname` equivalents from `import.meta.url`
- **Files modified:** `packages/extension/scripts/convert-fangraphs-csvs.ts`
- **Verification:** Script runs successfully and produces all 4 JSON files
- **Committed in:** `4e215bd` (Task 1 commit)

**2. [Rule 3 - Blocking] tsx not installed in project**
- **Found during:** Task 1 (attempting to run conversion script)
- **Issue:** tsx binary not found in workspace root or extension node_modules
- **Fix:** Installed tsx as dev dependency in extension package via `pnpm add -D tsx --filter extension`
- **Files modified:** `packages/extension/package.json`, `pnpm-lock.yaml`
- **Verification:** `packages/extension/node_modules/.bin/tsx` exists and script executes
- **Committed in:** `4e215bd` (Task 1 commit, included in pnpm-lock.yaml changes)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - Blocking)
**Impact on plan:** Both fixes necessary to execute the conversion script. No scope creep.

## Issues Encountered

None beyond the two blocking issues documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All FanGraphs data available as typed, bundled JSON assets ready for static import
- `BuildArchetypeSignal`, `CategoryCeiling`, `PivotPlayer` types defined and exported from `engine/types.ts`
- Plan 02 can import from `fangraphs-data.ts` directly and implement `computeArchetype()` function
- Plan 02 must update `engine/index.ts` to return `archetype` field in `DraftEngineSignals` to resolve the one expected type error

---
*Phase: 21-dynamic-build-archetype-analysis*
*Completed: 2026-03-04*
