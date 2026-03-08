---
phase: 71-add-clearing-and-re-fetching-my-roster-t
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/draft-state.ts
  - packages/extension/entrypoints/content.tsx
autonomous: true
requirements: [REFRESH-ROSTER]

must_haves:
  truths:
    - "Clicking refresh clears stale roster data before re-scanning DOM"
    - "After refresh, myRoster and allPicks reflect only what is currently in the DOM"
    - "Remaining budget resets to detected league budget before picks are re-applied"
    - "Team rosters are cleared and rebuilt from DOM picks on refresh"
  artifacts:
    - path: "packages/extension/lib/draft-state.ts"
      provides: "resetDraftPicks action"
      contains: "resetDraftPicks"
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "Refresh function calls resetDraftPicks before re-collecting"
      contains: "resetDraftPicks"
  key_links:
    - from: "packages/extension/entrypoints/content.tsx"
      to: "packages/extension/lib/draft-state.ts"
      via: "resetDraftPicks action call in refreshAssistantData"
      pattern: "resetDraftPicks"
---

<objective>
Add roster clearing to the refresh button so that myRoster, allPicks, and teamRosters are reset before re-collecting picks from the DOM. Currently, refresh re-fetches rankings and auction values but never clears stale roster data, causing picks to accumulate incorrectly after page reloads or desync.

Purpose: Fix stale roster state on refresh — the existing collectCompletedPicksSnapshot + processDetectedPick flow dedupes against stale data, so clearing first ensures a clean rebuild.
Output: Updated draft-state.ts with resetDraftPicks action, updated content.tsx calling it at start of refreshAssistantData.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/draft-state.ts
@packages/extension/entrypoints/content.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add resetDraftPicks store action and call it in refreshAssistantData</name>
  <files>packages/extension/lib/draft-state.ts, packages/extension/entrypoints/content.tsx</files>
  <action>
1. In `packages/extension/lib/draft-state.ts`:
   - Add `resetDraftPicks: (initialBudget: number) => void` to the `DraftState` interface (after `clearTeamRosters` on line 135).
   - Implement the action in the store body (after `clearTeamRosters` on line 303):
     ```typescript
     resetDraftPicks: (initialBudget) =>
       set({
         myRoster: [],
         allPicks: [],
         teamRosters: new Map(),
         currentPick: 1,
         remainingBudget: initialBudget,
         projectedStandings: null,
       }),
     ```
   This is lighter than `initializeDraft` — it preserves league metadata (leagueId, draftFormat, totalTeams, rosterSize, myTeamId), rankings, auctionValues, user preferences (overrides, pitcherHitterSplit, selectedPosition, showOnlyNeeds), espnDomAuctionValues, allTeamBudgets, leagueCategories, detectedRosterSlots, and all UI state.

2. In `packages/extension/entrypoints/content.tsx`:
   - At the START of the `refreshAssistantData` throttled function body (line 354, before the `resolveBackendLeagueMapping` call), add:
     ```typescript
     // Clear stale roster data before re-collecting from DOM
     const initialBudget = cachedLeagueConfig?.budget || 260;
     useDraftStore.getState().resetDraftPicks(initialBudget);
     ```
   - This ensures that when `collectCompletedPicksSnapshot()` runs at the end (line 395-396), the `processDetectedPick` calls won't dedupe against stale data — they'll rebuild myRoster, allPicks, and teamRosters fresh from the DOM.
   - The `calculateProjectedStandingsFromState()` call on line 384 will initially see empty rosters, but that's fine because the standings are recomputed again inside each `processDetectedPick` call (line 344) as picks are re-added. If no picks exist in DOM, standings correctly show the baseline.
  </action>
  <verify>
    - `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension build` completes without errors
    - Grep confirms `resetDraftPicks` exists in both files: `grep -n "resetDraftPicks" packages/extension/lib/draft-state.ts packages/extension/entrypoints/content.tsx`
  </verify>
  <done>
    - `resetDraftPicks` action exists in DraftState interface and store implementation
    - `refreshAssistantData` calls `resetDraftPicks` with `cachedLeagueConfig?.budget || 260` before any data re-fetching
    - After refresh: myRoster, allPicks, teamRosters are cleared then rebuilt from DOM picks
    - Extension builds successfully
  </done>
</task>

</tasks>

<verification>
- Extension builds without type errors
- `resetDraftPicks` clears myRoster, allPicks, teamRosters, currentPick, remainingBudget, projectedStandings
- `resetDraftPicks` preserves: leagueId, draftFormat, totalTeams, rosterSize, myTeamId, rankings, auctionValues, userRankingOverrides, espnDomAuctionValues, allTeamBudgets, leagueCategories, detectedRosterSlots
- `refreshAssistantData` calls resetDraftPicks before resolveBackendLeagueMapping and before collectCompletedPicksSnapshot
</verification>

<success_criteria>
Refresh button clears all pick/roster state and rebuilds from DOM, ensuring no stale data persists after page reload or desync.
</success_criteria>

<output>
After completion, create `.planning/quick/71-add-clearing-and-re-fetching-my-roster-t/71-01-SUMMARY.md`
</output>
