---
phase: quick-32
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/api-client.ts
  - packages/extension/components/DraftSidebar.tsx
  - packages/extension/components/AuctionPlayerCard.tsx
autonomous: true
requirements: [QUICK-32]
must_haves:
  truths:
    - "Nominated player banner shows ESPN auction dollar value and PitcherList tier name + rank"
    - "Auction player cards show PitcherList tier badge and rank number alongside dollar value"
    - "PlayerRanking objects carry tierName, externalRank, and espnAuctionValue from merged data"
  artifacts:
    - path: "packages/extension/lib/api-client.ts"
      provides: "Enhanced PlayerRanking with tierName, externalRank, espnAuctionValue fields"
      contains: "tierName"
    - path: "packages/extension/components/DraftSidebar.tsx"
      provides: "Nominated player banner showing dollar value from auctionValues + PitcherList tier from rankings"
      contains: "tierName"
    - path: "packages/extension/components/AuctionPlayerCard.tsx"
      provides: "PitcherList tier badge and rank on each card"
      contains: "tierName"
  key_links:
    - from: "packages/extension/lib/api-client.ts"
      to: "packages/extension/components/DraftSidebar.tsx"
      via: "PlayerRanking.tierName and PlayerRanking.externalRank consumed from draft store"
      pattern: "tierName|externalRank"
    - from: "packages/extension/lib/api-client.ts"
      to: "packages/extension/components/AuctionPlayerCard.tsx"
      via: "PlayerRanking lookup for tier display"
      pattern: "tierName|externalRank"
---

<objective>
Propagate PitcherList tier names, ranks, and ESPN auction values through the extension data pipeline so the nominated player banner and auction player cards display this information.

Purpose: During auction drafts, the user needs to see PitcherList tier (e.g., "STUD", "AGA 1") and rank alongside ESPN dollar values to make informed bidding decisions. Currently this data exists in the bundled JSON but is not propagated to the UI.

Output: Enhanced PlayerRanking type with tierName/externalRank/espnAuctionValue; updated nominated player banner; updated auction player cards with tier badges.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/api-client.ts
@packages/extension/components/DraftSidebar.tsx
@packages/extension/components/AuctionPlayerCard.tsx
@packages/extension/components/AuctionRecommendations.tsx
@packages/extension/lib/draft-state.ts
@packages/shared/src/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enhance PlayerRanking interface and getDraftBoardData() to propagate PitcherList data</name>
  <files>packages/extension/lib/api-client.ts</files>
  <action>
1. Add three new optional fields to the `PlayerRanking` interface:
   - `tierName?: string` — PitcherList tier name (e.g., "STUD", "AGA 1", "AGA Holly")
   - `externalRank?: number` — PitcherList rank number
   - `espnAuctionValue?: number` — ESPN pre-draft auction dollar value (same as dollarValue on AuctionValue, but available on the ranking object for banner lookups)

2. In `getDraftBoardData()`, when building each `PlayerRanking` in the for-of loop over `players` (around line 396-404), populate the new fields from the PitcherList `match`:
   - `tierName: match?.tierName ?? undefined`
   - `externalRank: match?.rank ?? undefined`
   - `espnAuctionValue: player.espnAuctionValue`

No changes needed to the `AuctionValue` interface or its construction — the dollar value is already on `dollarValue`.
  </action>
  <verify>Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json` (or the extension build command) to confirm no type errors.</verify>
  <done>PlayerRanking objects returned by getDraftBoardData() include tierName, externalRank, and espnAuctionValue when PitcherList match exists.</done>
</task>

<task type="auto">
  <name>Task 2: Show PitcherList tier and ESPN value in nominated player banner and auction cards</name>
  <files>packages/extension/components/DraftSidebar.tsx, packages/extension/components/AuctionPlayerCard.tsx</files>
  <action>
**DraftSidebar.tsx — Fix nominated player banner (lines ~134-173):**

1. Also pull `auctionValues` from `useDraftStore()` (currently only pulls `rankings`).

2. Replace the current IIFE block (lines 158-169) that looks up `matchedRanking?.dollarValue` (which does NOT exist on `DraftRanking`) with a proper dual lookup:
   - Look up `auctionValues.find(...)` for dollar value (using playerId match or normalized name match)
   - Look up `rankings.find(...)` for PitcherList tier info (using playerId match or normalized name match)

3. Display in the right column of the banner (below current bid):
   - ESPN Value: `$XX` from the matched AuctionValue's `dollarValue`
   - PitcherList tier name badge if `matchedRanking?.tierName` exists: small pill/badge showing the tier name (e.g., "STUD") using design token classes like `text-xs bg-surface-tertiary text-content-secondary px-1.5 py-0.5 rounded`
   - PitcherList rank if `matchedRanking?.externalRank` exists: show as "PL #42" text

**AuctionPlayerCard.tsx — Add PitcherList tier/rank display:**

1. The component already looks up `playerRanking` from `rankings` via the draft store (lines 63-71). Use that existing lookup.

2. Below the positions line (around line 80), add PitcherList info when available:
   - If `playerRanking?.tierName` exists: render a small inline badge with the tier name, e.g., `<span className="text-xs bg-surface-tertiary text-content-secondary px-1.5 py-0.5 rounded">STUD</span>`
   - If `playerRanking?.externalRank` exists: render "PL #{rank}" next to the tier badge

Use the existing design token classes (bg-surface-tertiary, text-content-secondary, etc.) consistent with the quick-31 extension redesign.
  </action>
  <verify>Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json` to confirm no type errors. Visually inspect component structure for reasonable layout.</verify>
  <done>Nominated player banner shows ESPN dollar value (from auctionValues), PitcherList tier name badge, and PitcherList rank. Auction player cards show PitcherList tier badge and rank alongside existing dollar value and VBD display.</done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors for the extension package
- PlayerRanking interface has tierName, externalRank, espnAuctionValue fields
- getDraftBoardData() populates new fields from PitcherList match data
- DraftSidebar nominated banner looks up auctionValues for dollar value (not rankings.dollarValue which doesn't exist)
- AuctionPlayerCard displays tier badge when playerRanking has tierName
</verification>

<success_criteria>
- Extension builds cleanly with no type errors
- Nominated player banner shows: current bid, ESPN dollar value, PitcherList tier name, PitcherList rank
- Each auction player card shows PitcherList tier badge and rank when available
- No regressions in existing auction recommendation sorting or display
</success_criteria>

<output>
After completion, create `.planning/quick/32-show-draft-board-auction-values-and-play/32-SUMMARY.md`
</output>
