# Phase 15: Fix Empty Categories in SGP Calculation - Research

**Researched:** 2026-02-28
**Domain:** Bug fix - data flow and type mapping
**Confidence:** HIGH

## Summary

The bug causing all auction values to be $1 has been identified: **categories detected by the DOM-based detector are missing the `formula_id` and `required_components` fields required for RATE stat calculations**. This causes the SGP calculation in DraftRankingsAgent to receive incomplete category definitions, resulting in empty or zero-valued SGP arrays, which in turn causes all auction values to collapse to the minimum bid of $1.

**Root cause:** `packages/extension/lib/draft-config-detector.ts` lines 526-531 define RATE stats (AVG, ERA, WHIP) without the `formula_id` field that is required by `calculateFinalRate()` in the shared formulas module.

**Primary recommendation:** Add `formula_id` and `required_components` fields to all RATE stat category definitions in `mapStatNameToCategory()` and `getDefault5x5Categories()` to match the format expected by the SGP calculation engine.

## Call Chain Analysis

### The Flow from Frontend to Backend

1. **Extension calls API** (`packages/extension/lib/api-client.ts:918-989`)
   - `getAuctionValues()` fetches ESPN settings via `fetchEspnLeagueSettings()`
   - Falls back to DOM detection via `detectLeagueConfig()` for practice drafts
   - Serializes categories as JSON string in query params: `categories: JSON.stringify(espnConfig.categories)`

2. **Backend parses query** (`packages/backend/src/api/draft.ts:19-73`)
   - `validateDraftConfig()` parses the JSON string back to Category array
   - Validates each category has: `category_id`, `stat_key`, `type`, `direction`
   - **NOTE: Does NOT validate `formula_id` or `required_components`** - these are optional on the Category type

3. **Backend creates config** (`packages/backend/src/api/draft.ts:346-416`)
   - Passes validated categories to `AuctionValuationAgent.getValuationsWithConfig()`
   - Config flows through: draft.ts → AuctionValuationAgent → DraftRankingsAgent

4. **SGP calculation fails** (`packages/backend/src/agents/draft-rankings.ts:153-195`)
   - `getRankingsWithConfig()` receives categories and calls `calculateTotalSGP()`
   - Shared formula `calculateTotalSGP()` (`packages/shared/src/formulas.ts:155-207`) attempts to calculate RATE stats
   - Line 178: `statValue = calculateFinalRate(category.formula_id, {}, projection)`
   - **BUG: `formula_id` is undefined for DOM-detected categories**
   - `calculateFinalRate()` (line 76-93) throws error or returns 0 for unknown formula
   - Category gets skipped (line 187: `continue`)
   - Total SGP collapses to zero or near-zero values
   - All auction values become $1 (minimum bid)

## Root Cause Locations

### Primary Issue: Missing formula_id in DOM Detector

**File:** `/Users/jay-work/Code/espn-agent/packages/extension/lib/draft-config-detector.ts`

**Lines 526-531:** RATE stat definitions missing `formula_id`

```typescript
"AVG": { category_id: "AVG", stat_key: "AVG", type: "RATE", direction: "HIGHER_BETTER", name: "Batting Average" },
"ERA": { category_id: "ERA", stat_key: "ERA", type: "RATE", direction: "LOWER_BETTER", name: "ERA" },
"WHIP": { category_id: "WHIP", stat_key: "WHIP", type: "RATE", direction: "LOWER_BETTER", name: "WHIP" },
```

**Should be:**

```typescript
"AVG": { category_id: "AVG", stat_key: "AVG", type: "RATE", direction: "HIGHER_BETTER", name: "Batting Average", formula_id: "avg", required_components: ["AB", "H"] },
"ERA": { category_id: "ERA", stat_key: "ERA", type: "RATE", direction: "LOWER_BETTER", name: "ERA", formula_id: "era", required_components: ["IP", "ER"] },
"WHIP": { category_id: "WHIP", stat_key: "WHIP", type: "RATE", direction: "LOWER_BETTER", name: "WHIP", formula_id: "whip", required_components: ["IP", "H", "BB"] },
```

**Lines 542-554:** Same issue in `getDefault5x5Categories()` fallback

