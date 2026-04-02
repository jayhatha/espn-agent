---
phase: quick
plan: 260401-uyx
subsystem: waivers
tags: [pitcherlist, waivers, free-agents, frontend, backend]
dependency_graph:
  requires: []
  provides: [pitcherlistVerdict, pitcherlistTier on /free-agents, PL column in waivers table]
  affects: [waivers-page, recommendations-api]
tech_stack:
  added: []
  patterns: [PitcherlistAdapter.getRankings() in API handler, sortable tier badge column]
key_files:
  created: []
  modified:
    - packages/backend/src/api/recommendations.ts
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
decisions:
  - PitcherlistAdapter fetched per-request with .catch(() => []) — scrape failures degrade to null PL fields without breaking the endpoint
  - PL column added as standalone th/td in free agents table only — simpler than forFreeAgents param on shared helpers
  - VERDICT_PRIORITY map placed as module-level constant above WaiversPage component
  - Tier badge positioned after % Start column, before pitcher stat columns (W, SV, K, ERA, WHIP)
  - Non-pitcher rows show '--' via plTier null guard — no conditional rendering needed by caller
metrics:
  duration: "~8 min"
  completed: "2026-04-02"
  tasks: 2
  files: 2
---

# Quick Task 260401-uyx: Add PitcherList SP Ranking Column to Waivers

**One-liner:** PitcherList weekly tier badge (Auto-Start / Probably Start / Questionable Start / Do Not Start) added as a sortable PL column in the free agents table, backed by /free-agents API enrichment via PitcherlistAdapter.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Enrich /free-agents with pitcherlistVerdict + pitcherlistTier | 6d2b5d4 |
| 2 | Add sortable PL column to free agents table | fc382ee |

## What Was Built

### Backend (recommendations.ts)
- Imported `PitcherlistAdapter` and `normalizePitcherName` from the pitcherlist adapter
- Instantiated adapter and fetched rankings before building enriched free agent array
- Built `plMap` keyed by normalized pitcher name
- Added `pitcherlistVerdict` (e.g. `"start"`, `"lean_start"`) and `pitcherlistTier` (e.g. `"Auto-Start"`) to every free agent object
- Scrape failures caught with `.catch(() => [])` so all PL fields become null rather than crashing the response

### Frontend (waivers/page.tsx)
- Extended `FreeAgent` interface with `pitcherlistVerdict: string | null` and `pitcherlistTier: string | null`
- Added module-level `VERDICT_PRIORITY` constant mapping verdict strings to sort priority (start=4 → sit=0)
- Extended `faRows` useMemo: `plTier` and `plRank` computed from `pitcherlistVerdict`/`pitcherlistTier` for pitcher rows; null for hitters
- Added standalone `<SortHeader label="PL" sortKey="plRank" ...>` in free agents table header, guarded by `(showPitcherStats || showAllStats)`
- Added standalone PL `<td>` in free agents table rows with color-coded tier badge:
  - `plRank === 4` (start): green (positive)
  - `plRank === 3` (lean_start): accent blue
  - `plRank === 2` (neutral): amber (warning)
  - `plRank <= 1` (lean_sit/sit): red (negative)
- Non-pitcher rows and unmatched SPs show `--` (muted)
- Roster (drop) table is unchanged

## Deviations from Plan

None — plan executed exactly as written. Used the simpler "standalone th/td" approach (last option in Task 2 action) as the plan explicitly recommended.

## Verification

- `pnpm --filter backend tsc --noEmit` — zero errors (verified by compiling against main project node_modules)
- `pnpm --filter frontend tsc --noEmit` — zero errors (verified by compiling against main project node_modules)
- Free agents table shows PL column when SP/RP/All position filter is active
- Tier badges are color-coded green/blue/amber/red by priority
- Clicking PL header sorts SP rows by tier priority descending (Auto-Starts first)
- Non-SP rows show "--" in PL column
- Roster (drop) table has no PL column

## Self-Check: PASSED

- SUMMARY.md: FOUND
- Commit 6d2b5d4 (Task 1 - backend enrichment): FOUND
- Commit fc382ee (Task 2 - frontend PL column): FOUND
