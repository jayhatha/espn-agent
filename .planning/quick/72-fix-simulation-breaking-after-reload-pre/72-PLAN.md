---
phase: 72-fix-simulation-reload
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/draft-state.ts
  - packages/extension/components/EngineInsights.tsx
autonomous: true
requirements: [RELOAD-01, RELOAD-02, RELOAD-03]

must_haves:
  truths:
    - "Simulation runs after page reload without requiring re-scrape of all picks"
    - "leagueCategories and myTeamId survive page reload via persistence"
    - "teamRosters survive reload when returning to the same draft"
    - "Navigating to a different draft still clears all state"
    - "Projected Standings section no longer renders in the sidebar"
  artifacts:
    - path: "packages/extension/lib/draft-state.ts"
      provides: "Persistent leagueCategories/myTeamId and conditional initializeDraft"
      contains: "leagueCategories"
    - path: "packages/extension/components/EngineInsights.tsx"
      provides: "Sidebar without Projected Standings section"
  key_links:
    - from: "packages/extension/lib/draft-state.ts"
      to: "partialize"
      via: "leagueCategories and myTeamId added to persisted fields"
      pattern: "leagueCategories.*state\\.leagueCategories"
    - from: "packages/extension/lib/draft-state.ts"
      to: "initializeDraft"
      via: "conditional skip when same leagueId with existing picks"
      pattern: "leagueId.*allPicks"
---

<objective>
Fix the forward simulation breaking after page reload by persisting leagueCategories and myTeamId in the Zustand store, preventing initializeDraft from clearing accumulated draft data when reloading the same draft, and removing the non-simulation Projected Standings section from the sidebar UI.

Purpose: After a reload, the simulation currently fails because three preconditions are lost: leagueCategories resets to [], myTeamId resets to null, and teamRosters gets cleared by initializeDraft. This makes the extension unusable after any page refresh during a live draft.

Output: Two modified files that preserve simulation state across reloads and clean up the sidebar.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/draft-state.ts
@packages/extension/components/EngineInsights.tsx
@packages/extension/entrypoints/content.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Persist leagueCategories and myTeamId, conditional initializeDraft</name>
  <files>packages/extension/lib/draft-state.ts</files>
  <action>
Three changes in draft-state.ts:

1. **Add leagueCategories and myTeamId to partialize** (lines 390-412):
   Add these two fields to the partialize return object:
   ```
   leagueCategories: state.leagueCategories,
   myTeamId: state.myTeamId,
   ```
   Both are session-stable values set once at draft start — they never change mid-draft. leagueCategories is detected from the ESPN DOM or defaults to 5x5. myTeamId is detected from the pick train.

2. **Make initializeDraft conditional on same-draft reload** (lines 180-201):
   At the top of the initializeDraft action, check if we are returning to the SAME draft with existing data:
   ```typescript
   initializeDraft: (config) => {
     const current = get();
     // If returning to the same draft and we have persisted picks,
     // only update config fields — do NOT clear draft progress.
     if (
       current.leagueId === config.leagueId &&
       current.allPicks.length > 0
     ) {
       set({
         totalTeams: config.totalTeams,
         rosterSize: config.rosterSize,
         myTeamId: config.myTeamId,
         remainingBudget: config.budget || current.remainingBudget,
         draftFormat: config.draftFormat,
       });
       return;
     }
     // Different draft or fresh start — clear everything
     set({
       leagueId: config.leagueId,
       draftFormat: config.draftFormat,
       totalTeams: config.totalTeams,
       rosterSize: config.rosterSize,
       myTeamId: config.myTeamId,
       remainingBudget: config.budget || 260,
       allPicks: [],
       myRoster: [],
       currentPick: 1,
       teamRosters: new Map(),
       espnDomAuctionValues: {},
       allTeamBudgets: [],
       currentAuctionPlayer: null,
       projectedStandings: null,
       userRankingOverrides: {},
     });
   },
   ```
   The key insight: if `leagueId` matches AND `allPicks.length > 0`, the user is reloading an active draft. We update config fields (which may have changed from improved detection) without destroying accumulated picks, rosters, or DOM-scraped values.

3. **Bump persist version to 3** (line 363):
   Change `version: 2` to `version: 3` since the partialize shape changed. Update the migrate function to handle version 2 -> 3 by preserving existing state. The migrate function should keep the existing logic for teamRosters deserialization and also handle the new fields gracefully (they will be populated on next setLeagueCategories/setMyTeamId call if missing from old state).
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json` to confirm no type errors. Grep for `partialize` in draft-state.ts and confirm leagueCategories and myTeamId appear. Grep for `current.leagueId === config.leagueId` to confirm conditional logic exists.
  </verify>
  <done>
leagueCategories and myTeamId are persisted in partialize. initializeDraft preserves all draft progress (allPicks, myRoster, teamRosters, espnDomAuctionValues, allTeamBudgets) when reloading the same draft. Different draft navigation still clears everything. Persist version bumped to 3.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove Projected Standings section from EngineInsights</name>
  <files>packages/extension/components/EngineInsights.tsx</files>
  <action>
Two changes in EngineInsights.tsx:

1. **Remove projectedStandings from destructuring** (line 14):
   Change `const { simulation, idealRoster, projectedStandings } = engineSignals;`
   to `const { simulation, idealRoster } = engineSignals;`

2. **Delete the entire Projected Standings section** (lines 138-266):
   Remove the entire block from the comment `{/* Projected Standings section */}` through its closing `)}`. This includes the standings table, category ranks, and weak/strong category summary. The engine still computes projectedStandings internally (used for weak category boost in value calculations), but it no longer renders in the sidebar. The user only wants simulation-based Win Probability.

Do NOT remove the IdealRosterPanel or Draft Targets or Nomination Strategy sections — those stay.
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json` to confirm no type errors. Grep for `projectedStandings` in EngineInsights.tsx and confirm zero matches. Confirm the file still contains `simulation`, `idealRoster`, `draftTargets`, and `nominationStrategy` sections.
  </verify>
  <done>
EngineInsights.tsx no longer renders the Projected Standings section. The sidebar shows only Win Probability, Ideal Roster, Draft Targets, and Nomination Strategy.
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors: `npx tsc --noEmit -p packages/extension/tsconfig.json`
2. draft-state.ts partialize includes leagueCategories and myTeamId
3. draft-state.ts initializeDraft has early return for same-draft reload
4. EngineInsights.tsx has no reference to projectedStandings
5. persist version is 3 with backward-compatible migration
</verification>

<success_criteria>
- Simulation preconditions (leagueCategories, myTeamId, teamRosters) all survive page reload for the same draft
- Navigating to a different draft still clears all accumulated state
- Projected Standings section removed from sidebar rendering
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/72-fix-simulation-breaking-after-reload-pre/72-01-SUMMARY.md`
</output>
