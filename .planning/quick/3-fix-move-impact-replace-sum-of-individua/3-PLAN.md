---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/agents/transaction-impact.ts
  - packages/backend/src/api/transaction-impact.ts
  - packages/frontend/src/app/leagues/[id]/moves/page.tsx
autonomous: true
requirements: [QUICK-3]

must_haves:
  truths:
    - "Frontend 'Roster Mgmt Value' card shows the single draft-baseline counterfactual delta, not a sum of per-move impacts"
    - "Avg Impact/Move is displayed as a secondary stat derived from totalImpact / totalMoves"
    - "The old sum-of-individual-impacts is still returned in the API as sumOfIndividualImpacts for backward compat but not prominently displayed"
  artifacts:
    - path: "packages/backend/src/agents/transaction-impact.ts"
      provides: "computeNetRosterValue method"
      contains: "computeNetRosterValue"
    - path: "packages/backend/src/api/transaction-impact.ts"
      provides: "netRosterValue in GET response summary"
      contains: "netRosterValue"
    - path: "packages/frontend/src/app/leagues/[id]/moves/page.tsx"
      provides: "Updated summary cards with Roster Mgmt Value prominent"
      contains: "Roster Mgmt Value"
  key_links:
    - from: "packages/backend/src/api/transaction-impact.ts"
      to: "packages/backend/src/agents/transaction-impact.ts"
      via: "agent.computeNetRosterValue(leagueId, season, teamId)"
      pattern: "computeNetRosterValue"
    - from: "packages/frontend/src/app/leagues/[id]/moves/page.tsx"
      to: "GET /api/leagues/:leagueId/teams/:teamId/transaction-impacts"
      via: "summary.netRosterValue"
      pattern: "netRosterValue"
---

<objective>
Replace the misleading sum-of-individual-impacts "Net Impact" metric with a proper
Net Roster Management Value computed from a single draft-baseline counterfactual.

Purpose: The current totalImpact sums independently-computed per-move impacts which
overlap and double-count (all measured against the same actual outcome). A team that
churns 50 players accumulates inflated "total impact." The correct metric is: "What
would your roto points be if you kept ONLY your draft-day roster?" — one computation,
no double-counting, rewards quality over churn.

Output: Updated agent, API, and frontend showing the correct metric prominently.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/backend/src/agents/transaction-impact.ts
@packages/backend/src/api/transaction-impact.ts
@packages/frontend/src/app/leagues/[id]/moves/page.tsx
@packages/frontend/src/lib/api.ts
@packages/backend/src/utils/roto-ranking.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add computeNetRosterValue to TransactionImpactAgent</name>
  <files>packages/backend/src/agents/transaction-impact.ts</files>
  <action>
Add a new public method `computeNetRosterValue` to the `TransactionImpactAgent` class:

```typescript
async computeNetRosterValue(
  leagueId: number,
  season: number,
  teamId: number,
): Promise<{ netRosterValue: number; draftOnlyRotoPoints: number; actualRotoPoints: number } | null>
```

Implementation logic:

1. Get league categories via `this.getLeagueCategories(leagueId)`. Return null if empty.

2. Get final snapshot date via `this.getFinalSnapshotDate(leagueId, season)`. Return null if missing.

3. Get actual team final components for ALL teams via `this.getTeamFinalComponents(leagueId, finalSnapshotDate)`.

4. Compute actual roto points for all teams via `this.computeRotoPointsFromComponents(...)`.

5. Get draft-day roster for the target team. Query `roster_move` table:
   ```sql
   SELECT player_id FROM roster_move
   WHERE league_id = ? AND team_id = ? AND move_type = 'draft'
   ```
   This gives the set of players the team started with on draft day.

6. For each draft pick, call `this.sumPlayerContributionAnywhere(leagueId, playerId, startDate, finalSnapshotDate)` where startDate is the season start (`${season}-04-01`). This captures the player's FULL season production on any team (the counterfactual assumes you would have kept them).

7. Build `draftOnlyComponents`: sum all draft pick contributions into a single `Record<string, number>`. This represents the team's components if they had kept only their draft roster all season.

8. Recompute rate stat `_val_` entries for draftOnlyComponents using the same pattern as `computeSingleMoveImpact` (lines 601-624 in the existing code):
   - For RATE categories with a formulaId, call `calculateFinalRate` on the accumulated components
   - For COUNTING categories, set `_val_{statKey}` = the raw counting stat value

9. Build a counterfactual league: clone `teamFinalComponents`, replace the target team's components with `draftOnlyComponents`.

10. Call `this.computeRotoPointsFromComponents(counterfactualTeamComponents, categories, numTeams)`.

11. Return:
    - `actualRotoPoints`: the team's actual roto points
    - `draftOnlyRotoPoints`: the team's roto points with draft-only roster
    - `netRosterValue`: actualRotoPoints - draftOnlyRotoPoints (positive = roster management helped)

