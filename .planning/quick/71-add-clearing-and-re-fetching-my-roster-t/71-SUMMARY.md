---
phase: 71-add-clearing-and-re-fetching-my-roster-t
plan: "01"
subsystem: extension
tags: [draft-state, zustand, refresh, roster-clearing]
dependency_graph:
  requires: []
  provides: [resetDraftPicks action, clean refresh flow]
  affects: [packages/extension/lib/draft-state.ts, packages/extension/entrypoints/content.tsx]
tech_stack:
  added: []
  patterns: [Zustand partial state reset, DOM-driven state rebuild]
key_files:
  modified:
    - packages/extension/lib/draft-state.ts
    - packages/extension/entrypoints/content.tsx
decisions:
  - "resetDraftPicks clears only draft-progress fields (myRoster, allPicks, teamRosters, currentPick, remainingBudget, projectedStandings) — preserves all rankings, auction values, league config, and user preferences"
  - "resetDraftPicks is called before resolveBackendLeagueMapping so the store is clean before any async work begins in the refresh flow"
metrics:
  duration: "3 minutes"
  completed: "2026-03-08T06:59:29Z"
  tasks: 1
  files: 2
---

# Phase 71 Plan 01: Add Roster Clearing on Refresh Summary

Focused one-task fix that adds `resetDraftPicks` to the Zustand draft store and wires it into `refreshAssistantData` so stale roster data is cleared before the DOM re-scan on each refresh click.

## What Was Built

`resetDraftPicks(initialBudget: number)` — a targeted Zustand action that clears only draft-progress state:
- `myRoster: []`
- `allPicks: []`
- `teamRosters: new Map()`
- `currentPick: 1`
- `remainingBudget: initialBudget`
- `projectedStandings: null`

This is lighter than `initializeDraft` — it intentionally preserves: rankings, auctionValues, userRankingOverrides, espnDomAuctionValues, allTeamBudgets, leagueCategories, detectedRosterSlots, pitcherHitterSplit, and all UI state (sidebarVisible, selectedPosition, showOnlyNeeds).

The refresh flow in `content.tsx` now calls `resetDraftPicks(cachedLeagueConfig?.budget || 260)` as the very first thing in `refreshAssistantData`, before `resolveBackendLeagueMapping` and before the `collectCompletedPicksSnapshot` + `processDetectedPick` calls that rebuild state from DOM picks.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add resetDraftPicks to store + call in refreshAssistantData | 2ae27d3 |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- Extension builds without errors (`pnpm --filter extension build` passed in 1.974s)
- `resetDraftPicks` exists in DraftState interface (line 136), store implementation (line 306), and content.tsx call site (line 356)
- Action clears the correct 6 fields and preserves all others as specified

## Self-Check: PASSED

- `/Users/jay-work/Code/espn-agent/packages/extension/lib/draft-state.ts` — FOUND, contains `resetDraftPicks`
- `/Users/jay-work/Code/espn-agent/packages/extension/entrypoints/content.tsx` — FOUND, contains `resetDraftPicks`
- Commit 2ae27d3 — FOUND
