---
phase: quick-8
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared/src/formulas.ts
  - packages/backend/src/agents/draft-rankings.ts
  - packages/backend/src/agents/auction-valuation.ts
autonomous: true
requirements: [QUICK-8]

must_haves:
  truths:
    - "Auction dollar values sum to total league budget across top rostered players"
    - "Position assignments reflect actual positional scarcity (C/RP more valuable than OF)"
    - "Top players have auction values comparable to industry standards (not orders of magnitude off)"
    - "VBD rankings produce reasonable player ordering (elite players ranked higher than replacement level)"
  artifacts:
    - path: "packages/shared/src/formulas.ts"
      provides: "VBD/SGP calculation functions with correct replacement level logic"
      contains: "getReplacementLevel"
    - path: "packages/backend/src/agents/draft-rankings.ts"
      provides: "Position-based replacement level calculation with eligibility handling"
      contains: "replacementSGPs"
    - path: "packages/backend/src/agents/auction-valuation.ts"
      provides: "Dollar value allocation with budget constraint validation"
      contains: "calculateAuctionDollarValue"
  key_links:
    - from: "packages/backend/src/agents/draft-rankings.ts"
      to: "packages/shared/src/formulas.ts"
      via: "getReplacementLevel function call"
      pattern: "getReplacementLevel\\("
    - from: "packages/backend/src/agents/auction-valuation.ts"
      to: "packages/backend/src/agents/draft-rankings.ts"
      via: "VBD rankings dependency"
      pattern: "draftRankingsAgent\\.getRankingsWithConfig"
    - from: "packages/backend/src/agents/auction-valuation.ts"
      to: "packages/shared/src/formulas.ts"
      via: "Dollar value calculation"
      pattern: "calculateAuctionDollarValue"
---

