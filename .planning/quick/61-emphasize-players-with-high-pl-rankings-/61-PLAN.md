---
phase: 61-emphasize-pl-undervalued-sp-auto-bid
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/auto-bid-controller.ts
autonomous: true
requirements: [ENHANCEMENT]

must_haves:
  truths:
    - "Auto-bid fires on SPs with high PL rank (<=100) that are below ESPN ASV"
    - "Auto-bid fires on any player with elite PL rank (<=30) and low ASV (<$20)"
    - "Auto-bid fires on mid-tier PL rank (<=75) players with ASV under $12"
    - "Console logs clearly identify which bid path triggered (IDEAL, OPPORTUNITY, PL UNDERVALUED)"
    - "Existing IDEAL ROSTER and OPPORTUNITY paths continue to work unchanged"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "Three-path auto-bid strategy with PL undervalued detection"
      contains: "PL UNDERVALUED"
  key_links:
    - from: "packages/extension/lib/auto-bid-controller.ts"
      to: "PlayerRanking.externalRank"
      via: "rankings lookup in evaluateAndBid"
      pattern: "ranking\\.externalRank"
---

<objective>
Add a third auto-bid path ("PL UNDERVALUED") to the AutoBidController that targets players with high PitcherList rankings but relatively low ESPN auction values, with expanded thresholds for starting pitchers. Also widen the existing opportunity path from externalRank <= 50 to <= 100 for SPs specifically.

Purpose: Capture undervalued pitchers and elite-ranked players the market is mispricing, especially deep starting pitchers where PitcherList rankings are most informative.
Output: Updated auto-bid-controller.ts with three-path bidding strategy.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/auto-bid-controller.ts
@packages/extension/lib/api-client.ts (PlayerRanking interface — externalRank, primaryPosition, espnAuctionValue fields)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add PL UNDERVALUED bid path and widen SP opportunity threshold</name>
  <files>packages/extension/lib/auto-bid-controller.ts</files>
  <action>
Modify evaluateAndBid() in AutoBidController to add a third bid path and widen SP opportunity detection. The changes are all within the strategy filter section (lines ~537-586).

**Step 1: Widen opportunity threshold for SPs.**

After the existing `hasHighExternalRank` computation (line 548-549), make it position-aware:

```typescript
// Opportunity: high externally ranked player currently below market price
// SPs get wider threshold (top-100) because PL rankings are deepest for SP
const ranking = state.rankings?.find((r) => r.playerId === playerId);
const isSP = ranking?.primaryPosition === "SP";
const opportunityRankThreshold = isSP ? 100 : 50;
const hasHighExternalRank =
  ranking?.externalRank != null && ranking.externalRank <= opportunityRankThreshold;
const isBelowMarket = espnAsv != null && currentBid < espnAsv;
const isOpportunity = hasHighExternalRank && isBelowMarket;
```

**Step 2: Add PL UNDERVALUED detection after the opportunity check.**

Add a new variable `isPLUndervalued` computed as follows:

```typescript
// Path 3: PL UNDERVALUED — high PL rank but low ASV (market mispricing)
// SP-specific thresholds are more generous because PL SP rankings are deep and reliable
let isPLUndervalued = false;
if (ranking?.externalRank != null && espnAsv != null) {
  const rank = ranking.externalRank;
  if (isSP) {
    // SP thresholds (more generous — PL SP rankings most valuable)
    isPLUndervalued =
      (rank <= 50 && espnAsv < 15) ||
      (rank <= 100 && espnAsv < 10);
  } else {
    // General thresholds
    isPLUndervalued =
      (rank <= 30 && espnAsv < 20) ||
      (rank <= 75 && espnAsv < 12);
  }
}
```

**Step 3: Update the skip guard to include the new path.**

Change the guard from:
```typescript
if (!isIdealTarget && !isOpportunity) {
```
to:
```typescript
if (!isIdealTarget && !isOpportunity && !isPLUndervalued) {
```

Update the skip log to include `isPLUndervalued`:
```typescript
console.log(
  `[AutoBidController] Not a target — skipping (ideal=${!!idealMatch}, tier=${idealMatch?.tier ?? "none"}, extRank=${ranking?.externalRank ?? "none"}, pos=${ranking?.primaryPosition ?? "?"}, belowMkt=${isBelowMarket}, plUnderval=${isPLUndervalued})`
);
```

