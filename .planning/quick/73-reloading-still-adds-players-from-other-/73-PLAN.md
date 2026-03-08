---
phase: quick-73
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/entrypoints/content.tsx
  - packages/extension/lib/dom-observers.ts
autonomous: true
requirements: [QUICK-73]

must_haves:
  truths:
    - "Reloading the draft page preserves myRoster without adding other teams' players"
    - "The periodic DOM scan does not re-add picks to myRoster on same-draft reload"
    - "The refresh button clears stale/incorrect roster entries and resyncs cleanly"
    - "New picks detected by MutationObserver during active draft still work correctly"
  artifacts:
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "Fixed processDetectedPick gating and refresh handler"
    - path: "packages/extension/lib/dom-observers.ts"
      provides: "Option to skip initial full-document scan in observeDraftBoard"
  key_links:
    - from: "packages/extension/entrypoints/content.tsx"
      to: "packages/extension/lib/dom-observers.ts"
      via: "observeDraftBoard skipInitialScan option"
      pattern: "observeDraftBoard.*skipInitialScan"
---

<objective>
Fix bug where reloading the ESPN draft page (or clicking refresh) adds other teams' players to myRoster.

Purpose: On same-draft reload, the extension correctly preserves accumulated state (allPicks, myRoster) via Zustand persist. However, `observeDraftBoard` re-scans ALL completed picks from the DOM on every page load, and `processDetectedPick` adds picks to myRoster when `pick.teamId` matches `myTeamId`. Since ESPN DOM teamId assignment is based on grid column position or CSS classes, picks from other teams can match myTeamId and pollute myRoster. The periodic 2-second scan compounds this by continuously re-adding picks.

Output: Fixed content script and DOM observer that gate initial/periodic DOM scans when state is preserved from a same-draft reload.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/entrypoints/content.tsx
@packages/extension/lib/dom-observers.ts
@packages/extension/lib/draft-state.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Gate DOM pick scanning on same-draft reload to prevent roster contamination</name>
  <files>
    packages/extension/entrypoints/content.tsx
    packages/extension/lib/dom-observers.ts
  </files>
  <action>
The bug has two contributing factors that both need fixing:

**Factor 1: `observeDraftBoard` rescans all completed picks on every page load**

In `dom-observers.ts`, `observeDraftBoard` calls `scanEntireDocument()` at line 313 on initial load, and runs a periodic scan every 2 seconds at line 347-349. Both call `processDetectedPick` for ALL completed picks, which then checks `isMyPick` using unreliable ESPN DOM teamId matching.

Fix `observeDraftBoard` to accept an options parameter `{ skipInitialScan?: boolean }`:
- When `skipInitialScan` is true, skip BOTH the initial `scanEntireDocument()` call (line 313) AND the initial `scanCompletedPicks(board)` call inside `startObservingBoard` (line 300). Also skip the periodic `scanEntireDocument` interval (line 347-349).
- The MutationObserver itself should STILL run -- it captures genuinely NEW picks from DOM mutations during the active draft session.
- This way, on same-draft reload, only new picks from mutations get processed, not the entire historical pick set.

**Factor 2: Content script calls `observeDraftBoard` unconditionally**

In `content.tsx`, at line 728:
```ts
const cleanup = observeDraftBoard((pick) => processDetectedPick(pick));
```

This always runs the full initial scan. Change this to pass `{ skipInitialScan: true }` when the draft state was preserved (i.e., when `initializeDraft` detected a same-draft reload).

Detect same-draft reload by checking: the store's `allPicks.length > 0` AFTER `initializeDraft` was called (which already does this check internally). Store a flag like `const statePreserved = useDraftStore.getState().allPicks.length > 0;` right after `initializeDraft` runs (line 226-233), then pass it:
```ts
const cleanup = observeDraftBoard(
  (pick) => processDetectedPick(pick),
  { skipInitialScan: statePreserved }
);
```

**Factor 3: The refresh button should clear and rebuild myRoster correctly**

