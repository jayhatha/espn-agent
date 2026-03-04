---
quick_task: 33
plan: 1
status: pending
---

# Quick Task 33: Fix budget zero on reload + dismissable warnings

## Task 1: Persist draft state across reloads

**Files:** `packages/extension/lib/draft-state.ts`

**Problem:** `partialize` only saves 4 fields (`userRankingOverrides`, `selectedPosition`, `showOnlyNeeds`, `teamRosters`). On reload, `myRoster`, `allPicks`, `currentPick`, `remainingBudget`, `draftFormat`, `leagueId` all reset to defaults, losing all draft progress.

**Fix:**
1. Add `myRoster`, `allPicks`, `currentPick`, `remainingBudget`, `draftFormat`, `leagueId`, `rosterSize`, `totalTeams` to `partialize`
2. Update `initializeDraft` to preserve roster/budget state when the league hasn't changed (only reset if different league)

## Task 2: Make config warnings dismissable

**Files:** `packages/extension/lib/draft-state.ts`, `packages/extension/components/DraftSidebar.tsx`

**Fix:**
1. Add `dismissConfigWarnings` action to draft store
2. Add a dismiss/close button to the warning banner in DraftSidebar
