---
phase: quick
plan: 260327-h2i
subsystem: sit-start-advisor
tags: [mlb-statsapi, sit-start, pitching, frontend, backend]
dependency_graph:
  requires: [mlb-statsapi adapter, sit-start-advisor, streaming page]
  provides: [SitStartRecommendation.gameDate, SitStartRecommendation.opponent, Next Start column in Sit/Start tab]
  affects: [packages/backend/src/agents/sit-start-advisor.ts, packages/frontend/src/app/leagues/[id]/streaming/page.tsx]
tech_stack:
  added: []
  patterns: [single getSchedule() call for 7-day range, normalizeName key lookup, graceful degradation on MLB API failure]
key_files:
  modified:
    - packages/backend/src/agents/sit-start-advisor.ts
    - packages/frontend/src/app/leagues/[id]/streaming/page.tsx
decisions:
  - Used getSchedule(startDate, endDate) single call instead of 7x getProbablePitchers() to reduce API calls
  - Keyed scheduledStartMap by normalizeName(fullName) — consistent with existing name matching pattern
  - Only store first occurrence per pitcher (earliest upcoming start in the 7-day window)
  - formatDate() accepts ISO timestamps from MLB API (uses new Date() internally, handles both YYYY-MM-DD and full ISO)
metrics:
  duration: 5 min
  completed: "2026-03-27T19:45:27Z"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 260327-h2i: Include Scheduled Start Date in Sit/Start Tab Summary

**One-liner:** Enriched SitStartRecommendation with gameDate and opponent from a single 7-day MLB Stats API schedule call; added Next Start column to Sit/Start table.

## What Was Built

The Sit/Start tab now shows each rostered SP's next scheduled game date and opponent alongside their sit/start verdicts. Managers can immediately see whether a "lean start" recommendation is for a game today or four days away.

### Backend Changes (`sit-start-advisor.ts`)

- Added `gameDate?: string` and `opponent?: string` to the `SitStartRecommendation` interface
- Imported `MLBStatsAPIAdapter` and instantiated it in the `SitStartAdvisor` constructor
- After fetching external rankings, calls `this.mlbAdapter.getSchedule(startDate, endDate)` for the next 7 days (one API call, more efficient than 7 separate `getProbablePitchers()` calls)
- Builds `scheduledStartMap: Map<string, { gameDate, opponent }>` keyed by `normalizeName(fullName)`, keeping only the first (soonest) start per pitcher
- Enriches each rostered SP recommendation with their next scheduled start from the map
- Entire fetch wrapped in try/catch — if MLB API fails, `scheduledStartMap` stays empty and verdicts still render without dates

### Frontend Changes (`streaming/page.tsx`)

- Added `gameDate?: string` and `opponent?: string` to the frontend `SitStartRecommendation` interface
- Added "Next Start" column header between Pitcher and Consensus columns in the sit/start table
- Renders formatted date (`formatDate(rec.gameDate)`) with opponent in muted text (`vs {opponent}`)
- Shows `No start` in muted text when `gameDate` is absent (pitcher has no scheduled game in next 7 days or MLB API unavailable)

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Enrich SitStartRecommendation with gameDate and opponent from MLB Stats API | 47542b7 | packages/backend/src/agents/sit-start-advisor.ts |
| 2 | Add "Next Start" column to Sit/Start table in frontend | d2244e9 | packages/frontend/src/app/leagues/[id]/streaming/page.tsx |

## Deviations from Plan

None — plan executed exactly as written. Used `getSchedule(startDate, endDate)` single-call approach (the plan's "Correct approach" option) rather than 7x `getProbablePitchers()` calls.

## Known Stubs

None. `gameDate` and `opponent` are sourced live from MLB Stats API at request time. No hardcoded or placeholder values.

## Self-Check: PASSED

- `packages/backend/src/agents/sit-start-advisor.ts` exists and TypeScript compiles clean
- `packages/frontend/src/app/leagues/[id]/streaming/page.tsx` exists and TypeScript compiles clean
- Commit 47542b7 exists (Task 1)
- Commit d2244e9 exists (Task 2)