<objective>
Research and fix auction valuation issues where dollar values are too low and position assignments seem incorrect. Compare our VBD/SGP approach against industry standards (ESPN's pre-draft rankings, z-scores vs SGP methodology), identify root cause issues in replacement level calculation or dollar allocation, and fix the calculations to produce realistic auction values.

Purpose: Auction values must be calibrated to real draft economics for the draft assistant to provide useful recommendations. Users expect values consistent with industry standards (e.g., top players $40-50 in 12-team $260 leagues).
Output: Fixed VBD and auction valuation algorithms producing industry-standard dollar values with correct positional scarcity.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/shared/src/formulas.ts
@packages/backend/src/agents/draft-rankings.ts
@packages/backend/src/agents/auction-valuation.ts
@packages/backend/src/api/draft.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Diagnose valuation issues with test dataset</name>
  <files>packages/backend/src/agents/auction-valuation.ts</files>
  <action>
Create a diagnostic script to analyze the current valuation output and identify specific issues. This involves:

1. **Add detailed logging to AuctionValuationAgent.getValuationsWithConfig()** to output intermediate calculations:
   - Total VBD across all players above replacement
   - Spending pool calculation (budget * teams - minBid * roster size * teams)
   - For top 10 players: playerId, playerName, primaryPosition, sgpTotal, vbdScore, dollarValue
   - Budget sum validation (already exists at line 178-199, but ensure it's visible in logs)
   - Replacement level SGP per position (from DraftRankingsAgent)

2. **Research questions to answer:**
   - Are SGP values reasonable? (Elite players should have SGP 10-20+, replacement ~0)
   - Are replacement levels set correctly? (Should be at roster threshold: numTeams * slotsPerPosition + 1)
   - Is VBD spread sufficient? (Top player VBD should be 5-10x replacement player VBD)
   - Does spending pool calculation match expected? (12 teams * $260 budget - 12*25*$1 = $2820 spending pool for typical 12-team/25-roster/$260 league)
   - Are positions assigned correctly? (C/RP should show scarcity premium, OF should not)

3. **Compare against industry benchmarks:**
   - ESPN typical top-10 auction values (12-team, $260 budget): ~$40-50 for elite players
   - Standard deviation approach: Top player ~3-4 stddev above mean should translate to ~15-20% of spending pool
   - Our implementation uses SGP (z-score based), which is theoretically equivalent to standard deviations

4. **Root cause hypotheses to validate:**
   - H1: Replacement level calculation incorrect (getReplacementLevel returning wrong index)
   - H2: SGP calculation has low variance (all players clustered, no separation)
   - H3: Dollar allocation formula dilutes value (proportional split spreads value too thin)
   - H4: Position assignment logic wrong (multi-eligible players not getting scarcity premium)

Don't modify calculation logic yet -- just add logging to expose the values. Use `this.logger?.info()` at key decision points.

Reference audit comments in the code (lines 210-218, 233-235) which already identify issues with replacement level and sparse position handling.
  </action>
  <verify>TypeScript compiles: `cd packages/backend && npx tsc --noEmit`</verify>
  <done>Detailed logging added to expose SGP, VBD, replacement levels, and dollar values for analysis. Diagnostic data ready for review.</done>
</task>

<task type="auto">
  <name>Task 2: Fix replacement level and dollar allocation</name>
  <files>packages/shared/src/formulas.ts, packages/backend/src/agents/draft-rankings.ts, packages/backend/src/agents/auction-valuation.ts</files>
  <action>
Based on Task 1 diagnostics, implement fixes to the valuation calculations:

**Fix 1: Replacement Level Calculation (formulas.ts)**

Current `getReplacementLevel()` returns index of replacement player (line 235: `Math.ceil(totalRostered) + 1`). Verify this is correct:
- For 12 teams, 1 C slot per team: replacement is player #13 (12 rostered + 1)
- For 12 teams, 5 OF slots per team: replacement is player #61 (60 rostered + 1)

If the issue is in DraftRankingsAgent line 212-218 (off-by-one when converting to array index), fix the indexing. Current code subtracts 1 from 1-based index. Guard against edge case: if `replacementIndex <= eligiblePlayers.length` then use index, else set very negative replacement (-10) for sparse positions.

**Fix 2: SGP Component Calculation (draft-rankings.ts)**

Review SGP calculation in `calculateCategorySGPForPlayer()` (lines 308-358). Ensure:
- Rate stats (AVG, OBP, ERA, WHIP) are calculated from components before SGP conversion
- Standard deviation is population stddev (not sample): `Math.sqrt(sum(squared_diffs) / N)` ✓ (correct at line 345)
- Direction inversion for LOWER_BETTER categories ✓ (correct at line 353)

If SGP values are too compressed (e.g., all players between -2 and +2 SGP), the issue is likely input data quality (all projections similar) rather than calculation bug. Log mean and stddev per category to verify.

**Fix 3: VBD Spread (draft-rankings.ts)**

In VBD calculation (lines 232-258), verify max VBD selection across eligible positions. Current logic (line 239-244) correctly picks max VBD across all eligible positions. No fix needed unless diagnostics show primaryPosition assignment is wrong.

**Fix 4: Dollar Allocation Formula (auction-valuation.ts + formulas.ts)**

Current formula (formulas.ts line 278): `dollarValue = (vbd / totalVBD) * spendingPool + minBid`

This is standard VBD-to-dollars conversion. If values are too low, root cause is likely:
- totalVBD denominator too large (many players with positive VBD dilutes value)
- spendingPool numerator too small (budget calculation error)

Validate in logging:
- `totalVBD` should be sum of positive VBD only (line 134 is correct: `rankings.reduce((sum, r) => sum + r.vbdScore, 0)`)
- But this INCLUDES players below replacement (VBD=0). Fix: only sum players with VBD > 0.

Change line 134 to:
```ts
const totalVBD = rankings.reduce((sum, r) => r.vbdScore > 0 ? sum + r.vbdScore : sum, 0);
```

This prevents zero-VBD players from appearing in proportion but diluting the totalVBD denominator.

**Fix 5: Position Scarcity Premium**

Current implementation assigns primaryPosition as the position with max VBD (draft-rankings.ts line 242). This is correct -- C with high VBD vs C replacement gets higher value than same player vs UTIL replacement.

If positions still seem wrong after fixes, add logging to show VBD calculation per eligible position (loop at lines 237-244) to verify scarcity is captured.

**Implementation priorities:**
1. Fix totalVBD to exclude zero-VBD players (auction-valuation.ts line 134)
2. Verify replacement level off-by-one isn't causing issues (check diagnostics first)
3. Add category-level mean/stddev logging to validate SGP spread
4. If issues persist, consider alternative approaches (e.g., percentile-based replacement, z-score capping)

After fixes, re-run with same test config and compare before/after values. Top player in 12-team league should be ~15-18% of spending pool ($40-50 in $260 budget).
  </action>
  <verify>
1. TypeScript compiles: `cd packages/backend && npx tsc --noEmit`
2. Unit test: Create simple test case with 3 players (elite, average, replacement) and verify dollar values sum to budget and are properly distributed
3. Audit log: Budget validation at line 188-199 should show <5% delta
  </verify>
  <done>
- Replacement level calculation verified and fixed if needed
- Dollar allocation only sums positive VBD players
- Auction values for top players are 15-20% of spending pool
- Budget sum validation passes (<5% delta)
- Position assignments reflect scarcity (C/RP premium over OF)
  </done>
</task>

<task type="auto">
  <name>Task 3: Validate against industry benchmarks</name>
  <files>packages/backend/src/agents/auction-valuation.ts</files>
  <action>
Create a validation test to compare our output against expected industry benchmarks:

**Test scenario: 12-team, $260 budget, standard 5x5 roto, 25-player rosters**

Roster slots: C(1), 1B(1), 2B(1), 3B(1), SS(1), OF(5), UTIL(2), SP(9), RP(4)

Expected value distribution (based on ESPN/Yahoo/NFBC historical auctions):
- Top 5 players: $40-55 each (~17-21% of spending pool)
- Top 20 players: $25-45 each (~10-17%)
- Top 50 players: $15-30 each (~6-12%)
- Players 50-150: $5-20 each (~2-8%)
- Players 150-300: $1-8 each (replacement to slightly above)
- Total for top 300 players (12*25=300 rostered): $3120 (12 teams * $260)

**Validation checks:**
1. Sum of top 300 player values = $3120 (within 5%)
2. Top player value is $40-55 (15-20% of spending pool after min bids)
3. Catchers and closers (RP eligible for SV) show scarcity premium vs OF
4. Values decline smoothly (no sudden drops or inversions)

**Add validation to AuctionValuationAgent after line 228:**

```ts
// Validation against industry benchmarks (12-team $260 standard)
if (totalTeams === 12 && budget === 260 && rosteredCount === 300) {
  const top5Avg = valuations.slice(0, 5).reduce((sum, v) => sum + v.dollarValue, 0) / 5;
  const top20Avg = valuations.slice(0, 20).reduce((sum, v) => sum + v.dollarValue, 0) / 20;

  this.logger?.info({
    top5Avg,
    top20Avg,
    topPlayer: valuations[0]?.dollarValue,
    benchmarks: {
      expectedTop5: "40-55",
      expectedTop20: "25-45",
    }
  }, "Industry benchmark comparison (12-team $260 league)");

  if (top5Avg < 35 || top5Avg > 60) {
    this.logger?.warn({ top5Avg }, "Top 5 average auction value outside expected range (40-55)");
  }
}
```

**If values are still off after Task 2 fixes**, consider alternative approaches:
- Use percentile-based replacement levels instead of fixed roster threshold
- Cap SGP at ±3 standard deviations to prevent outlier dominance
- Apply position adjustment factors (e.g., C values * 1.2, OF values * 0.9)

Document findings in code comments explaining why our implementation diverges from industry standards (if it does) or confirming alignment.
  </action>
  <verify>
1. TypeScript compiles: `cd packages/backend && npx tsc --noEmit`
2. Benchmark validation logs show reasonable alignment with industry standards
3. Top player value is $40-55 in standard 12-team scenario
  </verify>
  <done>
- Validation logic added to compare against industry benchmarks
- Top player values align with ESPN/Yahoo standards ($40-55 for 12-team $260)
- Position scarcity is correctly reflected (C/RP premium documented)
- Any deviations from industry standards are explained in code comments
  </done>
</task>

</tasks>

<verification>
- Backend: `cd packages/backend && npx tsc --noEmit` passes
- Manual: Call `/api/draft/auction` with standard 12-team config, verify top player is $40-50
- Audit: Budget sum validation shows <5% delta from expected total
- Compare: Rankings output matches intuitive player ordering (elite > average > replacement)
</verification>

<success_criteria>
- Auction dollar values sum to total league budget (within 5% tolerance)
- Top player in 12-team $260 league valued at $40-55
- Position scarcity correctly reflected (C/RP more valuable than OF at same SGP)
- VBD rankings produce sensible player ordering
- All valuation calculations documented with industry benchmark comparisons
</success_criteria>

<output>
After completion, create `.planning/quick/8-research-and-fix-auction-valuation-issue/8-SUMMARY.md`
</output>
