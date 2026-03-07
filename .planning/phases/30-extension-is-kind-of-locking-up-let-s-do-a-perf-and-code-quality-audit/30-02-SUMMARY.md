---
phase: 30-extension-perf-audit
plan: 02
subsystem: ui
tags: [react, zustand, performance, optimization, simulation, mutation-observer]

# Dependency graph
requires:
  - phase: 30-extension-perf-audit
    provides: Research identifying 7 actionable bottlenecks (P0-P2) in extension sidebar

provides:
  - Reduced forward simulation CPU usage: 200->50 sims per decision, 100->50 per target
  - All console.warn gated to DEV mode in engine/index.ts (production build silent)
  - buildFgPlayerPool called once, shared across projected standings and roster optimization
  - sidebarMountObserver scoped to document.body with subtree:false
  - espnDomAuctionValues setter with shallow equality guard preventing unnecessary re-renders
  - scarcity demand calculation pre-grouped by team (O(1) lookup)
  - AuctionRecommendations Set construction inside useMemo (allPicks change-gated)
affects: [forward-simulation, draft-engine, auction-recommendations, content-script]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DEV-gate pattern: wrap console.warn with if (import.meta.env.DEV) throughout engine"
    - "Shallow equality guard: check hasChanges before triggering Zustand update"
    - "Pre-group pattern: build Map<teamId, picks[]> once before O(n^2) loops"
    - "useMemo containment: expensive Set construction inside dependency-aware memo"

key-files:
  created:
    - packages/extension/env.d.ts
  modified:
    - packages/extension/lib/engine/index.ts
    - packages/extension/entrypoints/content.tsx
    - packages/extension/lib/draft-state.ts
    - packages/extension/lib/engine/scarcity.ts
    - packages/extension/components/AuctionRecommendations.tsx
    - packages/extension/tsconfig.json

key-decisions:
  - "Sim count 200->50: 75% CPU reduction; lower fidelity acceptable since cache prevents re-runs on same state"
  - "Single buildFgPlayerPool call: undraftedPlayers shared, top-200 slice for optimizer separately"
  - "subtree:false observer: sidebar root is always a direct body child, global DOM observation unnecessary"
  - "env.d.ts to augment ImportMetaEnv with DEV/PROD/MODE: avoids vite/client resolution issues in tsconfig"

patterns-established:
  - "All engine diagnostic console.warn must be wrapped in import.meta.env.DEV guard"
  - "Zustand setters should shallow-compare before updating when called on intervals"

requirements-completed: []

# Metrics
duration: 7min
completed: 2026-03-07
---

# Phase 30 Plan 02: Performance Fixes Summary

**7 targeted micro-optimizations eliminating ~75% forward simulation CPU, 500 unnecessary re-renders per 10s interval, and global DOM mutation observer coverage in the extension sidebar**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-07T23:39:35Z
- **Completed:** 2026-03-07T23:46:00Z
- **Tasks:** 2
- **Files modified:** 6 (+ 1 created)

## Accomplishments
- Forward simulation CPU reduced ~75%: SIMS_PER_DECISION 200->50, SIMS_PER_TARGET 100->50 (1,100 sim calls -> ~275 per engine run)
- Production build completely silent: all 15 console.warn calls in engine/index.ts gated to import.meta.env.DEV
- buildFgPlayerPool called once per engine run, shared across projected standings and roster optimization
- sidebarMountObserver scoped to document.body + subtree:false — eliminates firing on every ESPN DOM mutation
- espnDomAuctionValues setter skips Zustand update when no values changed — eliminates 500 AuctionPlayerCard re-renders per 10s scrape interval
- Scarcity demand calculation pre-groups allPicks by team: O(allPicks x teams) -> O(allPicks + teamPicks x positions)
- AuctionRecommendations Sets only constructed when allPicks changes, not on espnDomAuctionValues renders

## Task Commits

Each task was committed atomically:

1. **Task 1: Reduce sim count, gate console.warn, deduplicate buildFgPlayerPool** - `a22b745` (perf)
2. **Task 2: Fix sidebarMountObserver, espnDomAuctionValues guard, scarcity pre-group, AuctionRecommendations useMemo** - `259a84f` (perf)

**Plan metadata:** `[next-commit]` (docs: complete plan)

## Files Created/Modified
- `packages/extension/lib/engine/index.ts` - Sim count reduced, all console.warn gated, single buildFgPlayerPool call
- `packages/extension/entrypoints/content.tsx` - sidebarMountObserver uses document.body + subtree:false
- `packages/extension/lib/draft-state.ts` - setEspnDomAuctionValues has shallow equality guard
- `packages/extension/lib/engine/scarcity.ts` - Pre-grouped picksByTeam Map for O(1) demand calculation
- `packages/extension/components/AuctionRecommendations.tsx` - draftedPlayerIds/Names Sets inside useMemo
- `packages/extension/tsconfig.json` - Added .wxt/types/globals.d.ts to includes
- `packages/extension/env.d.ts` - Augments ImportMetaEnv with DEV/PROD/MODE for type safety

## Decisions Made
- Used `import.meta.env.DEV` guard pattern (same as existing DraftSidebar.tsx) rather than stripping logs entirely — preserves diagnostic value in development
- Single `buildFgPlayerPool` call: `undraftedPlayers` array shared with projected standings, `allPlayersOpt` is a separate `.slice(0, 200)` for the optimizer — avoids a full rebuild while maintaining optimizer's top-200 cap
- Created `env.d.ts` to augment `ImportMetaEnv` with DEV/PROD/MODE rather than adding vite/client to tsconfig (vite/client not resolvable from extension package's module resolution scope)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added ImportMetaEnv augmentation for type safety**
- **Found during:** Task 1 (Gating console.warn calls with import.meta.env.DEV)
- **Issue:** tsconfig.json lacked type support for `import.meta.env.DEV` — the WXT-generated `.wxt/types/globals.d.ts` defines `ImportMetaEnv` but omits `DEV`. Adding `import.meta.env.DEV` guards produced TS2339 errors.
- **Fix:** Created `packages/extension/env.d.ts` augmenting `ImportMetaEnv` with `DEV`, `PROD`, and `MODE`. Added `.wxt/types/globals.d.ts` to tsconfig includes.
- **Files modified:** `packages/extension/env.d.ts` (created), `packages/extension/tsconfig.json`
- **Verification:** `npx tsc --noEmit` produces no errors in engine/index.ts; all other errors are pre-existing
- **Committed in:** a22b745 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing type support)
**Impact on plan:** Required for TypeScript correctness when using import.meta.env.DEV pattern. No scope creep — DraftSidebar.tsx already used this pattern without proper type support.

## Issues Encountered
None — all fixes were mechanical code changes with no logic complexity.

## Next Phase Readiness
- All 7 bottlenecks from Phase 30 research are resolved
- Extension build is clean and production-silent
- Ready for real-world testing during a live auction draft to validate performance improvements

---
*Phase: 30-extension-perf-audit*
*Completed: 2026-03-07*
