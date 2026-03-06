---
phase: "45"
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/api-client.ts
  - packages/extension/lib/engine/inflation.ts
  - packages/extension/lib/engine/index.ts
autonomous: true
requirements: [BUG-01, BUG-02, BUG-03, BUG-04]

must_haves:
  truths:
    - "Practice drafts never make network calls to backend /api/draft/espn"
    - "Inflation percentage reflects actual league budget vs remaining player value ratio, not raw FanGraphs pool"
    - "Nominated player is correctly identified by name when ESPN ID lookup fails"
    - "Max bid recommendation shows a meaningful bid (not always $1/pass) for nominated players in the FG pool"
  artifacts:
    - path: "packages/extension/lib/api-client.ts"
      provides: "Practice draft early return in getDraftBoardData"
      contains: "isPracticeDraft"
    - path: "packages/extension/lib/engine/inflation.ts"
      provides: "Budget-normalized inflation calculation"
      contains: "totalInitialBudget"
    - path: "packages/extension/lib/engine/index.ts"
      provides: "Name-based nominated player fallback matching"
      contains: "normalizeName.*currentAuctionPlayer"
  key_links:
    - from: "packages/extension/lib/api-client.ts"
      to: "isPracticeDraft()"
      via: "early return null in getDraftBoardData"
      pattern: "isPracticeDraft.*return null"
    - from: "packages/extension/lib/engine/index.ts"
      to: "packages/extension/lib/engine/bid-optimizer.ts"
      via: "nominatedPlayer passed to computeMaxBid"
      pattern: "computeMaxBid.*targetPlayer"
---

<objective>
Fix four related bugs in the Chrome extension draft engine: (1) practice drafts unnecessarily call the backend API, (2) inflation is always negative because FanGraphs dollar values aren't normalized to the league's actual budget, (3-4) the AI narrator always advises "pass" and max bid always says "pass" because the nominated player lookup fails when ESPN IDs don't match FanGraphs/MLBAM IDs.

Purpose: Make the extension functional for practice drafts and produce accurate inflation/bid recommendations during live auction drafts.
Output: Three fixed source files with corrected logic.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/api-client.ts
@packages/extension/lib/engine/inflation.ts
@packages/extension/lib/engine/index.ts
@packages/extension/lib/engine/bid-optimizer.ts
@packages/extension/lib/engine/types.ts
@packages/extension/lib/draft-config-detector.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix practice draft backend call and inflation normalization</name>
  <files>packages/extension/lib/api-client.ts, packages/extension/lib/engine/inflation.ts</files>
  <action>
**File 1: packages/extension/lib/api-client.ts — getDraftBoardData() function (line ~328)**

Add an early return at the top of `getDraftBoardData()`, BEFORE the cache check and `dedupedRequest` call:

```typescript
export async function getDraftBoardData(): Promise<...> {
  // Practice drafts don't have backend league data — skip network call entirely
  // and let callers fall back to bundled FanGraphs data
  if (isPracticeDraft()) {
    console.log("[API Client] Practice draft — skipping backend draft board fetch");
    return null;
  }

  if (cachedDraftBoardData !== undefined) return cachedDraftBoardData;
  // ... rest unchanged
}
```

The `isPracticeDraft` import already exists at line 3. This ensures `getRankings()` and `getAuctionValues()` immediately fall through to `buildBundledRankings()` without any network calls for practice drafts.

**File 2: packages/extension/lib/engine/inflation.ts — computeInflation() function**

The root cause: FanGraphs dollar values (used for `totalRemainingValue`) are calibrated to a $260-per-team pool, but the sum of all FG player dollar values typically far exceeds the league's actual total budget. When `totalRemainingBudget / totalRemainingValue < 1.0`, inflation is always negative.

Fix: normalize `totalRemainingValue` so the full FG player pool scales to match the league's actual total budget.

After computing `totalRemainingBudget` (line ~41) and before the core formula (line ~44), add normalization:

```typescript
// Compute total league budget for normalization
const totalInitialBudget = allTeamBudgets.length > 0
  ? allTeamBudgets.reduce((sum, t) => sum + t.remainingBudget, 0)
    + allPicks.reduce((sum, p) => sum + (p.cost ?? 0), 0)  // remaining + spent = initial
  : 260 * totalTeams;

// FanGraphs dollar values are calibrated to an idealized pool that may differ from
// the league's actual total budget. Normalize so the full auction value pool scales
// to the league's budget. Without this, inflation is always negative when
// sum(FG dollars) > league budget.
const totalAuctionValuePool = auctionValues.reduce((sum, av) => sum + av.dollarValue, 0);
const normalizationFactor = totalAuctionValuePool > 0
  ? totalInitialBudget / totalAuctionValuePool
  : 1.0;
const normalizedRemainingValue = totalRemainingValue * normalizationFactor;
```

Then update the core formula to use `normalizedRemainingValue`:

```typescript
const rawFactor = normalizedRemainingValue > 0
  ? totalRemainingBudget / normalizedRemainingValue
  : 1.0;
```