Key: This is a SINGLE counterfactual computation. Not a sum. The draft-only baseline is "what if you never made a single roster move all season."

Important: The `sumPlayerContributionAnywhere` method uses `lineup_slot_id <= 15` (active roster only). This is correct for the counterfactual — it captures what the player actually produced while starting for whatever team they ended up on.
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/backend/tsconfig.json` to confirm no type errors.
  </verify>
  <done>
`computeNetRosterValue` method exists on `TransactionImpactAgent`, takes (leagueId, season, teamId), returns `{ netRosterValue, draftOnlyRotoPoints, actualRotoPoints }` or null, compiles without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update API endpoint and frontend to use netRosterValue</name>
  <files>
    packages/backend/src/api/transaction-impact.ts
    packages/frontend/src/app/leagues/[id]/moves/page.tsx
  </files>
  <action>
**Backend API** (`packages/backend/src/api/transaction-impact.ts`):

In the GET `/api/leagues/:leagueId/teams/:teamId/transaction-impacts` handler:

1. After fetching impacts from the DB (around line 100), instantiate the agent and call the new method:
   ```typescript
   const agent = new TransactionImpactAgent(db, request.log as any);
   const netResult = await agent.computeNetRosterValue(leagueId, season, teamId);
   ```

2. Update the summary object to include:
   - `netRosterValue`: from `netResult?.netRosterValue ?? null` — the new primary metric
   - `actualRotoPoints`: from `netResult?.actualRotoPoints ?? null`
   - `draftOnlyRotoPoints`: from `netResult?.draftOnlyRotoPoints ?? null`
   - `avgImpactPerMove`: `impacts.length > 0 ? Math.round((totalImpact / impacts.length) * 100) / 100 : 0`
   - `sumOfIndividualImpacts`: rename from `totalImpact` (keep the value, rename the key for clarity)
   - Keep `totalMoves`, `bestMove`, `worstMove` as they are
   - Remove the old `totalImpact` key (replaced by `sumOfIndividualImpacts`)

**Frontend** (`packages/frontend/src/app/leagues/[id]/moves/page.tsx`):

1. Update the summary cards grid (lines 178-208) to show 5 cards in a `md:grid-cols-5` layout:

   Card 1 — "Total Moves" (unchanged):
   - Value: `summary.totalMoves`

   Card 2 — "Roster Mgmt Value" (the NEW primary metric):
   - Value: `summary.netRosterValue` displayed with `<ImpactBadge>`
   - Subtitle text (text-xs text-gray-400): show actual vs draft-only, e.g. `"{actualRotoPoints} actual vs {draftOnlyRotoPoints} draft-only"`
   - If `netRosterValue` is null, show "N/A" in gray

   Card 3 — "Avg Impact/Move" (new secondary stat):
   - Value: `summary.avgImpactPerMove` displayed with `<ImpactBadge>`

   Card 4 — "Best Move" (unchanged)

   Card 5 — "Worst Move" (unchanged)

2. Update the inline summary in the team selector bar (line 156-163):
   - Change `Total: <ImpactBadge impact={summary.totalImpact} />` to use `summary.netRosterValue` if available, falling back to `summary.sumOfIndividualImpacts`
   - Label it "Roster Mgmt:" instead of "Total:"

3. Remove any references to `summary.totalImpact` (it no longer exists in the API response; it's been renamed to `sumOfIndividualImpacts`).
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/backend/tsconfig.json && npx tsc --noEmit -p packages/frontend/tsconfig.json` to verify both compile. Then run `cd /Users/jay-work/Code/espn-agent && pnpm run build` to confirm full build succeeds.
  </verify>
  <done>
API returns `summary.netRosterValue`, `summary.avgImpactPerMove`, and `summary.sumOfIndividualImpacts`. Frontend shows "Roster Mgmt Value" as the primary metric with actual-vs-draft subtitle, "Avg Impact/Move" as secondary, and no longer displays the misleading raw sum prominently. Full build passes.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes for both backend and frontend
2. `pnpm run build` succeeds
3. API response shape for GET transaction-impacts includes `summary.netRosterValue`, `summary.avgImpactPerMove`, `summary.sumOfIndividualImpacts` and does NOT include `summary.totalImpact`
4. Frontend summary cards show "Roster Mgmt Value" prominently with draft-only comparison subtitle
</verification>

<success_criteria>
- The "Roster Mgmt Value" shown on the Moves page is computed from a single draft-baseline counterfactual, not a sum of per-move impacts
- The old misleading sum is still available in the API as `sumOfIndividualImpacts` but not prominently shown
- Average impact per move is displayed as a secondary stat
- Both backend and frontend compile and build without errors
</success_criteria>

<output>
After completion, create `.planning/quick/3-fix-move-impact-replace-sum-of-individua/3-SUMMARY.md`
</output>
