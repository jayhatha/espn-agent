---
phase: quick-102
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/agents/gs-pacing.ts
  - packages/backend/src/agents/faab-tracker.ts
autonomous: true
must_haves:
  truths:
    - "GS season summary shows 0 GS used pre-season (not 261)"
    - "FAAB summary shows $1000 budget (not $100)"
    - "Start plan only recommends SPs, not relief pitchers"
  artifacts:
    - path: "packages/backend/src/agents/gs-pacing.ts"
      provides: "Fixed GS pacing with no roster snapshot fallback and SP-only filtering"
    - path: "packages/backend/src/agents/faab-tracker.ts"
      provides: "Fixed FAAB budget default and broader field name matching"
  key_links: []
---

<objective>
Fix three bugs in GS pacing agent and FAAB tracker that produce incorrect data on the dashboard.

Purpose: GS tracker shows 261 starts (should be 0), FAAB shows $100 (should be $1000), and start planner recommends RPs (should only recommend SPs).
Output: Corrected gs-pacing.ts and faab-tracker.ts
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/backend/src/agents/gs-pacing.ts
@packages/backend/src/agents/faab-tracker.ts
@packages/shared/src/types.ts (Player interface — has `positions: string[]`)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix GS pacing — remove roster snapshot fallback and filter RPs from start plan</name>
  <files>packages/backend/src/agents/gs-pacing.ts</files>
  <action>
Bug 1 — Remove countGsFromRosterSnapshots entirely:
- Delete the `countGsFromRosterSnapshots` method (lines 412-427)
- In `getSeasonSummary`, remove the third fallback block (lines 52-54) that calls `countGsFromRosterSnapshots`
- The fallback chain should be: getGsFromCategoryTotals -> estimateGsFromIP -> default to 0 (the existing `gsUsed ?? 0` on line 56 already handles this)

Bug 3 — Filter RPs from start plan recommendations:
- In `getStartPlan`, after fetching `rosterPitchers` (line 210-223), join the `player` table to get `p.positions` (it is a `string[]` / text array column)
- Add `p.positions` to the select clause (it is `string[]` in the Player type from shared/types.ts, stored as a text array in PostgreSQL)
- In the for loop over `rosterPitchers` (line 236), add an early filter: skip pitchers whose `positions` array does NOT include "SP". Use: `if (!pitcher.positions.includes("SP")) continue;` — this filters out pure RPs even if they have IP projections
- As a secondary filter, also skip pitchers with projected IP < 80 RoS (these are likely RPs/bulk relievers even if they have SP eligibility). Add after the projection lookup: `if (projectedIP !== null && projectedIP < 80) continue;`
- Remove the old weak filter at lines 268-270 (`if (!isPitcher && pitcher.roster_slot === "BENCH") continue;`) since the new SP position check is more robust
  </action>
  <verify>Run `npx tsc --noEmit -p packages/backend/tsconfig.json` to verify no type errors. Grep for `countGsFromRosterSnapshots` — should return zero results. Grep for `positions` in gs-pacing.ts — should show the new filter.</verify>
  <done>GS fallback chain ends at estimateGsFromIP then defaults to 0. Start plan only includes players with "SP" in their positions array and projected IP >= 80.</done>
</task>

<task type="auto">
  <name>Task 2: Fix FAAB budget default and field name matching</name>
  <files>packages/backend/src/agents/faab-tracker.ts</files>
  <action>
- Change `DEFAULT_FAAB_BUDGET` from 100 to 1000 (line 17). This is a single-user app for league 112523 which has $1000 FAAB.
- In `getFaabBudget` (line 283-300), expand the field name search to check multiple possible ESPN field names. After checking `acqRules?.acquisition_budget`, also check:
  - `acqRules?.acquisitionBudget` (camelCase variant)
  - `acqRules?.budget` (short form)
  - `acqRules?.faab_budget` (explicit FAAB name)
  - Also check the top-level settings JSON: `json.acquisitionBudget`, `json.acquisition_budget`
- Use a helper pattern like: check each field, return first truthy numeric value found, otherwise fall through to DEFAULT_FAAB_BUDGET
- Add a debug log when falling back to default: `this.logger?.warn({ leagueId }, "FAAB budget not found in settings, using default")`
  </action>
  <verify>Run `npx tsc --noEmit -p packages/backend/tsconfig.json` to verify no type errors. Grep for `DEFAULT_FAAB_BUDGET` — should show 1000.</verify>
  <done>FAAB default is 1000. getFaabBudget checks multiple field name variants before falling back to default.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p packages/backend/tsconfig.json` passes
- No references to `countGsFromRosterSnapshots` remain in codebase
- `DEFAULT_FAAB_BUDGET` is 1000
- Start plan query joins player table for positions filtering
</verification>

<success_criteria>
- GS season summary defaults to 0 when no category totals or IP data exists (pre-season)
- FAAB budget shows 1000 for league 112523
- Start plan recommendations exclude pure RPs and low-IP pitchers
</success_criteria>

<output>
After completion, create `.planning/quick/102-fix-gs-tracker-counting-roster-slots-not/102-SUMMARY.md`
</output>
