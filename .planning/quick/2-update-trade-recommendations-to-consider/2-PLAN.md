---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/agents/trade-recommendation.ts
  - packages/frontend/src/app/leagues/[id]/trades/page.tsx
autonomous: true
requirements: [QUICK-2]

must_haves:
  truths:
    - "Trade recommendations prioritize trades that fill positional gaps on the user's roster"
    - "Positional scarcity is factored into trade scoring (catchers, closers valued higher than outfielders)"
    - "Trade explanation text mentions positional context when relevant"
    - "Trades that address a position of need are ranked higher than equivalent pure-stat trades"
  artifacts:
    - path: "packages/backend/src/agents/trade-recommendation.ts"
      provides: "Positional value scoring in trade candidate generation"
      contains: "positionalBonus"
    - path: "packages/frontend/src/app/leagues/[id]/trades/page.tsx"
      provides: "Positional context in trade suggestion cards"
      contains: "positionalContext"
  key_links:
    - from: "packages/backend/src/agents/trade-recommendation.ts"
      to: "league_settings_version.settings_json.roster_slots"
      via: "DB query for roster slot counts"
      pattern: "roster_slots"
    - from: "packages/backend/src/agents/trade-recommendation.ts"
      to: "team_roster_snapshot + player.positions"
      via: "Existing allRosters batch query"
      pattern: "rostersByTeam"
---

<objective>
Add positional value awareness to the trade recommendation engine so that generated trade candidates factor in roster construction, positional need, and positional scarcity -- not just raw projected roto point deltas.

Purpose: Currently `generateTradeCandidates()` ranks trades purely by projected overall roto point change. This misses critical fantasy baseball context: a team with 3 quality outfielders but no viable catcher should strongly prefer trades acquiring a catcher. Positional scarcity (C, RP/closers are scarce; OF, SP are deep) should also boost trades that address thin positions.

Output: Updated `TradeRecommendationAgent` with positional scoring, and frontend showing positional context on trade suggestions.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/backend/src/agents/trade-recommendation.ts
@packages/frontend/src/app/leagues/[id]/trades/page.tsx
@packages/shared/src/types.ts
@packages/backend/src/api/recommendations.ts
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add positional value scoring to TradeRecommendationAgent</name>
  <files>packages/backend/src/agents/trade-recommendation.ts</files>
  <action>
Add positional awareness to `generateTradeCandidates()` in `TradeRecommendationAgent`. The changes are scoped to the backend agent only.

**1. Add a positional scarcity map (static constant near top of file):**

```typescript
const POSITION_SCARCITY: Record<string, number> = {
  C: 1.5,    // Very scarce - few quality catchers
  SS: 1.2,   // Moderately scarce
  2B: 1.1,   // Slightly scarce
  3B: 1.0,   // Average
  1B: 0.9,   // Deep position
  OF: 0.8,   // Very deep
  SP: 1.0,   // Average (many SPs but also many slots)
  RP: 1.3,   // Scarce - quality closers are rare
  P: 1.0,    // Generic pitcher slot
  UTIL: 0.5, // Not position-specific
};
```

**2. Add new interface and extend TradeCandidate:**

Add a `PositionalContext` interface:
```typescript
export interface PositionalContext {
  positionGained: string[];       // Primary positions of received player(s)
  positionLost: string[];         // Primary positions of given player(s)
  fillsNeed: boolean;             // True if received player fills a thin position
  needPositions: string[];        // Positions where team has below-average depth
  positionalBonus: number;        // Bonus points added to scoring (0 to ~3)
}
```

Add `positionalContext?: PositionalContext` to the `TradeCandidate` interface (optional for backward compat).

**3. Add a private method `analyzeRosterDepth()`:**

This method takes roster data (array of `{player_id, positions}`) and league roster slots (`Record<string, number>`) and returns a depth map:

```typescript
private analyzeRosterDepth(
  roster: Array<{ player_id: number; positions: string[] }>,
  rosterSlots: Record<string, number>,
): Map<string, { count: number; slots: number; depthRatio: number }>
```

For each position in rosterSlots (excluding BN, IL, UTIL):
- `count`: number of roster players eligible for that position
- `slots`: number of roster slots for that position
- `depthRatio`: count / slots (< 1.5 means thin, > 3.0 means deep)

**4. Add a private method `computePositionalBonus()`:**

```typescript
private computePositionalBonus(
  givePositions: string[][],    // positions arrays for each given player
  receivePositions: string[][],  // positions arrays for each received player
  depthMap: Map<string, { count: number; slots: number; depthRatio: number }>,
): PositionalContext
```

Logic:
- Identify `needPositions`: positions where depthRatio < 1.5
- For each received player, check if any of their positions is a need position
- `fillsNeed`: true if any received player fills a need position
- `positionalBonus` calculation:
  - Start at 0
  - For each received player's primary position (first in array): add `POSITION_SCARCITY[pos] * 0.5` if `fillsNeed` is true for that position
  - If the received player fills a need AND the given player is at a deep position (depthRatio > 2.5), add an additional 0.5 bonus
  - Cap total bonus at 3.0

**5. Modify `generateTradeCandidates()` to use positional scoring:**

After the existing `allRosters` batch query (line ~378) and before the per-team loop:
- Fetch league settings (roster_slots) using the same pattern as `validateRosterSlots()` -- query `league_settings_version` via `league_daily_snapshot`
- Call `analyzeRosterDepth()` for the user's roster with those roster_slots
- Store the depth map for use in the candidate loop

