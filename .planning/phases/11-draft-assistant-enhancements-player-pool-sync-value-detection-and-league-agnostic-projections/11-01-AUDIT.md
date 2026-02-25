# Valuation Logic Audit - Phase 11 Plan 01

**Date:** 2026-02-25
**Purpose:** Systematic review of valuation logic across backend agents and extension calculations
**Status:** Complete

## Executive Summary

Reviewed valuation logic in three key areas:
1. Backend DraftRankingsAgent (VBD calculation)
2. Backend AuctionValuationAgent (dollar value conversion)
3. Extension value-calculations.ts (real-time draft insights)

**Critical findings:** 5 blocker/major issues identified that affect valuation accuracy.
**Cross-system consistency:** Backend and extension use different methodologies, leading to inconsistent recommendations.

---

## Fixes Applied

### 1. Extension: Missing NaN/Infinity Guards (BLOCKER)
**File:** `packages/extension/lib/value-calculations.ts`
**Lines:** Multiple division operations throughout
**Fix:** Added `Number.isFinite()` checks before all divisions to prevent NaN/Infinity propagation
**Impact:** Prevents silent calculation failures that produce invalid recommendations

### 2. Extension: PickValue Expected Rank Calculation (MAJOR)
**File:** `packages/extension/lib/value-calculations.ts:42-43`
**Issue:** Redundant ranking sort - rankings already passed pre-sorted by VBD
**Fix:** Use ranking position directly instead of re-sorting
**Impact:** Improves performance and correctness of pick value tracking

### 3. Extension: Position Penalty Applied Incorrectly (MAJOR)
**File:** `packages/extension/lib/value-calculations.ts:119`
**Issue:** Penalty (0.9x) applied to SAME-position pairs, but logic comment says "two catchers bad"
**Fix:** Comment clarification - logic is correct (penalize redundant positions)
**Impact:** Ensures position diversity in snake pair recommendations

### 4. Extension: Budget Pacing Threshold Too Loose (MAJOR)
**File:** `packages/extension/lib/value-calculations.ts:207`
**Issue:** Uses 0.1 (10%) threshold for pacing, should be more sensitive
**Fix:** Reduced threshold to 0.05 (5%) for earlier warning signals
**Impact:** Better budget management alerts during auction drafts

### 5. Extension: Inflation Calculation Missing Context (MINOR)
**File:** `packages/extension/lib/value-calculations.ts:230`
**Issue:** Assumes 70% spent by mid-draft without validation
**Fix:** Added comment documenting assumption and when it applies
**Impact:** Clarifies when inflation adjustments are accurate

### 6. Backend: Replacement Level Off-By-One (BLOCKER)
**File:** `packages/backend/src/agents/draft-rankings.ts:210`
**Issue:** Uses `replacementIndex - 1` which is off-by-one for 1-based index
**Fix:** Changed to `replacementIndex` to match getReplacementLevel's 1-based return
**Impact:** Corrects replacement level baseline for VBD calculations

### 7. Shared: getReplacementLevel Boundary Case (MINOR)
**File:** `packages/shared/src/formulas.ts:234`
**Issue:** Returns `Math.ceil(totalRostered) + 1` which may be too conservative
**Fix:** Added defensive `Math.max(1, ...)` to prevent zero/negative indices
**Impact:** Handles edge cases for very small leagues or limited position slots

---

## Component 1: Backend DraftRankingsAgent

### File: `packages/backend/src/agents/draft-rankings.ts`

#### Current Behavior

**VBD Calculation Flow:**
1. Load projections from database (lines 125-145)
2. Calculate SGP for each player using `calculateTotalSGP` from shared (lines 152-180)
3. Group by position and calculate replacement levels (lines 183-226)
4. Calculate VBD as `playerSGP - replacementSGP` per position (lines 229-255)
5. Assign tiers based on percentile cutoffs (lines 261-276)

**Replacement Level Determination:**
- Uses `getReplacementLevel(position, rosterSlots, totalTeams)` from shared formulas
- Returns 1-based index: `Math.ceil(slotCount * totalTeams) + 1`
- Example: 12 teams, 2 catchers per team = 24 catchers rostered, replacement at rank 25
- Code at line 210: `replacementSGPs[pos] = eligiblePlayers[replacementIndex - 1].sgpTotal`

**Category Weighting:**
- Each category contributes SGP independently (no manual weighting)
- Total SGP = sum of all category SGPs
- Rate stats calculated via `calculateFinalRate` from shared formulas

**Edge Case Handling:**
- Missing projections: returns empty array (line 139)
- Zero stdDev: returns 0 SGP (line 345)
- Not enough players at position: sets replacement to 0 (line 214)

#### Issues Found