### Secondary Issue: ESPN API Mapping Complete

**File:** `/Users/jay-work/Code/espn-agent/packages/extension/lib/api-client.ts`

**Lines 73-81:** ESPN stat mapping already includes `formula_id` and `required_components` correctly

```typescript
3: { key: "AVG", name: "Batting Average", type: "RATE", formulaId: "avg", requiredComponents: ["AB", "H"] },
47: { key: "ERA", name: "Earned Run Average", type: "RATE", formulaId: "era", requiredComponents: ["ER", "IP"] },
41: { key: "WHIP", name: "WHIP", type: "RATE", formulaId: "whip", requiredComponents: ["IP", "H", "BB"] },
```

**Lines 213-216:** Mapping correctly transfers `formula_id` and `required_components` to Category objects

```typescript
formula_id: mapping.formulaId,
required_components: mapping.requiredComponents,
```

**Conclusion:** ESPN API path works correctly. Only DOM detection path is broken.

## Verification Points

### How to Confirm the Fix

1. **Unit test:** Create category with missing `formula_id`, verify `calculateTotalSGP()` returns 0
2. **Unit test:** Create category with valid `formula_id`, verify `calculateTotalSGP()` returns non-zero
3. **Integration test:** Call `/api/draft/auction` with DOM-detected categories, verify auction values > $1
4. **Manual test:** Load extension in practice draft, verify auction values match industry benchmarks ($40-55 for top player in 12-team $260 league)

### Diagnostic Logs to Check

**Before fix:**
```json
{"categories":[],"msg":"Category statistics for SGP calculation"}
```

**After fix:**
```json
{"categories":[
  {"categoryId":"AVG","mean":"0.25","stdDev":"0.03","min":"0.18","max":"0.32"},
  {"categoryId":"ERA","mean":"4.20","stdDev":"0.85","min":"2.50","max":"6.50"},
  ...
],"msg":"Category statistics for SGP calculation"}
```

## Files to Modify

### 1. draft-config-detector.ts (PRIMARY FIX)

**Path:** `/Users/jay-work/Code/espn-agent/packages/extension/lib/draft-config-detector.ts`

**Changes:**
- Line 526: Add `formula_id: "avg"` and `required_components: ["AB", "H"]` to AVG mapping
- Line 530: Add `formula_id: "era"` and `required_components: ["IP", "ER"]` to ERA mapping
- Line 531: Add `formula_id: "whip"` and `required_components: ["IP", "H", "BB"]` to WHIP mapping
- Lines 548, 552, 553: Same changes in `getDefault5x5Categories()` fallback

**Additional RATE stats to handle (if present):**
- OBP: `formula_id: "obp"`, `required_components: ["AB", "H", "BB", "HBP", "SF"]`
- OPS: `formula_id: "ops"`, `required_components: ["AB", "H", "BB", "HBP", "SF", "TB"]`
- SLG: `formula_id: "slg"`, `required_components: ["AB", "TB"]`
- K/9: `formula_id: "k9"`, `required_components: ["IP", "K"]`

**Reference:** See `ESPN_STAT_MAP` in `api-client.ts` lines 61-82 for correct mappings

### 2. Type Safety Enhancement (OPTIONAL)

**File:** `/Users/jay-work/Code/espn-agent/packages/shared/src/types.ts`

**Current Category type (lines 28-36):**
```typescript
export interface Category {
  category_id: string;
  name: string;
  stat_key: string;
  type: CategoryType;
  direction: CategoryDirection;
  required_components?: string[];
  formula_id?: string;
}
```

**Consideration:** Make `formula_id` and `required_components` required for RATE stats using discriminated union:

```typescript
export type Category = CountingCategory | RateCategory;

interface CountingCategory {
  category_id: string;
  name: string;
  stat_key: string;
  type: "COUNTING";
  direction: CategoryDirection;
}

interface RateCategory {
  category_id: string;
  name: string;
  stat_key: string;
  type: "RATE";
  direction: CategoryDirection;
  formula_id: string;  // REQUIRED for RATE
  required_components: string[];  // REQUIRED for RATE
}
```

**Trade-off:** This would catch bugs at compile time, but requires updating all Category creation sites and type guards throughout the codebase. **Recommend deferring** to separate refactoring phase.