**Step 4: Update the bid cap computation to handle the three paths.**

The bid cap section needs a third branch. The priority order is: IDEAL > PL UNDERVALUED > OPPORTUNITY (PL undervalued gets a higher cap than plain opportunity because we trust PL's assessment).

Replace the existing bid cap if/else block with:

```typescript
let autoBidCap: number;
let capSource: string;

if (isIdealTarget) {
  if (espnAsv != null) {
    autoBidCap = Math.ceil(espnAsv * 1.1);
    capSource = `IDEAL TARGET, ASV $${espnAsv} +10%`;
  } else {
    const maxBid = this.lastEngineSignals?.optimization?.maxBid;
    if (maxBid != null && maxBid > 0) {
      autoBidCap = maxBid;
      capSource = `IDEAL TARGET, engine maxBid $${maxBid}`;
    } else {
      console.log("[AutoBidController] Ideal target but no ASV or maxBid yet — deferring");
      return;
    }
  }
} else if (isPLUndervalued) {
  // PL says they're better than market thinks — willing to go 15% above ASV
  autoBidCap = Math.ceil(espnAsv! * 1.15);
  capSource = `PL UNDERVALUED, rank #${ranking!.externalRank} ${isSP ? "(SP)" : ""} ASV $${espnAsv} +15%`;
} else {
  // Opportunity: cap at market value
  autoBidCap = espnAsv!;
  capSource = `OPPORTUNITY, ASV $${espnAsv}`;
}
```

**Step 5: Update the class-level JSDoc comment (lines 12-14) to document the third path:**

Add after the "Opportunity bids" line:
```
 * - PL Undervalued (high PL rank + low ASV): bid up to ESPN ASV + 15%
```

These are the ONLY changes. Do NOT modify any nomination logic, DOM interaction logic, subscription logic, or any other method. The change is entirely within evaluateAndBid() plus the class JSDoc.
  </action>
  <verify>
Run TypeScript compilation to ensure no type errors:
```bash
cd packages/extension && npx tsc --noEmit --pretty 2>&1 | head -30
```
Manually verify:
1. The three paths are correctly ordered in priority (ideal > PL undervalued > opportunity)
2. SP detection uses `primaryPosition === "SP"`
3. The skip guard includes all three conditions
4. Console logs clearly label which path triggered
  </verify>
  <done>
auto-bid-controller.ts evaluateAndBid() has three bid paths:
1. IDEAL TARGET: anchor/core from ideal roster, cap ASV + 10% (unchanged)
2. PL UNDERVALUED: elite PL rank + low ASV (rank<=30 & ASV<$20, rank<=75 & ASV<$12, SP-specific: rank<=50 & ASV<$15, rank<=100 & ASV<$10), cap ASV + 15%
3. OPPORTUNITY: high external rank (top-50, or top-100 for SP) + below market, cap at ASV (widened for SP)
Console logs identify which path triggered. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
1. `cd packages/extension && npx tsc --noEmit` passes with no errors
2. Read the updated evaluateAndBid() and confirm:
   - Three distinct bid paths with clear priority ordering
   - SP gets wider opportunity threshold (100 vs 50)
   - PL UNDERVALUED has both general and SP-specific thresholds
   - All console.log messages identify the path name
   - No changes outside evaluateAndBid() and class JSDoc
</verification>

<success_criteria>
- Auto-bid controller has three bid paths: IDEAL TARGET, PL UNDERVALUED, OPPORTUNITY
- SP opportunity threshold widened from 50 to 100
- PL UNDERVALUED path fires for: rank<=30 & ASV<$20, rank<=75 & ASV<$12 (general); rank<=50 & ASV<$15, rank<=100 & ASV<$10 (SP)
- PL UNDERVALUED cap is ASV + 15%
- Console logs clearly label which strategy triggered
- TypeScript compiles without errors
- Existing IDEAL and OPPORTUNITY paths preserve prior behavior for non-SP players
</success_criteria>

<output>
After completion, create `.planning/quick/61-emphasize-players-with-high-pl-rankings-/61-SUMMARY.md`
</output>
