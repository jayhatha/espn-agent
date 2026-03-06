---
phase: quick-47
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/value-detection.ts
  - packages/extension/components/AuctionPlayerCard.tsx
  - packages/extension/components/DraftSidebar.tsx
  - packages/extension/components/AuctionRecommendations.tsx
autonomous: true
requirements: [QUICK-47]

must_haves:
  truths:
    - "ESPN ASV is displayed as the primary dollar value on each player card when available"
    - "FanGraphs value appears as a small colored badge showing over/underpriced relative to ESPN ASV"
    - "When ESPN ASV is unavailable for a player, FanGraphs value is shown as the primary number"
    - "Nominated player banner in DraftSidebar shows ESPN ASV as primary market value with FG comparison"
    - "Player list sorting uses ESPN ASV as dollar-value tiebreaker when available"
  artifacts:
    - path: "packages/extension/lib/value-detection.ts"
      provides: "calculateFgVsMarket function comparing FG value to ESPN ASV"
      exports: ["calculateFgVsMarket", "calculateAuctionValue", "calculateSnakeDraftValue", "getValueColorClasses", "ValueIndicator"]
    - path: "packages/extension/components/AuctionPlayerCard.tsx"
      provides: "Flipped value display — ESPN ASV primary, FG badge secondary"
    - path: "packages/extension/components/DraftSidebar.tsx"
      provides: "Nominated player banner with ESPN ASV as primary market value"
    - path: "packages/extension/components/AuctionRecommendations.tsx"
      provides: "Sort tiebreaker using ESPN ASV when available"
  key_links:
    - from: "packages/extension/components/AuctionPlayerCard.tsx"
      to: "packages/extension/lib/value-detection.ts"
      via: "import calculateFgVsMarket"
      pattern: "calculateFgVsMarket"
    - from: "packages/extension/components/AuctionPlayerCard.tsx"
      to: "useDraftStore().espnDomAuctionValues"
      via: "primary display value source"
      pattern: "espnDomAuctionValues\\[.*playerId\\]"
    - from: "packages/extension/components/AuctionRecommendations.tsx"
      to: "useDraftStore().espnDomAuctionValues"
      via: "sort tiebreaker value"
      pattern: "espnDomAuctionValues"
---

<objective>
Flip the extension's value display so ESPN ASV (Average Salary Value — what other managers see) is the primary "market value" and FanGraphs auction calculator values serve as an over/underpriced analytical indicator.

Purpose: Other managers bid based on ESPN's ASV column. Showing it as the primary number lets the user instantly compare current bids to what the market expects. The FanGraphs comparison badge then answers "is this player actually worth that market price?"

Output: Updated value-detection utility, three updated UI components
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/value-detection.ts
@packages/extension/components/AuctionPlayerCard.tsx
@packages/extension/components/DraftSidebar.tsx
@packages/extension/components/AuctionRecommendations.tsx
@packages/extension/lib/draft-state.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add calculateFgVsMarket to value-detection.ts</name>
  <files>packages/extension/lib/value-detection.ts</files>
  <action>
Add a new exported function `calculateFgVsMarket` to `value-detection.ts` that compares FanGraphs dollar value against ESPN ASV market price. This is a pure comparison function (not tied to actual bid price like `calculateAuctionValue`).

Signature:
```ts
export function calculateFgVsMarket(
  fgDollarValue: number,
  espnAsv: number | null,
): ValueIndicator | null
```

Logic:
- If `espnAsv` is null/undefined/0 or `fgDollarValue` is 0: return `null` (caller shows fallback)
- Calculate percentage difference: `pctDiff = ((fgDollarValue - espnAsv) / espnAsv) * 100`
  - Positive pctDiff = FG values player MORE than ESPN (underpriced by market)
  - Negative pctDiff = FG values player LESS than ESPN (overpriced by market)
- Thresholds (reuse the existing 15%/30% pattern from `calculateAuctionValue`):
  - pctDiff >= 30: green/steal, label: `FG $${fgDollarValue} ↑`
  - pctDiff >= 15: green/value, label: `FG $${fgDollarValue} ↑`
  - pctDiff > -15: yellow/fair, label: `FG $${fgDollarValue}`
  - pctDiff > -30: red/reach, label: `FG $${fgDollarValue} ↓`
  - pctDiff <= -30: red/overpay, label: `FG $${fgDollarValue} ↓`
- The `value` field stores the raw `pctDiff` number

Do NOT modify `calculateAuctionValue` or `calculateSnakeDraftValue` — those serve different purposes (comparing against actual bid prices). The new function is specifically for the FG-vs-market-price badge.
  </action>
  <verify>npx tsc --noEmit (from packages/extension)</verify>
  <done>calculateFgVsMarket exported and returns correct ValueIndicator for positive, negative, and null ESPN ASV cases</done>
</task>

<task type="auto">
  <name>Task 2: Flip primary/secondary value display in all three UI components</name>
  <files>
    packages/extension/components/AuctionPlayerCard.tsx
    packages/extension/components/DraftSidebar.tsx
    packages/extension/components/AuctionRecommendations.tsx
  </files>
  <action>