## Testing Strategy

### Unit Tests (Recommended)

**File:** Create `packages/extension/lib/__tests__/draft-config-detector.test.ts`

```typescript
describe('mapStatNameToCategory', () => {
  it('should include formula_id for AVG rate stat', () => {
    const category = mapStatNameToCategory('AVG');
    expect(category.formula_id).toBe('avg');
    expect(category.required_components).toContain('AB');
    expect(category.required_components).toContain('H');
  });

  it('should include formula_id for ERA rate stat', () => {
    const category = mapStatNameToCategory('ERA');
    expect(category.formula_id).toBe('era');
    expect(category.required_components).toContain('IP');
    expect(category.required_components).toContain('ER');
  });

  it('should not include formula_id for counting stats', () => {
    const category = mapStatNameToCategory('HR');
    expect(category.formula_id).toBeUndefined();
  });
});

describe('getDefault5x5Categories', () => {
  it('should include formula_id for all RATE stats', () => {
    const categories = getDefault5x5Categories();
    const rateStats = categories.filter(c => c.type === 'RATE');

    for (const stat of rateStats) {
      expect(stat.formula_id).toBeDefined();
      expect(stat.required_components).toBeDefined();
      expect(stat.required_components.length).toBeGreaterThan(0);
    }
  });
});
```

### Integration Test (Recommended)

**File:** `packages/backend/src/api/__tests__/draft.test.ts`

```typescript
describe('POST /api/draft/auction with DOM-detected categories', () => {
  it('should return auction values > $1 when categories include formula_id', async () => {
    const categories = [
      { category_id: "HR", stat_key: "HR", type: "COUNTING", direction: "HIGHER_BETTER", name: "Home Runs" },
      { category_id: "AVG", stat_key: "AVG", type: "RATE", direction: "HIGHER_BETTER", name: "Batting Average", formula_id: "avg", required_components: ["AB", "H"] },
      // ... more categories
    ];

    const response = await request(app)
      .get('/api/draft/auction')
      .query({
        numTeams: 12,
        categories: JSON.stringify(categories),
        rosterSlots: JSON.stringify({ C: 1, "1B": 1, OF: 3, SP: 4, RP: 2 }),
        budget: 260,
      });

    expect(response.status).toBe(200);
    expect(response.body.valuations.length).toBeGreaterThan(0);

    const topPlayer = response.body.valuations[0];
    expect(topPlayer.dollarValue).toBeGreaterThan(30); // Should be $40-55 range
  });
});
```

### Manual Testing Steps

1. **Setup:** Install extension in Chrome, navigate to ESPN practice draft page
2. **Before fix:** Check browser console for "Category statistics" log - should show empty categories array
3. **After fix:** Check browser console - should show populated categories with mean/stdDev for each
4. **Verify auction values:** Top player should be $40-55 range in 12-team $260 league
5. **Verify SGP spread:** Check developer tools network tab, inspect `/api/draft/auction` response - `sgpTotal` should vary across players

## Known Edge Cases

### OBP/OPS Categories

The current mapping only covers standard 5x5 categories. If a league uses OBP or OPS:

**Current behavior:** `mapStatNameToCategory()` will return a generic category with no `formula_id`
**Impact:** Same bug - SGP calculation will skip the category
**Fix:** Add to `categoryMap` in `mapStatNameToCategory()`:

```typescript
"OBP": { category_id: "OBP", stat_key: "OBP", type: "RATE", direction: "HIGHER_BETTER", name: "On-Base Percentage", formula_id: "obp", required_components: ["AB", "H", "BB", "HBP", "SF"] },
"OPS": { category_id: "OPS", stat_key: "OPS", type: "RATE", direction: "HIGHER_BETTER", name: "On-Base Plus Slugging", formula_id: "ops", required_components: ["AB", "H", "BB", "HBP", "SF", "TB"] },
```

### SLG Category

Less common but possible:

```typescript
"SLG": { category_id: "SLG", stat_key: "SLG", type: "RATE", direction: "HIGHER_BETTER", name: "Slugging Percentage", formula_id: "slg", required_components: ["AB", "TB"] },
```