Also update the return to include the raw remaining value for debugging:

```typescript
return {
  inflationFactor,
  rawInflationFactor: rawFactor,
  totalRemainingBudget,
  totalRemainingValue: normalizedRemainingValue,  // Use normalized for display
  confidence,
  percentOverMarket: Math.round((inflationFactor - 1) * 100),
};
```
  </action>
  <verify>Run `cd packages/extension && npx tsc --noEmit` to confirm no type errors. Verify that `isPracticeDraft` is called in `getDraftBoardData` and that `normalizedRemainingValue` is used in the inflation formula.</verify>
  <done>Practice drafts return null from getDraftBoardData without any fetch call. Inflation formula normalizes FanGraphs dollar values to the league's actual budget, producing accurate positive/negative percentages instead of always-negative.</done>
</task>

<task type="auto">
  <name>Task 2: Fix nominated player matching for max bid and narrator</name>
  <files>packages/extension/lib/engine/index.ts</files>
  <action>
**Root cause:** In `computeRosterOptimization()` (lines 248-262), the nominated player lookup chain is:
1. Find in `auctionValues` by ESPN `playerId` (line 252-253) — fails when bundled FG data uses MLBAM IDs
2. If found, look up by normalized name in `allPlayers` (FG pool) — never reached if step 1 fails
3. Fallback to `allPlayers[0]` (line 262) — computes maxBid for wrong player

**Fix:** Add a name-based fallback when the ID-based lookup fails. The `currentAuctionPlayer` object in the Zustand store has a `playerName` field from the DOM. Thread the player name through `DraftEngineInput` so it's available for fallback matching.

**Step 1:** In `packages/extension/lib/engine/types.ts`, the `DraftEngineInput` interface already has `currentAuctionPlayerId?: number`. Add an optional name field:

Actually, looking at the code more carefully, the player name is already available. The `currentAuctionPlayer` in Zustand has `playerName`, but only `playerId` is threaded through as `currentAuctionPlayerId` in `use-draft-engine.ts` (line 46). The fix should thread the name too.

**In packages/extension/lib/engine/types.ts** — Add to `DraftEngineInput` interface after `currentAuctionPlayerId`:
```typescript
currentAuctionPlayerName?: string;
```

**In packages/extension/lib/use-draft-engine.ts** — Thread the player name alongside the ID. After line 26 (`const currentPlayerId = currentAuctionPlayer?.playerId;`), add:
```typescript
const currentPlayerName = currentAuctionPlayer?.playerName;
```

In the `computeDraftEngine` call (line 46), add:
```typescript
currentAuctionPlayerName: currentPlayerName,
```

And add `currentPlayerName` to the useMemo deps array.

**In packages/extension/lib/engine/index.ts** — Replace the nominated player lookup block (lines 248-262) with improved matching:

```typescript
    // Find nominated player in the available pool
    let nominatedPlayer: PoolPlayer | undefined;

    if (input.currentAuctionPlayerId != null) {
      // Strategy 1: Match via auctionValues ID lookup -> FG pool name match
      const nominated = input.auctionValues.find(
        av => av.playerId === input.currentAuctionPlayerId,
      );
      if (nominated) {
        const nName = normalizeName(nominated.playerName ?? '');
        nominatedPlayer = allPlayers.find(p => p.normalizedName === nName);
      }
    }

    // Strategy 2: Direct name match from DOM-observed player name
    // Handles practice drafts where ESPN player IDs don't match FG/MLBAM IDs
    if (!nominatedPlayer && input.currentAuctionPlayerName) {
      const domName = normalizeName(input.currentAuctionPlayerName);
      nominatedPlayer = allPlayers.find(p => p.normalizedName === domName);
    }

    // If no match found, don't fall back to allPlayers[0] — that computes
    // maxBid for the wrong player. Instead, skip bid computation entirely.
    if (!nominatedPlayer) {
      // No player data available — return safe defaults
      const elapsed = Math.round((performance.now() - t0) * 10) / 10;
      // Still compute top targets and shopping list even without a nominated player
```

Wait — this would require significant restructuring. Let me take a simpler approach. The key change is:
1. Add name-based fallback for nominated player matching
2. When `nominatedPlayer` is still not found, use `null` instead of `allPlayers[0]`
3. When `nominatedPlayer` is null, skip the bid computation and return maxBid=0, shouldBid=false

Replace lines 247-304 (the bid cache block) with:

