---
phase: quick-41
plan: 01
subsystem: extension-draft-engine
tags: [league-analysis, draft-engine, fangraphs, category-ranking, auction-draft]
dependency_graph:
  requires:
    - packages/extension/lib/engine/archetype.ts  # normalizeName, FG projection matching pattern
    - packages/extension/lib/engine/types.ts       # PoolPlayer, DraftEngineSignals
    - packages/extension/lib/fangraphs-data.ts     # FgHitterProjection, FgPitcherProjection
    - "@espn-fantasy/shared"                       # calculateFinalRate, Category
  provides:
    - computeLeagueAnalysis pure function
    - LeagueAnalysisSignal on DraftEngineSignals
    - League Analysis sidebar section
  affects:
    - packages/extension/components/EngineInsights.tsx
    - packages/extension/lib/engine/index.ts
tech_stack:
  added: []
  patterns:
    - Pure engine function (no Zustand, no DOM) — same pattern as archetype.ts, category-gap.ts
    - FG projection name matching via normalizeName from archetype.ts
    - Component-based rate stat calculation via calculateFinalRate from shared
    - Collapsible details element in sidebar (collapsed by default)
key_files:
  created:
    - packages/extension/lib/engine/league-analysis.ts
  modified:
    - packages/extension/lib/engine/types.ts
    - packages/extension/lib/engine/index.ts
    - packages/extension/components/EngineInsights.tsx
decisions:
  - Stat summation only (no greedy fill) for performance — league-analysis is O(teams * players * categories), must stay under 100ms
  - Skip teams with zero matched FG players rather than showing misleading zeros
  - LOWER_BETTER zero suppression: teams with 0 ERA/WHIP total pushed to bottom of ranking (no pitchers drafted yet)
  - teamsAnalyzed guard (>1) prevents showing meaningless rankings early in draft
  - Section collapsed by default to keep sidebar compact — user opens when needed
metrics:
  duration: 9min
  completed: 2026-03-05
  tasks_completed: 2
  files_modified: 4
  files_created: 1
---

# Quick Task 41: League-Wide Category Analysis Summary

League-wide category analysis using FanGraphs projections per team, surfacing relative category rankings, market demand signals, and strategic recommendations in the extension sidebar.

## What Was Built

**league-analysis.ts engine module** — pure function that:
1. Builds FG projection lookup maps (hitters + pitchers) by normalized name
2. Groups all draft picks by team from `allPicks`
3. For each team, matches drafted players to FG projections and computes per-category totals:
   - COUNTING stats: direct sum across matched players
   - RATE stats: sum components, then `calculateFinalRate(formula_id, {}, combined)`
4. Skips teams with zero matched players (no data)
5. Ranks all teams per category (HIGHER_BETTER: descending, LOWER_BETTER: ascending with zero suppression)
6. Computes league median and category demand (weakTeamCount, strongTeamCount, demandLevel)
7. Generates 2-3 strategic recommendations (strong/weak category observations, bidding war alerts, leverage opportunities)
8. Returns `computeTimeMs` via `performance.now()`

**types.ts additions:**
- `TeamCategoryRanking` — per-category rank for user vs field
- `CategoryDemand` — market demand signal per category
- `LeagueAnalysisSignal` — container for all outputs
- `leagueAnalysis: LeagueAnalysisSignal | null` added to `DraftEngineSignals`

**engine/index.ts wiring** — step 5b between alerts (5) and roster optimization (6):
- Guard: `leagueCategories.length > 0 && teamRosters.size > 0 && myTeamId`
- Try/catch with `console.warn` on failure
- `LeagueAnalysisSignal` added to re-export line

**EngineInsights.tsx** — "League Analysis" collapsible `<details>` section (no `open` attr — collapsed by default):
- Category rankings grid: each stat with rank badge (green top-3, red bottom-3, neutral middle), actual total value
- Market Demand subsection: high/medium demand categories with HIGH (bg-negative-light) / MED (bg-warning-light) badges and weak team counts
- Strategic recommendations as dash-prefixed bullet points

## Tasks Completed

| Task | Commit | Files |
|------|--------|-------|
| 1: Types and league-analysis.ts | 70e5ba2 | types.ts, league-analysis.ts |
| 2: Engine wiring and sidebar | 9bdf829 | index.ts, EngineInsights.tsx |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript: no new errors from our files (pre-existing WXT/test errors unchanged)
- Extension builds cleanly: `wxt build` — 1.795s, 1.16 MB total
- league-analysis.ts: zero Zustand imports, zero DOM access (pure function confirmed)
- `DraftEngineSignals.leagueAnalysis` typed as `LeagueAnalysisSignal | null`
- EngineInsights renders conditionally on `leagueAnalysis != null && teamsAnalyzed > 1`

## Self-Check: PASSED

- [x] `packages/extension/lib/engine/league-analysis.ts` — created
- [x] `packages/extension/lib/engine/types.ts` — `LeagueAnalysisSignal` present
- [x] `packages/extension/lib/engine/index.ts` — `computeLeagueAnalysis` imported and called
- [x] `packages/extension/components/EngineInsights.tsx` — "League Analysis" section present
- [x] Commits 70e5ba2 and 9bdf829 exist in git log
- [x] Extension build succeeded (pnpm build exits 0)