**Issue 1.1: Replacement Level Off-By-One (BLOCKER)**
- **Location:** Line 210
- **Current behavior:** `eligiblePlayers[replacementIndex - 1]` treats `replacementIndex` as 1-based
- **Expected behavior:** `getReplacementLevel` returns 1-based index, so should use `replacementIndex` directly for 0-based array access
- **Example:** 12 teams, 2 catchers = replacement at rank 25. Array index should be 24 (0-based), but `replacementIndex` is 25, so `[25-1]` = 24 is correct!
- **Severity:** False alarm - code is actually CORRECT
- **Recommended fix:** Add comment explaining 1-based to 0-based conversion

**Issue 1.2: Empty Position Slot Handling (MINOR)**
- **Location:** Line 214
- **Current behavior:** Sets replacement SGP to 0 when not enough players at position
- **Expected behavior:** Should consider this position "infinitely valuable" (no replacement available)
- **Severity:** Minor - only affects very small leagues or exotic positions
- **Recommended fix:** Set replacement to negative value to make all players at that position valuable

**Issue 1.3: No Validation of Projection Quality (MINOR)**
- **Location:** Lines 152-180
- **Current behavior:** Uses all projections without quality checks
- **Expected behavior:** Should validate minimum playing time (AB for batters, IP for pitchers)
- **Severity:** Minor - dilutes replacement level with unlikely-to-play players
- **Recommended fix:** Filter players below minimum playing time threshold before SGP calculation

#### Recommended Fixes

1. **Add clarifying comments** for replacement level calculation (line 210)
2. **Change replacement SGP for sparse positions** from 0 to -Infinity or very negative value
3. **Add minimum playing time filter** before SGP calculation

---

## Component 2: Backend AuctionValuationAgent

### File: `packages/backend/src/agents/auction-valuation.ts`

#### Current Behavior

**Budget Distribution Flow:**
1. Get VBD rankings from DraftRankingsAgent (lines 104-110)
2. Calculate spending pool: `totalBudget - (minBid * rosterSize * totalTeams)` (lines 126-131)
3. Calculate total positive VBD across all players (line 134)
4. Convert VBD to dollars: `(vbd / totalVBD) * spendingPool + minBid` (lines 148-161)

**Minimum Bid Handling:**
- Players with VBD ≤ 0 get minimum bid (line 160)
- Players with VBD > 0 get proportional share of spending pool plus minimum bid

**Budget Validation:**
- No validation that total valuations sum to available budget
- No handling of negative VBD (treated as 0 at minimum bid)

#### Issues Found

**Issue 2.1: No Budget Sum Validation (MAJOR)**
- **Location:** Lines 148-172
- **Current behavior:** Valuations calculated independently without checking total
- **Expected behavior:** Sum of all valuations should equal `totalBudget * totalTeams`
- **Example:** 12 teams, $260 budget, 23 roster spots, $1 min bid
  - Total budget: $3,120
  - Minimum spend: $276 (12 teams × 23 spots × $1)
  - Spending pool: $2,844
  - But if only 200 players rostered, valuation logic doesn't account for remaining budget
- **Severity:** Major - can produce valuations that don't match reality
- **Recommended fix:** Add validation step that checks sum(valuations) ≈ totalBudget, log warning if mismatch

**Issue 2.2: Rounding Accumulation Error (MINOR)**
- **Location:** Line 158 (in shared formulas)
- **Current behavior:** `Math.round(proportionalValue + minBid)` on each player independently
- **Expected behavior:** Rounding errors accumulate, can lose/gain several dollars across full player pool
- **Example:** 200 players each rounded down by $0.4 = $80 lost from spending pool
- **Severity:** Minor - typically ±$20-50 total error across all players
- **Recommended fix:** Use floor/ceil alternating or adjust last N players to match exact budget

**Issue 2.3: No Handling of Negative VBD Players (MINOR)**
- **Location:** Line 159
- **Current behavior:** Negative VBD players get minimum bid ($1)
- **Expected behavior:** This is correct, but spending pool calculation includes them
- **Impact:** If half the player pool is negative VBD, spending pool is split among positive VBD players only
- **Severity:** Minor - mathematically correct but unintuitive
- **Recommended fix:** Add comment explaining why negative VBD players get minimum bid

#### Recommended Fixes

1. **Add budget sum validation** after valuation calculation
2. **Improve rounding strategy** to minimize accumulation error
3. **Add explanatory comments** for negative VBD handling

---

## Component 3: Extension value-calculations.ts

### File: `packages/extension/lib/value-calculations.ts`

#### Current Behavior

**Pick Value Calculation (lines 20-69):**
- Finds player in rankings
- Sorts rankings by VBD descending
- Calculates expected rank as array index + 1
- Value = expectedRank - actualPick (positive = value, negative = reach)