```typescript
    // Find nominated player in the available pool
    let nominatedPlayer: PoolPlayer | undefined;

    if (input.currentAuctionPlayerId != null) {
      // Strategy 1: Match via auctionValues ID lookup -> FG pool name match
      const nominated = input.auctionValues.find(
        av => av.playerId === input.currentAuctionPlayerId,
      );
      if (nominated) {
        const nName = normalizeName(nominated.playerName ?? '');
        nominatedPlayer = allPlayers.find(p => p.normalizedName === nName);
      }

      // Strategy 2: Direct name match from DOM-observed player name
      // Handles practice drafts where ESPN player IDs don't match FG/MLBAM IDs
      if (!nominatedPlayer && input.currentAuctionPlayerName) {
        const domName = normalizeName(input.currentAuctionPlayerName);
        nominatedPlayer = allPlayers.find(p => p.normalizedName === domName);
      }
    }

    if (nominatedPlayer) {
      // Compute max bid only when we have a real nominated player match
      maxBidResult = computeMaxBid(
        nominatedPlayer,
        allPlayers,
        sgpValues,
        myBudget,
        remainingSlots,
        opponentModel,
        inflation.inflationFactor,
      );

      // Opponent budgets for Monte Carlo
      const opponentBudgets: number[] = [];
      for (const [, budget] of opponentModel.teamBudgets) {
        opponentBudgets.push(budget);
      }

      // Compute my current roster SGP
      let myCurrentRosterSGP = 0;
      for (const drafted of input.myRoster) {
        const draftedNorm = normalizeName(drafted.playerName);
        const poolIdx = allPlayers.findIndex(p => p.normalizedName === draftedNorm);
        if (poolIdx >= 0) {
          myCurrentRosterSGP += sgpValues[poolIdx] ?? 0;
        }
      }

      monteCarloResult = runMonteCarlo({
        availablePlayers: allPlayers,
        sgpValues,
        myCurrentRoster: [],
        myCurrentRosterSGP,
        myBudget,
        opponentBudgets,
        rosterSlots: remainingSlots,
        nominatedPlayer,
        nominatedBid: maxBidResult.maxBid,
        numSimulations: 200,
      });
    }

    cachedBidResult = maxBidResult && monteCarloResult
      ? { maxBid: maxBidResult, monteCarlo: monteCarloResult }
      : null;
    bidCacheKey = newBidCacheKey;
```

IMPORTANT: Move the `myCurrentRosterSGP` computation INSIDE the `if (nominatedPlayer)` block (it was previously outside). The variable is only used in the Monte Carlo call which is also inside this block.

Then update the return block (line ~420-431) to handle null results:

```typescript
  return {
    maxBid: maxBidResult?.maxBid ?? 0,
    expectedMarketPrice: maxBidResult?.expectedMarketPrice ?? 0,
    valueSurplus: maxBidResult?.valueSurplus ?? 0,
    shouldBid: monteCarloResult?.shouldBid ?? false,
    topTargets,
    opponentPressure: opponentModel.competitionFactors,
    simulationEV: monteCarloResult?.expectedTeamValue ?? 0,
    simulationStdDev: monteCarloResult?.valueStdDev ?? 0,
    computeTimeMs: elapsed,
    shoppingList,
  };
```

Also fix the same pattern in the forward simulation section (line ~745-755 in `computeDraftEngine`). The decision comparison code also looks up the nominated player. This already has its own fallback logic using `normalizeName`, but add the same `input.currentAuctionPlayerName` fallback there too:

After line 753 (the existing name lookup for simulation), add a fallback:
```typescript
              if (nomIdx < 0 && input.currentAuctionPlayerName) {
                const domName = normalizeName(input.currentAuctionPlayerName);
                const domIdx = allPlayersOpt.findIndex(p => p.normalizedName === domName);
                if (domIdx >= 0) nomIdx = domIdx;
              }
```

This uses the same `let nomIdx` variable so it needs to change from `const` to `let`.
  </action>
  <verify>Run `cd packages/extension && npx tsc --noEmit` to confirm no type errors. Grep for `allPlayers[0]` in index.ts to confirm the bad fallback is removed. Grep for `currentAuctionPlayerName` to confirm name-based matching is wired through types, hook, and engine.</verify>
  <done>Nominated player is found via name matching when ESPN ID lookup fails. When no match exists in the FG pool, maxBid returns 0 (not a misleading value for the wrong player). The narrator receives accurate shouldBid/maxBid signals based on the actual nominated player.</done>
</task>

</tasks>

<verification>
1. `cd packages/extension && npx tsc --noEmit` — no type errors
2. Grep `isPracticeDraft` in api-client.ts getDraftBoardData — confirms early return
3. Grep `normalizedRemainingValue` in inflation.ts — confirms budget normalization
4. Grep `currentAuctionPlayerName` in types.ts, use-draft-engine.ts, index.ts — confirms name threading
5. Grep `allPlayers\[0\]` in index.ts — confirms bad fallback is removed
</verification>

<success_criteria>
- Practice drafts produce no backend network calls from getDraftBoardData
- Inflation percentage is proportional to actual league spending vs. player value (not always negative)
- Nominated player is matched by name when ID systems differ (practice draft, bundled data)
- Max bid and shouldBid reflect the actual nominated player, not allPlayers[0]
</success_criteria>

<output>
After completion, create `.planning/quick/45-bug-fixes-remove-espn-league-connection-/45-01-SUMMARY.md`
</output>
