---
phase: quick-97
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/db/migrations/018_add_player_espn_asv.sql
  - packages/shared/src/types.ts
  - packages/backend/src/agents/player-pool-sync.ts
  - packages/backend/src/agents/trade-recommendation.ts
autonomous: true
requirements: [TRADE-ASV-FILTER]
must_haves:
  truths:
    - "Trade recommendations only suggest swaps where both players have similar ESPN ASV"
    - "ESPN ASV is stored per player and populated during player pool sync"
    - "Trades between players with wildly different ASV are filtered out"
  artifacts:
    - path: "packages/backend/src/db/migrations/018_add_player_espn_asv.sql"
      provides: "espn_asv column on player table"
      contains: "espn_asv"
    - path: "packages/shared/src/types.ts"
      provides: "espn_asv field on Player interface"
      contains: "espn_asv"
    - path: "packages/backend/src/agents/trade-recommendation.ts"
      provides: "ASV similarity filter in generateTradeCandidates"
      contains: "espn_asv"
  key_links:
    - from: "packages/backend/src/agents/player-pool-sync.ts"
      to: "player table"
      via: "upsert with espn_asv from ESPN draftRanksByRankType"
      pattern: "espn_asv"
    - from: "packages/backend/src/agents/trade-recommendation.ts"
      to: "player table"
      via: "select espn_asv in roster query, filter by similarity"
      pattern: "espn_asv"
---

<objective>
Filter trade recommendations by ESPN ASV (Average Season Value) similarity so only realistic swaps are suggested.

Purpose: Managers won't accept lopsided salary trades. By filtering to players with similar ESPN ASV, recommendations become actionable.
Output: Trade finder only suggests swaps where both players have similar ESPN ASV (within +/-30% or +/-$5, whichever is greater).
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/shared/src/types.ts (Player interface at line 84)
@packages/backend/src/agents/trade-recommendation.ts (generateTradeCandidates at line 349, roster query at line 391-407, trade pair loop at line 510-536)
@packages/backend/src/agents/player-pool-sync.ts (player upsert logic, already reads kona_player_info)
@packages/backend/src/agents/snapshot-orchestrator.ts (player upsert at line 530, onConflict at line 531-537)
@packages/backend/src/db/schema.ts (Database interface)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add espn_asv column and populate during sync</name>
  <files>
    packages/backend/src/db/migrations/018_add_player_espn_asv.sql
    packages/shared/src/types.ts
    packages/backend/src/agents/player-pool-sync.ts
    packages/backend/src/agents/snapshot-orchestrator.ts
  </files>
  <action>
1. Create migration `018_add_player_espn_asv.sql`:
   ```sql
   ALTER TABLE player ADD COLUMN espn_asv NUMERIC DEFAULT NULL;
   COMMENT ON COLUMN player.espn_asv IS 'ESPN Average Season Value (auction dollar value from draftRanksByRankType.STANDARD.auctionValue)';
   ```

2. Update `Player` interface in `packages/shared/src/types.ts` (around line 84-96):
   Add `espn_asv?: number | null;` after `injury_updated_at`.

3. Update `packages/backend/src/agents/player-pool-sync.ts`:
   - In the player data parsing loop (around line 153-202), extract ESPN ASV from `player.draftRanksByRankType?.STANDARD?.auctionValue ?? player.draftRanksByRankType?.ROTO?.auctionValue ?? null`
   - Add `espnAsv: number | null` to the `PlayerData` interface
   - Include `espn_asv` in the upsert values written to the DB

