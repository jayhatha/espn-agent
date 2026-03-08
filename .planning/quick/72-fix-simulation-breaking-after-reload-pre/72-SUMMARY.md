---
phase: quick-72
plan: 01
subsystem: extension
tags: [draft-state, persistence, simulation, reload, EngineInsights]
dependency_graph:
  requires: []
  provides: [same-draft-reload-persistence, simulation-preconditions-survival]
  affects: [draft-state.ts, content.tsx, EngineInsights.tsx]
tech_stack:
  added: []
  patterns: [conditional-persist-on-reload, dom-scrape-guard]
key_files:
  modified:
    - packages/extension/lib/draft-state.ts
    - packages/extension/entrypoints/content.tsx
    - packages/extension/components/EngineInsights.tsx
decisions:
  - "Conditional initializeDraft: same-draft reload preserves allPicks/myRoster/teamRosters by checking leagueId match + allPicks.length > 0"
  - "refreshAssistantData guards DOM scraping: checks allPicks.length at top, skips resetDraftPicks + collectCompletedPicksSnapshot when state is preserved"
  - "Persist version bumped 2->3 with full-clear migration for old state (safe since old state didn't have correct same-draft reload logic)"
  - "Remove Projected Standings section from sidebar: engine computes it internally for value calcs but user only wants simulation-based Win Probability"
metrics:
  duration: 8min
  completed: 2026-03-08T07:15:04Z
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 72: Fix Simulation Breaking After Reload Summary

**One-liner:** Persist leagueCategories/myTeamId/allPicks across page reloads for same-draft sessions, guarding DOM re-scrape to prevent myRoster contamination from other teams' players.

## What Was Built

On page reload, the extension was losing three simulation preconditions: `leagueCategories` reset to `[]`, `myTeamId` reset to `null`, and `teamRosters` got cleared by `initializeDraft`. Additionally, `refreshAssistantData` would re-scrape all picks from the DOM and incorrectly assign other teams' players to `myRoster` due to teamId matching issues.

This fix implements:

1. **Conditional `initializeDraft`** (`draft-state.ts`): When `leagueId` matches AND `allPicks.length > 0`, the user is reloading the same active draft. Only config fields are updated — all accumulated state (picks, rosters, budgets, DOM values) is preserved. Different draft navigation still clears everything.

2. **`leagueCategories` and `myTeamId` added to `partialize`** (`draft-state.ts`): These session-stable values now survive page reload via `chrome.storage.local`. `leagueCategories` is the key simulation input that was resetting to `[]` on reload.

3. **Persist version 3** (`draft-state.ts`): Bumped from 2 with backward-compatible migration. Old state from v2 triggers a full clear (safe — old state didn't have correct same-draft logic).

4. **DOM scrape guard in `refreshAssistantData`** (`content.tsx`): Checks `allPicks.length` at the top before any state clearing. When picks exist (preserved state), skips both `resetDraftPicks` and `collectCompletedPicksSnapshot` + `processDetectedPick` loop. Rankings and auction values still refresh. Explicit console log when scrape is skipped.

5. **Remove Projected Standings section** (`EngineInsights.tsx`): Deleted the entire `<details>` block for standings table, my category ranks, and weak/strong summary. Removed `projectedStandings` from destructuring. Sidebar now shows: Win Probability, Ideal Roster, Draft Targets, Nomination Strategy only.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `060e844` | feat(quick-72): persist draft state across reloads, skip DOM re-scrape on same-draft reload |
| 2 | `1890ef7` | feat(quick-72): remove Projected Standings section from EngineInsights sidebar |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added DOM scrape guard to content.tsx**
- **Found during:** Task 1 analysis
- **Issue:** The plan specified changes to `draft-state.ts` and `EngineInsights.tsx` only, but user clarification identified that `refreshAssistantData` in `content.tsx` also needed guarding to prevent myRoster contamination on same-draft reload
- **Fix:** Added `shouldScrapePicksFromDom` check at top of `refreshAssistantData` — when `allPicks.length > 0` (preserved state), skip `resetDraftPicks` + DOM pick scraping entirely
- **Files modified:** `packages/extension/entrypoints/content.tsx`
- **Commit:** `060e844`

## Self-Check

Files exist:
- [x] `packages/extension/lib/draft-state.ts` — FOUND
- [x] `packages/extension/entrypoints/content.tsx` — FOUND
- [x] `packages/extension/components/EngineInsights.tsx` — FOUND

Commits exist:
- [x] `060e844` — FOUND
- [x] `1890ef7` — FOUND

Key invariants verified:
- [x] `partialize` includes `leagueCategories` and `myTeamId` (line 440-441)
- [x] `initializeDraft` checks `current.leagueId === config.leagueId && current.allPicks.length > 0` (line 182)
- [x] Persist version is 3 (line 376)
- [x] Zero references to `projectedStandings` in `EngineInsights.tsx`
- [x] `shouldScrapePicksFromDom` guards both `resetDraftPicks` and `collectCompletedPicksSnapshot` in `content.tsx`

## Self-Check: PASSED