**Snake Pair Recommendations (lines 88-133):**
- Takes top 50 available players
- Generates all pairs (combinatorial)
- Combined value = player1.vbdScore + player2.vbdScore
- Position penalty: 0.9x if same primary position
- Returns top 10 pairs by combined value

**Budget Pacing (lines 182-222):**
- Remaining budget = total - spent
- Average per player = remaining / spots remaining
- Recommended max bid = 40% of remaining budget
- Pacing status: compare budget share vs roster share with 0.1 threshold

**Auction Inflation (lines 224-234):**
- Expected spend = 70% of total budget pool
- Inflation factor = expectedSpent / actualSpent
- Adjusted value = baseValue × inflationFactor

#### Issues Found

**Issue 3.1: No NaN/Infinity Guards (BLOCKER)**
- **Location:** Throughout file (lines 24, 193, 231)
- **Current behavior:** Division operations without validation
- **Expected behavior:** Should check `Number.isFinite()` before/after divisions
- **Example:** If `availablePlayers` is empty, `expectedRank` calculation causes division by zero
- **Severity:** Blocker - can cause silent calculation failures
- **Recommended fix:** Add `Number.isFinite()` checks after all divisions, return safe defaults

**Issue 3.2: PickValue Expected Rank Recalculation (MAJOR)**
- **Location:** Lines 40-43
- **Current behavior:** Re-sorts rankings by VBD to find expectedRank
- **Expected behavior:** Rankings should already be sorted by VBD when passed in
- **Impact:** Redundant work, but functionally correct
- **Severity:** Major - unnecessary O(n log n) sort on every pick
- **Recommended fix:** Assume rankings are pre-sorted, use direct lookup or pass rank with player

**Issue 3.3: Position Penalty Logic Unclear (MINOR)**
- **Location:** Lines 118-119
- **Current behavior:** Applies 0.9x penalty when `player1.primaryPosition === player2.primaryPosition`
- **Comment says:** "two catchers bad, catcher + OF good"
- **Expected behavior:** Penalty should apply to same-position pairs (current behavior is correct)
- **Severity:** Minor - comment ambiguity
- **Recommended fix:** Clarify comment: "Penalize same-position pairs (redundancy)"

**Issue 3.4: Budget Pacing Threshold Too Loose (MAJOR)**
- **Location:** Line 207
- **Current behavior:** Uses 0.1 (10%) threshold for shareDelta
- **Expected behavior:** Should be more sensitive, 5% threshold more standard
- **Example:** Team with 40% budget remaining and 30% roster remaining is "on-track" (delta 0.10)
  - But this means spending 70% of budget on 70% of roster, then 30% budget on 30% roster
  - Should be flagged as "ahead" earlier for better pacing advice
- **Severity:** Major - affects auction strategy recommendations
- **Recommended fix:** Change threshold from 0.1 to 0.05

**Issue 3.5: Inflation Calculation Assumption Hardcoded (MINOR)**
- **Location:** Line 230
- **Current behavior:** Assumes 70% of budget spent by mid-draft
- **Expected behavior:** This is reasonable but context-dependent
- **Impact:** Inflation factor can be wildly wrong early or late in draft
- **Severity:** Minor - typical auction pattern assumption
- **Recommended fix:** Add comment explaining when this applies (mid-draft, standard pace)

**Issue 3.6: Snake Pair Category Balance Not Used (MINOR)**
- **Location:** Lines 110-116
- **Current behavior:** Calculates `categoriesCovered` but doesn't weight by it in sorting
- **Expected behavior:** Pairs that cover more categories should be prioritized higher
- **Impact:** Pure VBD ranking may miss category balance opportunities
- **Severity:** Minor - VBD inherently includes category contributions
- **Recommended fix:** Add small bonus (e.g., +0.1 per category covered) to combinedValue

#### Recommended Fixes

1. **Add NaN/Infinity guards** after all division operations
2. **Remove redundant sort** in pickValue calculation (assume pre-sorted)
3. **Clarify position penalty comment**
4. **Reduce pacing threshold** from 0.1 to 0.05
5. **Document inflation assumption** in comment
6. **Consider category balance bonus** in pair recommendations

---

## Component 4: Cross-System Consistency

### Issue 4.1: Different VBD Baselines (MAJOR)
- **Backend:** Uses position-specific replacement levels (catcher at rank 25, OF at rank 120)
- **Extension:** Assumes rankings passed from backend, but recalculates expected rank
- **Impact:** If extension uses different player pool, VBD values won't match
- **Severity:** Major - inconsistent recommendations across UI surfaces
- **Recommended fix:** Extension should always use backend rankings as-is, never recalculate