Inside the per-team candidate loop, after computing `valueDelta` in the pre-filter:
- Call `computePositionalBonus()` for each trade pair
- Add `positionalBonus` to the sort key alongside `valueDelta` so that positionally valuable trades rank higher in the pre-filter
- Change the sort from `b.valueDelta - a.valueDelta` to `(b.valueDelta + b.positionalBonus) - (a.valueDelta + a.positionalBonus)`

When constructing the `TradeCandidate` object (around line ~512), attach the `positionalContext` from the pre-computed bonus.

**6. Enhance `generateTradeExplanation()` to include positional context:**

If `positionalContext` is passed (add optional parameter):
- If `fillsNeed` is true, prepend: "Fills a need at {positions}. "
- If giving from a deep position, append: "Trading from a position of depth ({position})."

**Important:** Do NOT change the signature of `analyzeTradeImpact()` or any existing API response shapes. The `positionalContext` field is additive to `TradeCandidate` only, not to `TradeImpactAnalysis`. The manual trade builder (Build & Analyze) path is unchanged.
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && pnpm run build` to verify TypeScript compilation succeeds with no errors. Verify the new interfaces are exported. Verify `generateTradeCandidates` still returns `TradeCandidate[]` (backward compatible).
  </verify>
  <done>
`TradeRecommendationAgent.generateTradeCandidates()` factors positional need and scarcity into candidate scoring. Trades that fill roster gaps rank higher. `TradeCandidate` includes optional `positionalContext` with `fillsNeed`, `needPositions`, `positionalBonus`, `positionGained`, and `positionLost`. Build passes with no type errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Surface positional context in trade suggestions UI</name>
  <files>packages/frontend/src/app/leagues/[id]/trades/page.tsx</files>
  <action>
Update the frontend trades page to display the positional context returned by the updated API for AI-generated trade suggestions.

**1. Add `PositionalContext` interface** (near the other interfaces at top of file):

```typescript
interface PositionalContext {
  positionGained: string[];
  positionLost: string[];
  fillsNeed: boolean;
  needPositions: string[];
  positionalBonus: number;
}
```

**2. Add `positionalContext?: PositionalContext` to the `TradeCandidate` interface.**

**3. Update the AI Suggestions card rendering** (the `candidatesData.candidates.map()` block starting around line 702):

After the trade details grid (the "You Give" / "You Get" section) and before the metadata section, add a conditional positional context badge row:

```tsx
{candidate.positionalContext?.fillsNeed && (
  <div className="mb-3 flex flex-wrap gap-2">
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
      Fills need: {candidate.positionalContext.needPositions
        .filter(pos => candidate.positionalContext!.positionGained.includes(pos))
        .join(', ')}
    </span>
    {candidate.positionalContext.positionalBonus >= 1.0 && (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
        High positional value
      </span>
    )}
  </div>
)}
```

**4. In the "You Give" and "You Get" boxes** within the AI suggestions (not the trade builder -- the browse suggestions tab), show position abbreviations next to player names. Currently the suggestion cards only show `p.playerName`. Since the suggestion card does NOT have position data in the current `TradePlayer` type, do NOT attempt to add positions to the player name display here -- the backend `TradePlayer` interface only has `playerId` and `playerName`. The positional context badges added above are sufficient.

**5. Show roster need summary** when there are candidates. Above the candidate cards (after the paragraph "These are trades that would improve your projected standings"), if the first candidate has `positionalContext?.needPositions` with items, add:

```tsx
{candidatesData.candidates[0]?.positionalContext?.needPositions?.length > 0 && (
  <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
    <div className="text-sm font-medium text-blue-800">
      Positions of need: {candidatesData.candidates[0].positionalContext.needPositions.join(', ')}
    </div>
    <div className="text-xs text-blue-600 mt-1">
      Trades filling these positions are ranked higher
    </div>
  </div>
)}
```

Keep all changes additive. Do not modify the trade builder (Build & Analyze) tab behavior. The `positionalContext` field is optional so the UI gracefully handles its absence.
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && pnpm run build` to verify the frontend compiles with no TypeScript errors. Visually confirm (or have user confirm) that the trades page loads and the AI suggestions tab shows positional badges when `positionalContext` is present.
  </verify>
  <done>
Trade suggestions UI shows "Fills need: {positions}" badges on relevant candidates, "High positional value" badge for strongly positional trades, and a roster needs summary above the candidate list. All changes are additive and backward-compatible -- the UI degrades gracefully when `positionalContext` is absent.
  </done>
</task>

</tasks>

<verification>
1. `pnpm run build` passes in both backend and frontend packages with no type errors
2. `TradeCandidate` interface now includes optional `positionalContext` field
3. `generateTradeCandidates()` computes roster depth and positional bonuses
4. Trade candidates that fill positional needs rank higher than equivalent pure-stat trades
5. Explanation text mentions positional context when a trade fills a need
6. Frontend shows positional badges on AI trade suggestions
7. Manual trade builder (Build & Analyze tab) is unaffected
</verification>

<success_criteria>
- Backend: Trade recommendations incorporate positional need, scarcity, and roster depth into candidate scoring and ranking
- Backend: New positional context is returned in the API response as part of TradeCandidate
- Frontend: Positional context is displayed as badges/tags on AI trade suggestion cards
- Both: Full build passes, all existing functionality preserved (backward compatible)
</success_criteria>

<output>
After completion, create `.planning/quick/2-update-trade-recommendations-to-consider/2-SUMMARY.md`
</output>