**AuctionPlayerCard.tsx — Flip primary/secondary value display (lines 120-128):**

1. Import `calculateFgVsMarket` and `getValueColorClasses` from `../lib/value-detection`.
2. Determine primary display value: `const marketValue = espnDisplayValue ?? auctionDollarValue;` (ESPN ASV when available, FG as fallback).
3. Compute FG comparison indicator: `const fgIndicator = espnDisplayValue !== null ? calculateFgVsMarket(auctionDollarValue, espnDisplayValue) : null;`
4. Replace the value display block (lines 120-128) with:
   - Primary big number: `$${marketValue}` in the existing `text-h3 font-semibold` style. If `espnDisplayValue !== null`, add a tiny "MKT" or no extra label (the number speaks for itself). If falling back to FG, add a small "FG" label in `text-caption text-content-tertiary` so user knows it's not market data.
   - Secondary indicator (only when `fgIndicator` is not null): A small inline badge using `getValueColorClasses(fgIndicator.color)` — show `fgIndicator.label` (e.g., "FG $30 ↑") in the badge's `text` color class on the badge's `bg` color class. Use `text-xs px-1.5 py-0.5 rounded` sizing.
5. Keep the affordability calculation using `auctionDollarValue` (FG value) — engine calculations stay on FG. But update line 65 `isAffordable` to use `marketValue` instead so budget pacing reflects what user actually has to bid against: `const isAffordable = marketValue <= pacing.recommendedMaxBid;`

**DraftSidebar.tsx — Update nominated player banner (lines 178-225):**

1. Import `calculateFgVsMarket` and `getValueColorClasses` from `../lib/value-detection`.
2. In the IIFE block (lines 178-225), restructure the display:
   - Keep existing logic for `domEspnValue`, `espnDisplayValue`, `matchedAuction`.
   - Primary value line: Replace the "ESPN Value: $XX" label (line 202-207) with a more prominent display. Show the market value as: label "Market Value" in `text-xs text-content-secondary`, value in `font-semibold text-sm` (not text-xs). Keep the `(live)` indicator when `domEspnValue !== undefined`.
   - Add FG comparison: Below the market value, if `matchedAuction?.dollarValue` exists AND `domEspnValue` is defined, compute `calculateFgVsMarket(matchedAuction.dollarValue, domEspnValue)`. If non-null, show the indicator label in its colored badge (same small badge pattern as AuctionPlayerCard).
   - If no ESPN value available but `matchedAuction?.dollarValue` exists, show "FG Value: $XX" as fallback (similar prominence).
3. Keep the tier/rank display (lines 209-222) unchanged.

**AuctionRecommendations.tsx — Use ESPN ASV for sort tiebreaker (lines 56-87):**

1. Add `espnDomAuctionValues` to the destructured `useDraftStore()` call (line 23 area).
2. In `filteredPlayers` useMemo (line 57), update the mapped object to include the effective market value:
   ```ts
   const effectiveValue = (player.playerId && espnDomAuctionValues[player.playerId] !== undefined)
     ? espnDomAuctionValues[player.playerId]
     : (player.dollarValue ?? 0);
   ```
   Return `{ player, externalRank, dollarValue: effectiveValue }` so the sort uses ESPN ASV as the tiebreaker when available.
3. Add `espnDomAuctionValues` to the useMemo dependency array.
4. Update the affordability filter (line 90-92) to also use the effective value: change `p.dollarValue` to check against the same `espnDomAuctionValues[p.playerId] ?? p.dollarValue` pattern. This is a display filter so it should reflect market prices.
  </action>
  <verify>cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json</verify>
  <done>
    - AuctionPlayerCard shows ESPN ASV as big primary number with colored FG badge when ESPN data available
    - AuctionPlayerCard falls back to FG value (labeled) when no ESPN ASV exists
    - DraftSidebar nominated banner shows "Market Value" prominently with FG comparison badge
    - AuctionRecommendations sorts by ESPN ASV for tiebreaker when available
    - No engine calculation logic changed (SGP, bid optimizer, inflation all still use FG values)
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json` passes
2. Manual code review: `calculateFgVsMarket` returns null when ESPN ASV is unavailable, returns colored ValueIndicator when both values present
3. AuctionPlayerCard: When espnDomAuctionValues has a value for player, it appears as the big number; FG badge shows comparison
4. AuctionPlayerCard: When espnDomAuctionValues is missing for player, FG value shown as primary with "FG" label
5. DraftSidebar: Nominated player shows "Market Value: $XX (live)" prominently, with FG badge below
6. AuctionRecommendations: sort uses espnDomAuctionValues for tiebreaker
7. No imports from engine files (bid-optimizer, scarcity, inflation) were changed
</verification>

<success_criteria>
- ESPN ASV is the primary dollar value shown to the user across all auction UI surfaces
- FanGraphs value appears as a colored over/under indicator badge (green up-arrow when FG thinks underpriced, red down-arrow when overpriced)
- Graceful fallback to FG value when ESPN ASV unavailable (clearly labeled as "FG")
- Zero changes to engine calculation logic
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/47-use-espn-asv-as-market-value-fangraphs-as-over-under/47-SUMMARY.md`
</output>
