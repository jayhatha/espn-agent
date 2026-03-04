---
quick_task: 37
plan: 1
status: pending
---

# Quick Task 37: Detect Team Count and User's Team from ESPN Auction Pick Train DOM

## Task 1: Add pick train detection strategies to draft-config-detector + detect user team

**Files:** `packages/extension/lib/draft-config-detector.ts`, `packages/extension/lib/dom-observers.ts`, `packages/extension/entrypoints/content.tsx`

**Problem:** Current `detectTeamCount()` uses grid columns, dropdowns, and text parsing — none of which work reliably in ESPN auction drafts. The auction pick train (`.picklist--item` elements) is always visible and is the most reliable source. Also, user's own team is never detected — it's identifiable via `auction-pick-component--own` class.

**Approach:**

In `draft-config-detector.ts`:
1. Add a new **Strategy 0** (first priority) to `detectTeamCount()`:
   - Query `.picklist--item` elements inside `.pick-train__content__picks-container`
   - Count = number of elements found
   - Validate 2-20 range

2. Add new exported function `detectMyTeam()`:
   - Find element with `.auction-pick-component--own` class
   - Extract team name from `.team-name` child element
   - Extract remaining budget from `.cash` child element (parse `$XXX`)
   - Extract team number from team name prefix (e.g., "13. Nathan Fielders" → team index 13)
   - Return `{ teamName, teamId, remainingBudget }` or null

3. Also add `detectAllTeamBudgets()`:
   - Iterate all `.picklist--item` elements
   - For each: extract team name, remaining budget from `.cash`
   - Return `Map<string, { teamName, remainingBudget }>`

In `content.tsx` or where `detectLeagueConfig` is called:
- After calling `detectLeagueConfig`, also call `detectMyTeam()`
- If myTeam found, call `store.setMyTeamId(teamId)` and update `remainingBudget`
- Set up a 5-second interval to re-detect budgets from pick train (budgets change during draft)

**Verify:** Build succeeds, team count detected from pick train, user's team identified.
**Done:** Extension accurately detects team count and identifies user's team from auction pick train.