### K/9 Category

Rare but supported by formulas:

```typescript
"K/9": { category_id: "K9", stat_key: "K9", type: "RATE", direction: "HIGHER_BETTER", name: "Strikeouts per 9 IP", formula_id: "k9", required_components: ["IP", "K"] },
```

## Related Code Patterns

### Correct Pattern: ESPN API Mapping

**File:** `packages/extension/lib/api-client.ts` lines 199-217

This correctly maps ESPN stat IDs to Category objects:

```typescript
const mapping = ESPN_STAT_MAP[item.statId];
return {
  category_id: `cat_${item.statId}`,
  name: mapping.name,
  stat_key: mapping.key,
  type: mapping.type,
  direction: item.isReverseItem ? "LOWER_BETTER" : "HIGHER_BETTER",
  formula_id: mapping.formulaId,  // ✓ Correctly included
  required_components: mapping.requiredComponents,  // ✓ Correctly included
};
```

**Lesson:** DOM detection should mirror this pattern exactly.

### Formula Validation in Backend

**File:** `packages/shared/src/formulas.ts` lines 69-94

The `calculateFinalRate()` function expects valid `formula_id`:

```typescript
switch (formulaId) {
  case "avg": return calculateAVG(combined);
  case "obp": return calculateOBP(combined);
  // ...
  default: throw new Error(`Unknown formula: ${formulaId}`);
}
```

**Current behavior:** Throws error for undefined/invalid `formula_id`
**Impact:** Caught by try-catch in `calculateTotalSGP()` line 186-188, category gets skipped
**Post-fix:** All RATE categories will have valid `formula_id`, no more skipping

## Architecture Insights

### Why This Bug Was Missed

1. **Type system allowed optional fields:** `formula_id?: string` means TypeScript doesn't enforce presence
2. **ESPN API path worked:** Most testing used real leagues, which fetch from ESPN API (correct mapping)
3. **Practice drafts less tested:** DOM detection path only triggers for practice drafts
4. **Validation too lenient:** `validateDraftConfig()` in draft.ts only checks required fields, not optional ones
5. **Logs not reviewed:** Diagnostic log "Category statistics for SGP calculation" would have shown empty array, but wasn't monitored

### Why It Manifests as $1 Values

1. **SGP calculation skips RATE categories** → only counting stats contribute to SGP
2. **Reduced SGP spread** → players cluster around similar values
3. **VBD calculation** → `vbd = playerSGP - replacementSGP` collapses to near-zero
4. **Dollar allocation** → `dollarValue = (vbd / totalVBD) * spendingPool + minBid`
5. **When totalVBD ≈ 0** → all players get `minBid` ($1)

## Sources

### Primary (HIGH confidence)

**Codebase files examined:**
- `/Users/jay-work/Code/espn-agent/packages/backend/src/api/draft.ts` - Query param parsing and validation
- `/Users/jay-work/Code/espn-agent/packages/backend/src/agents/draft-rankings.ts` - SGP calculation
- `/Users/jay-work/Code/espn-agent/packages/backend/src/agents/auction-valuation.ts` - Dollar value allocation
- `/Users/jay-work/Code/espn-agent/packages/shared/src/formulas.ts` - Rate stat formulas and SGP calculation
- `/Users/jay-work/Code/espn-agent/packages/shared/src/types.ts` - Category type definition
- `/Users/jay-work/Code/espn-agent/packages/extension/lib/api-client.ts` - ESPN API mapping (correct) and query param construction
- `/Users/jay-work/Code/espn-agent/packages/extension/lib/draft-config-detector.ts` - DOM detection (buggy)

**Project documentation:**
- `/Users/jay-work/Code/espn-agent/CLAUDE.md` - Component math patterns, agent architecture
- Phase description provided by user - Diagnostic evidence and call chain

### Metadata

**Confidence breakdown:**
- Root cause identification: HIGH - Direct code inspection confirms missing fields
- Fix scope: HIGH - Single file change with clear before/after
- Impact assessment: HIGH - Matches diagnostic evidence ("categories":[] log)

**Research date:** 2026-02-28
**Valid until:** 90 days (stable codebase, bug fix not affected by ecosystem changes)