4. Update `packages/backend/src/agents/snapshot-orchestrator.ts`:
   - In the playerRows type (line 441-449), add `espn_asv: number | null` field
   - In the playerRows.push (line 480-488), add `espn_asv: null` (snapshot orchestrator doesn't have ASV data; player-pool-sync handles it)
   - In the onConflict doUpdateSet (line 531-537), do NOT include espn_asv so the snapshot orchestrator doesn't overwrite values set by player-pool-sync. The onConflict only updates specific fields, so simply not including espn_asv preserves it.

5. Rebuild shared package: `cd packages/shared && pnpm build`
  </action>
  <verify>
    Run `cd /Users/jay-work/Code/espn-agent && pnpm build` to confirm TypeScript compiles with the new field. Verify migration file exists. Verify Player interface has espn_asv field.
  </verify>
  <done>espn_asv column defined in migration, Player type updated, player-pool-sync extracts and stores ESPN ASV, snapshot orchestrator type-checks pass without overwriting ASV.</done>
</task>

<task type="auto">
  <name>Task 2: Filter trade candidates by ASV similarity</name>
  <files>
    packages/backend/src/agents/trade-recommendation.ts
  </files>
  <action>
1. In `generateTradeCandidates` (line 349), update the roster query (lines 391-407) to also select `player.espn_asv`:
   Add `"player.espn_asv"` to the select array.

2. Add an ASV similarity filter in the trade pair loop (inside the nested for-loops at lines 510-536). After computing valueDelta and before the existing `if (valueDelta > 0 || positionalContext.fillsNeed)` check, add ASV filtering:

   ```typescript
   // Filter by ESPN ASV similarity for trade realism
   const giveAsv = (givePlayer as any).espn_asv as number | null;
   const receiveAsv = (receivePlayer as any).espn_asv as number | null;

   // Skip if both players have ASV data and values are too far apart
   if (giveAsv != null && receiveAsv != null && giveAsv > 0 && receiveAsv > 0) {
     const asvDiff = Math.abs(giveAsv - receiveAsv);
     const maxAsv = Math.max(giveAsv, receiveAsv);
     const pctDiff = asvDiff / maxAsv;
     // Allow trades within +/-30% OR +/-$5, whichever is more generous
     const withinPct = pctDiff <= 0.30;
     const withinAbsolute = asvDiff <= 5;
     if (!withinPct && !withinAbsolute) {
       continue; // Skip this pair — ASV too far apart
     }
   }
   // If either player has no ASV data, allow the trade (don't penalize missing data)
   ```

   Note: Use proper typing rather than `as any` — since the roster query now selects `espn_asv`, type the destructured roster players appropriately. The `allRosters` array will include `espn_asv` from the join.

3. Add ASV info to the TradeCandidate interface and trade explanation:
   - Add `givePlayerAsv?: number | null` and `receivePlayerAsv?: number | null` to `TradeCandidate` interface
   - Pass ASV values through when constructing candidates (lines 587-602)
   - Optionally mention ASV in the explanation if both values are present (e.g., "Similar value ($12 vs $14).")
  </action>
  <verify>
    Run `cd /Users/jay-work/Code/espn-agent && pnpm build` to confirm TypeScript compiles. Verify that the ASV filter logic is present in the trade pair loop. Grep for "espn_asv" in trade-recommendation.ts to confirm wiring.
  </verify>
  <done>Trade candidate generation filters out pairs where ESPN ASV differs by more than 30% AND more than $5. Players with no ASV data are still included (graceful degradation). ASV values are surfaced in trade candidates.</done>
</task>

</tasks>

<verification>
1. `pnpm build` passes across all packages
2. Migration file `018_add_player_espn_asv.sql` exists with correct ALTER TABLE
3. Player interface includes `espn_asv` field
4. player-pool-sync.ts extracts ASV from ESPN data
5. trade-recommendation.ts filters trade pairs by ASV similarity
6. Grep confirms: `grep -r "espn_asv" packages/backend/src/agents/trade-recommendation.ts` shows filter logic
</verification>

<success_criteria>
- Trade recommendations are filtered to only include swaps where both players have similar ESPN ASV (within +/-30% or +/-$5)
- Players without ASV data are still eligible for trades (no data = no filter)
- Build passes with no type errors
</success_criteria>

<output>
After completion, create `.planning/quick/97-trade-recommendations-should-be-based-on/97-SUMMARY.md`
</output>