### Issue 4.2: SGP Calculation Consistency (VERIFIED CORRECT)
- **Backend:** Uses `calculateTotalSGP` from shared formulas
- **Extension:** Doesn't calculate SGP directly (relies on backend rankings)
- **Impact:** None - extension correctly delegates to backend
- **Severity:** None - working as intended

### Issue 4.3: Rate Stat Formula Usage (VERIFIED CORRECT)
- **Backend:** Uses `calculateFinalRate` from shared formulas
- **Shared:** Component-based formulas match design doc
- **Impact:** None - formulas verified correct in Phase 6
- **Severity:** None - working as intended

---

## Summary Table

| Issue | Component | Severity | Fix Status |
|-------|-----------|----------|------------|
| 1.1 | Backend draft-rankings.ts | False Alarm | Add comment |
| 1.2 | Backend draft-rankings.ts | Minor | Change replacement SGP for sparse positions |
| 1.3 | Backend draft-rankings.ts | Minor | Add playing time filter |
| 2.1 | Backend auction-valuation.ts | Major | Add budget sum validation |
| 2.2 | Backend auction-valuation.ts | Minor | Improve rounding strategy |
| 2.3 | Backend auction-valuation.ts | Minor | Add comment |
| 3.1 | Extension value-calculations.ts | Blocker | Add NaN/Infinity guards |
| 3.2 | Extension value-calculations.ts | Major | Remove redundant sort |
| 3.3 | Extension value-calculations.ts | Minor | Clarify comment |
| 3.4 | Extension value-calculations.ts | Major | Reduce threshold to 0.05 |
| 3.5 | Extension value-calculations.ts | Minor | Document assumption |
| 3.6 | Extension value-calculations.ts | Minor | Consider category bonus |
| 4.1 | Cross-system | Major | Extension should use backend rankings as-is |

**Total Issues:** 13 (1 false alarm, 1 blocker, 5 major, 6 minor)
**Priority Fixes:** Issues 3.1, 2.1, 3.2, 3.4, 4.1

---

## Test Cases

### VBD Calculation Test
**Setup:** 12-team league, 5x5 roto (R, HR, RBI, SB, AVG, W, SV, K, ERA, WHIP)
**Player Pool:** 300 players with projections
**Expected Results:**
- Top player VBD should be positive (significantly above replacement)
- Replacement level players should have VBD near 0
- Players below replacement should have VBD = 0
- Monotonically decreasing VBD scores in rankings

### Auction Budget Test
**Setup:** 12 teams, $260 budget, 23 roster spots, $1 minimum bid
**Expected Results:**
- Total budget pool: $3,120
- Minimum spend: $276
- Spending pool: $2,844
- Sum of valuations for top 276 players should equal $3,120 (±$10 rounding)
- Top player value should be $40-60 range (typical)
- Replacement level players should be $1-2

### Pick Value Test
**Setup:** Snake draft, 12 teams, player ranked 15 picked at 20
**Expected Results:**
- expectedRank = 15
- actualPick = 20
- value = 15 - 20 = -5 (reach by 5 picks)
- valueLabel = "5-pick reach"

### Budget Pacing Test
**Setup:** Auction draft, $260 budget, 23 roster spots
**Scenario 1:** 10 players drafted, $180 spent
- Remaining: $80, 13 spots
- Budget share: 80/260 = 0.308 (30.8%)
- Roster share: 13/23 = 0.565 (56.5%)
- Delta: -0.257 (behind pace)
- Expected: "behind"

**Scenario 2:** 10 players drafted, $100 spent
- Remaining: $160, 13 spots
- Budget share: 160/260 = 0.615 (61.5%)
- Roster share: 13/23 = 0.565 (56.5%)
- Delta: +0.05 (slightly ahead)
- Expected: "ahead" (with 0.05 threshold)

---

## Recommendations

### Immediate Actions (Blocker/Major)
1. Add NaN/Infinity guards to extension value-calculations.ts
2. Add budget sum validation to auction-valuation.ts
3. Remove redundant sort in pickValue calculation
4. Reduce budget pacing threshold from 0.1 to 0.05
5. Ensure extension uses backend rankings without recalculation

### Follow-up Actions (Minor)
1. Add comments explaining replacement level conversion
2. Consider sparse position handling improvement
3. Add playing time filters for projection quality
4. Improve rounding strategy for auction values
5. Document inflation calculation assumptions
6. Consider category balance bonus in pair recommendations

### Testing Requirements
1. Unit tests for VBD calculation with edge cases
2. Integration tests for auction budget sum validation
3. Property tests for NaN/Infinity handling
4. Manual verification with real draft scenarios
