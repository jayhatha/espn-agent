---
phase: 77-sp-sit-start
plan: 02
subsystem: frontend
tags: [sit-start, sp-recommendations, pitching-usage, verdict-badges, react-query]
dependency_graph:
  requires:
    - "77-01 (SitStartAdvisor + GET /pitching/sit-start endpoint)"
  provides:
    - "Sit/Start tab on Pitching Usage page"
    - "getSitStart API client method"
  affects:
    - packages/frontend/src/app/leagues/[id]/streaming/page.tsx
    - packages/frontend/src/lib/api.ts
tech_stack:
  added: []
  patterns:
    - "Lazy useQuery with enabled: !!selectedTeamId && activeTab === 'sit-start' — only fetches when tab is active"
    - "Color-coded verdict badges: positive=Start, info=Lean Start, default=Toss-Up, warning=Lean Sit, negative=Sit"
    - "Source attribution links at top of tab panel with graceful degradation badge for Rotoballer partial data"
key_files:
  created: []
  modified:
    - packages/frontend/src/lib/api.ts
    - packages/frontend/src/app/leagues/[id]/streaming/page.tsx
decisions:
  - "Sit/Start tab inserted between Start Plan and Streaming Picks (3rd of 4 tabs) — logical flow from planning to execution"
  - "Verdict table uses inline helper functions rather than separate component — consistent with existing page pattern"
metrics:
  duration: "~3 minutes"
  completed: "2026-03-27"
  tasks_completed: 2
  files_created: 0
  files_modified: 2
---

# Phase 77 Plan 02: SP Sit/Start Frontend Summary

**One-liner:** Sit/Start tab added to Pitching Usage page with color-coded verdict badges for Pitcherlist and Rotoballer rankings, lazy-loaded via useQuery with source attribution links and empty state.

## What Was Built

### Task 1: API Client + Sit/Start Tab

**getSitStart()** added to `packages/frontend/src/lib/api.ts`:
- Calls `GET /api/leagues/:leagueId/teams/:teamId/pitching/sit-start`
- Follows the same fetchAPI pattern as getStartPlan()

**Streaming page updates** (`packages/frontend/src/app/leagues/[id]/streaming/page.tsx`):
- `PitchingTab` type extended with `"sit-start"` variant
- `SitStartRecommendation` and `SitStartData` interfaces added
- `useQuery` hook added — lazy loaded (only fetches when `activeTab === "sit-start"`)
- `getVerdictBadgeVariant()` helper maps verdict strings to Badge variants
- `formatVerdict()` helper maps verdict strings to display labels ("lean_start" → "Lean Start")
- Tab nav updated: `["gs-pacing", "start-plan", "sit-start", "streaming"]` with "Sit/Start" label
- Sit/Start panel renders:
  - Source attribution row (Pitcherlist article link, Rotoballer article link with "partial" badge if degraded)
  - Loading skeleton during fetch
  - Verdict table with Pitcher, Consensus, Pitcherlist, Rotoballer columns
  - Each verdict badge links to source article in new tab
  - Pitcherlist badge shows tier string (e.g., "Auto-Start") if available, else formatted verdict
  - Rotoballer badge shows formatted verdict + optional numeric grade
  - Empty state: "No external SP rankings available. Rankings are scraped from Pitcherlist and Rotoballer when published."

### Task 2: Human Verify Checkpoint

⚡ Auto-approved checkpoint — visual verification deferred to live environment.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all rendering paths are handled (loading, data, empty state). Rotoballer data is expected to be empty per Plan 01 design (JS-rendered content gracefully returns []).

## Self-Check: PASSED

- FOUND: packages/frontend/src/lib/api.ts contains `getSitStart` and `pitching/sit-start`
- FOUND: packages/frontend/src/app/leagues/[id]/streaming/page.tsx contains `"sit-start"` in PitchingTab type, tab nav, and tab label "Sit/Start"
- FOUND: streaming page contains `api.getSitStart`, `getVerdictBadgeVariant`, `formatVerdict`, "No external SP rankings available"
- COMMITTED: 0984671 feat(77-02): add Sit/Start tab to Pitching Usage page
