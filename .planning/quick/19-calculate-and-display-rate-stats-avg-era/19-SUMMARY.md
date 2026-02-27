---
phase: quick-19
plan: 01
subsystem: extension
tags: [rate-stats, component-math, player-cards]
dependency-graph:
  requires: [shared-formulas]
  provides: [calculated-rate-stats-display]
  affects: [draft-ui, player-evaluation]
tech-stack:
  added: []
  patterns: [component-based-rate-calculation]
key-files:
  created: []
  modified:
    - packages/extension/components/PlayerCard.tsx
    - packages/extension/components/AuctionPlayerCard.tsx
decisions: []
metrics:
  duration: 93s
  completed: 2026-02-27
---

# Quick Task 19: Calculate and Display Rate Stats (AVG/ERA)

**One-liner:** Extension player cards now calculate AVG, ERA, WHIP, and OPS from stat components using shared formulas library, ensuring consistent component-based math throughout the application.

## Objective

Calculate and display rate stats (AVG, ERA, WHIP, OPS) in extension player cards using component-based math from shared formulas library instead of reading raw values.

## Tasks Completed

### Task 1: Update PlayerCard to calculate rate stats from components

**Status:** Complete
**Commit:** 205a478

Updated PlayerCard.tsx to import and use rate stat calculation functions:
- Imported calculateAVG, calculateERA, calculateWHIP, calculateOPS from @espn-fantasy/shared
- Replaced direct stat display with calculated rate stats from components
- Batters now show AVG (3 decimals) and OPS (3 decimals) calculated from H, AB, BB, HBP, SF, TB components
- Pitchers now show ERA (2 decimals) and WHIP (2 decimals) calculated from ER, IP, H, BB components
- Counting stats (HR, RBI, SB, W, SV) still read directly from projectedStats
- Added conditional rendering (AB > 0 for batters, IP > 0 for pitchers) to prevent division by zero

### Task 2: Update AuctionPlayerCard to calculate rate stats from components

**Status:** Complete
**Commit:** 8401f3b

Updated AuctionPlayerCard.tsx to import and use rate stat calculation functions:
- Imported calculateAVG, calculateERA, calculateWHIP, calculateOPS from @espn-fantasy/shared
- Added calculated rate stats after existing counting stats
- Batters show AVG (3 decimals) and OPS (3 decimals) when projectedStats.AB > 0
- Pitchers show ERA (2 decimals) and WHIP (2 decimals) when projectedStats.IP > 0
- Conditional rendering prevents errors when projectedStats is undefined (from optional find operation)
- Counting stats unchanged (still read directly from projectedStats)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Incorrect import path for formulas**
- **Found during:** Task 1
- **Issue:** Initial implementation used `@espn-fantasy/shared/formulas` import path which doesn't exist in package.json exports. Build failed with "Missing ./formulas specifier" error.
- **Fix:** Changed import to `@espn-fantasy/shared` which re-exports all formulas from index.ts
- **Files modified:** packages/extension/components/PlayerCard.tsx
- **Commit:** 205a478 (included in task 1 commit)

## Implementation Details

### Component-Based Math Philosophy

Both player cards now adhere to the project's component-based math philosophy:
- Rate stats MUST be calculated from counting stat components
- Never average rates or use raw ESPN values directly
- Formulas implemented in shared library ensure consistency across backend and frontend

### Rate Stat Formulas Used

- **AVG** = H / AB
- **ERA** = (9 × ER) / IP
- **WHIP** = (H + BB) / IP
- **OPS** = OBP + SLG = [(H + BB + HBP) / (AB + BB + HBP + SF)] + [TB / AB]

### Conditional Rendering Guards

Both components use conditional rendering to prevent errors:
- PlayerCard: `{player.projectedStats.AB > 0 && ...}` for batters, `{player.projectedStats.IP > 0 && ...}` for pitchers
- AuctionPlayerCard: `{projectedStats.AB && projectedStats.AB > 0 && ...}` (extra check for undefined)

This ensures:
1. No division by zero errors (formulas return 0 when denominator is 0)
2. Clean UI without displaying stats for wrong player type (no batting stats for pitchers)
3. No crashes when projection data is missing in auction drafts

## Verification

Build verification passed:
```bash
cd packages/extension && npm run build
# ✔ Built extension in 1.101 s
# Σ Total size: 399.28 kB
```

No TypeScript errors, extension builds successfully with calculated rate stats.

## Manual Testing Recommendations

When testing with live ESPN draft:
1. Load extension in ESPN draft page
2. Check player cards in sidebar for both batters and pitchers
3. Verify rate stats show reasonable values:
   - AVG: .250-.350 typical for quality batters
   - OPS: .700-.1.000 typical range
   - ERA: 3.00-5.00 typical for quality pitchers
   - WHIP: 1.00-1.40 typical range
4. Verify counting stats (HR, RBI, SB, W, SV) still display correctly
5. Check both snake draft (PlayerCard) and auction draft (AuctionPlayerCard) modes

## Impact

### User Experience
- Draft participants now see accurate rate stats calculated from components
- Consistent with backend calculations used for VBD rankings and projections
- Prevents potential confusion from mismatched rate stat values

### Code Quality
- Eliminates duplication - rate stat logic now centralized in shared library
- Type-safe imports ensure formula changes propagate automatically
- Follows established component-based math pattern used throughout backend

### Performance
- Negligible impact - calculations are simple arithmetic operations
- No API calls or async operations added
- Formulas optimized with early returns for zero denominators

## Success Criteria

All success criteria met:
- ✅ PlayerCard.tsx imports and uses calculateAVG, calculateERA, calculateWHIP, calculateOPS
- ✅ AuctionPlayerCard.tsx imports and uses calculateAVG, calculateERA, calculateWHIP, calculateOPS
- ✅ Rate stats calculated from StatComponents, not read as raw values
- ✅ Batters show AVG (3 decimals) and OPS (3 decimals)
- ✅ Pitchers show ERA (2 decimals) and WHIP (2 decimals)
- ✅ Counting stats unchanged (still read directly from projectedStats)
- ✅ Extension builds without TypeScript errors

## Files Modified

1. **packages/extension/components/PlayerCard.tsx**
   - Added imports for rate stat calculation functions
   - Replaced direct AVG/ERA display with calculated values
   - Added OPS and WHIP to displayed stats
   - Organized stats with comments distinguishing counting vs rate stats

2. **packages/extension/components/AuctionPlayerCard.tsx**
   - Added imports for rate stat calculation functions
   - Added calculated rate stats (previously only showed counting stats)
   - Conditional rendering for undefined projectedStats
   - Organized stats with comments distinguishing counting vs rate stats

## Next Steps

None required. Quick task complete.

## Self-Check: PASSED

Verified all created/modified files and commits exist:

### Files
- ✅ FOUND: PlayerCard.tsx
- ✅ FOUND: AuctionPlayerCard.tsx

### Commits
- ✅ FOUND: 205a478 (Task 1: PlayerCard rate stats)
- ✅ FOUND: 8401f3b (Task 2: AuctionPlayerCard rate stats)
