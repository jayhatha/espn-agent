---
quick_task: 37
status: complete
duration: 2min
completed: 2026-03-04
tasks_completed: 1
files_modified: 3
commit: bebdabb
key_decisions:
  - "Pick train Strategy 0 queries .pick-train__content__picks-container .picklist--item (with fallback to any .picklist--item), making team count detection reliable on auction pages where grid-column and dropdown strategies both fail"
  - "detectMyTeam() uses .auction-pick-component--own (on .content div, not outer wrapper) as the ESPN class signal; team number prefix stripped for display, retained as teamId"
  - "5-second budget polling interval is auction-only — wired into startPickTrainBudgetPolling() alongside existing auctionTableScrapeInterval for consistent lifecycle management"
  - "setMyTeamId() and setRemainingBudget() added as explicit store actions instead of reusing initializeDraft to avoid resetting other state fields"
---

# Quick Task 37: Detect Team Count and User's Team from ESPN Auction Pick Train DOM Summary

**One-liner:** Pick train DOM detection for team count (Strategy 0) and user's own team via `auction-pick-component--own` with 5-second budget refresh polling.

## What Was Built

Added pick train-based detection to the ESPN Draft Assistant extension:

1. **Strategy 0 in `detectTeamCount()`** — queries `.pick-train__content__picks-container .picklist--item` first (most reliable on auction pages), falling back to any `.picklist--item` on the page, before trying the existing grid-column/dropdown/header strategies.

2. **`detectMyTeam()`** — finds `.auction-pick-component--own` (ESPN's own-team marker on the `.content` div), extracts team name (stripping the `"13. "` number prefix), parses `$XXX` budget text from `.cash`, and returns `{ teamName, teamId, remainingBudget }`.

3. **`detectAllTeamBudgets()`** — iterates all `.picklist--item` elements to collect every team's name and remaining budget as an array, useful for monitoring budget landscape during draft.

4. **Store actions** — added `setMyTeamId(teamId)` and `setRemainingBudget(budget)` to `useDraftStore` for targeted state updates without touching other fields.

5. **content.tsx integration** — calls `detectMyTeam()` immediately after `detectLeagueConfig()` and applies results to the store; starts a 5-second `pickTrainBudgetInterval` for auction drafts (cleaned up on `beforeunload`); also hooks into the delayed auction format detection path.

## Files Modified

- `packages/extension/lib/draft-config-detector.ts` — Strategy 0 + `detectMyTeam()` + `detectAllTeamBudgets()` exports
- `packages/extension/lib/draft-state.ts` — `setMyTeamId` and `setRemainingBudget` actions
- `packages/extension/entrypoints/content.tsx` — imports, detectMyTeam call, `startPickTrainBudgetPolling()`, cleanup

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- Commit `bebdabb` exists: confirmed
- Build succeeded: `wxt build` produced `content-scripts/content.js` (324 kB) with no errors
- All three files modified and staged individually