In `refreshAssistantData`, when `shouldScrapePicksFromDom` is true (allPicks empty), it already calls `resetDraftPicks` then re-collects from DOM. This is correct.

But when the user clicks refresh and `shouldScrapePicksFromDom` is false (allPicks exist), the refresh does nothing for roster issues. Add a roster cleanup step: after fetching rankings/auction values (which refreshes the data used for projected stats), rebuild myRoster from `allPicks` to ensure consistency:

Inside `refreshAssistantData`, after the rankings/auction values fetch block and before the standings computation, add a roster reconciliation when NOT scraping from DOM:
```ts
if (!shouldScrapePicksFromDom) {
  // Reconcile myRoster from allPicks to fix any contamination from prior DOM scans.
  // Only include picks where teamId matches myTeamId from the STORED allPicks
  // (not re-parsed from DOM).
  const currentState = useDraftStore.getState();
  const myTeamId = currentState.myTeamId;
  const myPicksFromStore = currentState.allPicks.filter(
    (p) => p.teamId === myTeamId || p.teamId === "myTeam" || p.teamName === "My Team"
  );

  // Only rebuild if roster count differs from filtered picks (indicates contamination)
  if (currentState.myRoster.length !== myPicksFromStore.length) {
    console.log(
      "[ESPN Draft Assistant] Roster reconciliation: roster had",
      currentState.myRoster.length,
      "players but only",
      myPicksFromStore.length,
      "picks match myTeamId"
    );
    // Rebuild myRoster from allPicks
    const rebuiltRoster = myPicksFromStore.map((pick) => {
      // Try to find existing roster entry to preserve projectedStats
      const existing = currentState.myRoster.find(
        (r) => r.playerId === pick.playerId
      );
      if (existing) return existing;

      const matchingRanking = currentState.rankings.find(
        (ranking) => ranking.playerId === pick.playerId
      );
      return {
        playerId: pick.playerId,
        playerName: pick.playerName,
        positions: pick.positions,
        pickNumber: pick.pickNumber,
        cost: pick.cost,
        projectedStats: matchingRanking?.projectedStats || {},
      };
    });
    useDraftStore.setState({ myRoster: rebuiltRoster });
  }
}
```

Note: This reconciliation also runs on page load since `refreshAssistantData` is called at line 691. So even if some contamination slipped through before this fix, the reconciliation catches it.
  </action>
  <verify>
1. `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension build` compiles without errors
2. Manually verify by reading the changed code:
   - `observeDraftBoard` signature accepts options with `skipInitialScan`
   - When `skipInitialScan` is true, `scanEntireDocument()` and `scanCompletedPicks()` initial calls are skipped, periodic scan interval is not started
   - MutationObserver still runs for genuinely new picks
   - Content script passes `skipInitialScan: true` when allPicks exist after initializeDraft
   - `refreshAssistantData` reconciles myRoster from allPicks when not scraping DOM
  </verify>
  <done>
Reloading the draft page no longer re-scans all completed picks from DOM when state is preserved. myRoster is not contaminated with other teams' players. Refresh button triggers roster reconciliation that removes incorrectly added players. New picks during active draft are still detected via MutationObserver.
  </done>
</task>

</tasks>

<verification>
- Extension builds cleanly: `pnpm --filter extension build`
- `observeDraftBoard` function signature includes `skipInitialScan` option
- Content script conditionally passes `skipInitialScan` based on preserved state
- Roster reconciliation logic exists in `refreshAssistantData`
</verification>

<success_criteria>
- Extension compiles without TypeScript errors
- On same-draft reload: myRoster count stays the same (no extra players added)
- On same-draft reload: periodic scan does not run (no console logs about scanning completed picks)
- On fresh draft or reset: full DOM scan still works as before
- Refresh button reconciles myRoster against allPicks to remove contamination
- New picks from MutationObserver still get processed correctly
</success_criteria>

<output>
After completion, create `.planning/quick/73-reloading-still-adds-players-from-other-/73-SUMMARY.md`
</output>
