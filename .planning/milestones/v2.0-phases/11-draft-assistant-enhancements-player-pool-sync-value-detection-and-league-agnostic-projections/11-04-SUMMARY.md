---
phase: 11
plan: 04
subsystem: extension-ui
tags: [value-detection, draft-ui, vbd-analysis, user-experience]
dependencies:
  requires: [11-01]
  provides: [visual-value-indicators]
  affects: [player-cards, draft-recommendations]
tech-stack:
  added: [value-detection-utilities]
  patterns: [color-coded-badges, threshold-detection, defensive-null-handling]
key-files:
  created:
    - packages/extension/lib/value-detection.ts
  modified:
    - packages/extension/components/PlayerCard.tsx
    - packages/extension/components/AuctionPlayerCard.tsx
decisions:
  - title: "10-pick threshold for snake draft value detection"
    rationale: "User constraint - players available 10+ picks later than VBD rank are significant value opportunities"
    alternatives: ["5-pick threshold (too noisy)", "20-pick threshold (misses mid-tier values)"]
    date: "2026-02-25"
  - title: "15% threshold for auction value detection"
    rationale: "User constraint - 15%+ discount/overpay represents meaningful budget deviation worth highlighting"
    alternatives: ["10% threshold (too sensitive)", "20% threshold (misses moderate values)"]
    date: "2026-02-25"
  - title: "Two-tier green values (moderate and exceptional)"
    rationale: "Distinguish good picks (10+, 15+) from exceptional steals (20+, 30+) using same color family"
    alternatives: ["Single threshold", "Four-color scheme"]
    date: "2026-02-25"
  - title: "Hide fair value badges to reduce clutter"
    rationale: "Only show badges for non-fair values - users care about outliers, not confirmation of ADP"
    alternatives: ["Show all badges", "Show only steals/reaches"]
    date: "2026-02-25"
metrics:
  duration: 3
  completed: "2026-02-25T20:50:33Z"
  tasks_completed: 2
  files_modified: 3
  commits: 2
---

# Phase 11 Plan 04: Value Detection UI Summary

**One-liner:** Color-coded value indicators for snake (10+ pick delta) and auction (15%+ discount) drafts with red/yellow/green badges and hover tooltips

## Implementation Overview

Implemented real-time value detection UI showing steals and reaches during live drafts by comparing VBD rankings to ADP (snake) or actual prices (auction).

### What Was Built

1. **Value Detection Utilities** (`value-detection.ts`)
   - `calculateSnakeDraftValue()`: Compares VBD rank to ADP with 10-pick thresholds
   - `calculateAuctionValue()`: Compares dollar value to actual price with 15% thresholds
   - `getValueColorClasses()`: Returns Tailwind classes for red/yellow/green badges
   - Two-tier value detection: moderate (10+, 15+) and exceptional (20+, 30+)
   - Defensive null/NaN checks for missing ADP or price data

2. **PlayerCard.tsx (Snake Draft)**
   - Added `valueIndicator` calculation using VBD rank and player ADP
   - Display color-coded badge inline with player info
   - Only show badge when `severity !== "fair"` (reduce visual noise)
   - Hover tooltip shows "VBD rank {N} vs ADP {M}"

3. **AuctionPlayerCard.tsx**
   - Added `actualPrice` prop for drafted players
   - Calculate auction value indicator (discount/overpay %)
   - Display badge alongside existing budget pacing indicators
   - Only show value badge for non-fair values
   - Hover tooltip shows "VBD ${X} vs actual ${Y}"

### Technical Decisions

**Threshold Selection:**
- **Snake:** 10-pick delta (user constraint) - balances signal vs noise
- **Auction:** 15% discount/overpay (user constraint) - meaningful budget deviation
- Two-tier detection: 10+/15+ (value) vs 20+/30+ (steal)

**Color Scheme:**
- Green: Good value (10+ picks, 15%+ discount)
- Yellow: Fair value or missing data (safe default)
- Red: Reach/overpay (10+ picks early, 15%+ overpay)

**UI Patterns:**
- Badges only for non-fair values (declutter interface)
- Inline with player info (no separate section)
- Hover tooltips for calculation transparency
- Consistent with Shadow DOM Tailwind styles

**Edge Case Handling:**
- No ADP data → Yellow "No ADP data" badge (severity: fair)
- No price data → Yellow "$X projected" badge (severity: fair)
- Zero VBD price → Yellow "Min bid player" (avoid division by zero)
- Invalid rank → Yellow "Unranked" (defensive default)

## Verification Results

### Build Status
- Extension builds without errors (384.07 kB total)
- TypeScript compilation successful
- All exports verified

### Code Verification
- ✅ `calculateSnakeDraftValue()` exported
- ✅ `calculateAuctionValue()` exported
- ✅ 10-pick threshold implemented
- ✅ 15% threshold implemented
- ✅ Red/yellow/green color scheme
- ✅ PlayerCard imports value detection
- ✅ AuctionPlayerCard imports value detection
- ✅ Both cards hide fair values

### Manual Testing Required
- Load extension on ESPN draft page
- Verify badges appear for some players (not all)
- Check colors: green for steals, red for reaches, no badge for fair
- Hover tooltips show VBD vs ADP/price calculation
- Snake: Players with ADP 20+ below VBD show green "steal" badges
- Auction: Players drafted 15%+ below projection show green "discount" badges
- No crashes when ADP missing (should show yellow or no badge)

## Deviations from Plan

None - plan executed exactly as written.

## Integration Points

**Upstream Dependencies:**
- Requires `DraftRanking.adp` field (from 11-01 player pool sync)
- Requires VBD rankings sorted descending (from backend)

**Downstream Impact:**
- Player cards now visually highlight value opportunities
- Users can quickly identify steals and reaches in real-time
- Complements existing picks-until-turn and budget pacing indicators

**Future Work:**
- Parent components could pass actual draft prices to show post-draft value badges
- ADP data could be fetched from ESPN or bundled with baseline rankings
- Value badges could be color-intensity graded (darker green for larger deltas)

## Known Limitations

1. **ADP Data Dependency:** Value detection only works if `player.adp` is populated (requires 11-03 completion)
2. **Auction Price Tracking:** `actualPrice` prop added but not yet wired from draft history
3. **No Historical Context:** Value badges don't account for league-specific tendencies (e.g., catchers always go early)
4. **Static Thresholds:** 10-pick and 15% thresholds don't adjust for draft position or scarcity

## Files Changed

### Created
- `packages/extension/lib/value-detection.ts` (183 lines)

### Modified
- `packages/extension/components/PlayerCard.tsx` (+39, -8)
- `packages/extension/components/AuctionPlayerCard.tsx` (+21, -8)

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| bf898fc | feat | Add value detection utilities for snake and auction drafts |
| 455d3a1 | feat | Add value indicators to player card components |

## Self-Check: PASSED

**Files Created:**
```bash
FOUND: packages/extension/lib/value-detection.ts
FOUND: packages/extension/components/PlayerCard.tsx (modified)
FOUND: packages/extension/components/AuctionPlayerCard.tsx (modified)
```

**Commits Verified:**
```bash
FOUND: bf898fc - feat(11-04): add value detection utilities
FOUND: 455d3a1 - feat(11-04): add value indicators to player card components
```

**Build Status:**
```bash
Extension builds successfully (384.07 kB)
No TypeScript errors
All verification checks passed
```

All planned artifacts exist and are committed. Plan execution successful.
