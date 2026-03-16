# Phase 52: Extension Sidebar UI Update - Research

**Researched:** 2026-03-16
**Domain:** Chrome Extension UI / React / Tailwind — sidebar redesign to Grafana dark mode
**Confidence:** HIGH

## Summary

This phase is a pure UI refactor of the Chrome extension's `DraftSidebar.tsx` and related components. The engine signals are already computed and available via `useDraftEngineSignals()`. No new engine logic is needed — the work is entirely about what to render and how to style it.

The current sidebar is a light-mode, card-heavy layout built on a custom Tailwind design token system (`surface`, `content`, `accent`, etc.). The new design requires a dark-mode Grafana-inspired palette (`#181b1f` / `#22252b`) which means extending the Tailwind config with a new token set. All engine data needed for the new sections already exists in `DraftEngineSignals` — the category heatmap, signal strip, and position supply heatmap are new display patterns over existing data.

The biggest structural decisions are: (1) how to wire "value captured" running total from `myRoster`, (2) how to compute position supply from the existing player pool, and (3) how to handle the `<details>` collapsible sections vs. the new always-visible sections.

**Primary recommendation:** Do a component-by-component replacement inside `DraftSidebar.tsx` rather than a single file rewrite. Create new components for SignalStrip, CategoryHeatmap, PositionSupplyHeatmap, NextNominee, and update DraftSidebar layout/order. Preserve the ErrorBoundary wrapper pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cleanup / Removals**
- Remove snake draft UI entirely (preserve code for future version, don't delete files — just don't render)
- Remove AI Narrator section completely
- Remove bid vs pass decision comparison from win probability
- Remove draft targets section
- Remove full nomination strategy list (replace with single "next nominee" display)
- Remove position scarcity alerts section
- Remove budget pacing section entirely (engine handles internally; $remaining already in header)
- Remove hit/pitch budget split slider — default to 75% hitters / 25% pitchers in nomination strategy
- Reduce auction recommendations from 50 players to top 10
- Always use preloaded ESPN values from Live Draft Trends page CSV — stop trying to detect/scrape from ESPN DOM

**Section Order (top to bottom)**
1. Header — League info + $remaining + value captured running total
2. Auto-pilot toggle — Moved to top, defaults to ON
3. Nominated player + bid verdict — Player name, position, current bid, market value, tier badge; verdict shows BID $X / PASS + max bid + market price (green/amber/red)
4. Signal strip — Compact badge row: endgame mode (NORMAL green / ENDGAME red, always visible), inflation band, budget split (75/25 tracking), SP tier count
5. Next nominee — Single player with strategy tag (Budget Drain, Own Target, Overpriced); shows active "Nominating..." state when auto-pilot is acting
6. Category heatmap — Horizontal bar per category (HR, RBI, SB, OPS, R, W, SV, K, ERA, WHIP) + overall rank at end. Color = green/yellow/orange/red gradient across 13 teams. Click toggles between projected rank points and projected stat totals. Always visible (not collapsible). Replaces separate win probability and category targets sections.
7. Position supply heatmap — Shows how many of the top players at each position have been drafted (top 15 per position, top 50 for OF, top 30 for SP). Placed near ideal roster.
8. Ideal roster — Full 28-slot list (including bench) with slot, rank badge, tier badge, player name, dollar amount
9. Auction recommendations — Top 10 players with position filters

**Visual Design — Grafana-Inspired Dark Mode**
- Pure Grafana dark palette: #181b1f background, #22252b panels
- Dashboard panels: dark cards with thin borders, metric values in large font, subtle grids
- Stat widgets: big number displays with sparklines, colored thresholds, minimal chrome
- Heatmap/gauge style: color-saturated data on dark canvas
- Bright data on dark background throughout

**Signal Strip Colors**
- Endgame: Green badge = NORMAL, Red badge = ENDGAME (always shown, never hidden)
- Inflation bands: Red (<1.00 overspending), Gray (1.00-1.05 neutral), Green (1.05-1.15 buying window), Blue (>1.15 strong value)
- Bid verdict: Green (BID), Amber (BID but risky), Red (PASS) — unchanged

**Category Heatmap Colors**
- Green/yellow/orange/red gradient based on projected rank across 13 teams
- Green = top ranks, Red = bottom ranks

**Nominated Player Display**
- Show: player name, position, current bid, market value, tier badge
- Remove: FG value, FG vs market badge, external rank

**Nomination Reason Display**
- Single "next nominee" display instead of full list
- Strategy tag only: "Budget Drain", "Own Target", "Overpriced" — no additional context
- Active state when auto-pilot is nominating: "Nominating: [Player Name]" with loading indicator

### Claude's Discretion
- Exact Grafana color values for secondary/accent colors
- Sparkline implementation details
- Loading skeleton design
- Error state handling
- Exact spacing and typography within Grafana aesthetic
- Position supply heatmap visual format (bars vs badges vs grid)
- How to handle edge cases (no data loaded, mid-draft reconnection)

### Deferred Ideas (OUT OF SCOPE)
- Simplify auto-nominator to just nominate the next best player when it's our turn (no queuing) — separate phase
- Fix bug where "Nominate Player" button isn't being clicked when it's our turn — separate phase
- Snake draft UI restoration — future version
</user_constraints>

## Standard Stack

### Core (already in use)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| React | 18.x | Component rendering | Already in extension |
| Tailwind CSS | 3.x | Utility styling | Config at `tailwind.config.js` |
| Zustand | 4.x | Draft state store | `useDraftStore()` |
| WXT | 0.x | Extension build | Not changed by this phase |

### No New Dependencies Needed
All data is available from existing hooks. No charting library is needed — the category heatmap is pure CSS bar widths driven by rank math. No sparklines are needed unless Claude adds them as a discretion item.

**Installation:** None required.

## Architecture Patterns

### Current Component Map (what exists)
```
DraftSidebar.tsx           ← Orchestrates everything, handles storage write, event dispatch
  AuctionBudgetTracker.tsx ← Budget pacing section (REMOVE — section deleted)
  BidVerdict.tsx           ← Bid/pass verdict card (KEEP, reskin to dark mode)
  DraftNarrator.tsx        ← AI narrator (DO NOT RENDER — preserve file)
  EngineInsights.tsx       ← Win probability + IdealRoster + DraftTargets + NomStrategy
                              (DraftTargets + NomStrategy REMOVE, IdealRoster KEEP, WinProb simplify)
  IdealRosterPanel.tsx     ← Ideal roster list (KEEP, reskin)
  NominationDiagnostics.tsx← Auto-pilot status panel (KEEP collapsed, possibly reskin)
  PositionScarcityAlerts.tsx← Position alerts (DO NOT RENDER)
  AuctionRecommendations.tsx← Player list — reduce from 50 to 10, reskin
  SnakeTurnPairs.tsx       ← Snake only (DO NOT RENDER — snake format check already wraps this)
  DraftRecommendations.tsx ← Snake only (DO NOT RENDER)
  RosterSummary.tsx        ← Snake only (DO NOT RENDER)
```

### New Components to Create
```
SignalStrip.tsx             ← Endgame badge + inflation band badge + budget split + SP tier count
CategoryHeatmap.tsx         ← Horizontal bars per category, click-toggle rank/stat, dark mode
PositionSupplyHeatmap.tsx   ← Top-N players per position drafted count, dark mode
NextNominee.tsx             ← Single next-nominee card with strategy tag + "Nominating..." state
```

### Recommended Project Structure (new files)
```
packages/extension/components/
├── SignalStrip.tsx           # NEW: 4-badge signal strip
├── CategoryHeatmap.tsx       # NEW: heatmap with click-toggle
├── PositionSupplyHeatmap.tsx # NEW: position supply grid
├── NextNominee.tsx           # NEW: single next-nominee display
├── DraftSidebar.tsx          # REWRITE: new section order + dark palette
├── BidVerdict.tsx            # RESKIN: dark mode, remove FG badge
├── IdealRosterPanel.tsx      # RESKIN: dark mode
├── AuctionRecommendations.tsx# MODIFY: top 10 only, dark mode
└── [all other files]         # KEEP AS-IS (just don't render some)
```

### Pattern 1: Grafana Dark Palette via Tailwind Extension
**What:** Extend `tailwind.config.js` with a `grafana` color namespace for dark mode tokens.
**When to use:** All new and reskinned components use `grafana-*` tokens instead of `surface-*` / `content-*`.

```typescript
// tailwind.config.js additions under theme.extend.colors:
grafana: {
  bg: '#181b1f',        // main background
  panel: '#22252b',     // card/panel background
  border: '#2d3139',    // subtle border
  text: '#d9dde6',      // primary text
  muted: '#8e9ab0',     // secondary/muted text
  // Signal strip colors (locked decisions)
  endgame: {
    normal: '#37872d',   // green badge
    active: '#c4162a',   // red badge ENDGAME
  },
  inflation: {
    overspending: '#c4162a',  // red
    neutral: '#5c6063',       // gray
    buying: '#37872d',        // green
    strong: '#1f60c4',        // blue
  },
  positive: '#37872d',
  warning: '#e0b400',
  negative: '#c4162a',
  info: '#1f60c4',
}
```

**Note:** These are actual Grafana OSS palette values (verified from Grafana's public design system docs). Secondary/accent colors are Claude's discretion per CONTEXT.md.

### Pattern 2: Category Heatmap — Rank-to-Color Mapping
**What:** Convert a 1–N category rank into a CSS background color on a green→red gradient.
**When to use:** CategoryHeatmap component, one bar per scoring category.

```typescript
// Source: derived from locked decision + Grafana palette
function rankToColor(rank: number, totalTeams: number): string {
  // rank 1 = best (green), rank N = worst (red)
  const pct = (rank - 1) / Math.max(1, totalTeams - 1); // 0.0 = best, 1.0 = worst
  if (pct <= 0.25) return '#37872d'; // green
  if (pct <= 0.50) return '#e0b400'; // yellow
  if (pct <= 0.75) return '#f2495c'; // orange-red
  return '#c4162a';                  // red
}
```

Data source: `engineSignals.projectedStandings.standings` — find user's team, read `categoryRanks[statKey]` for each scoring category.

Toggle state: `useState<'rank' | 'stat'>('rank')` inside CategoryHeatmap — no store needed.

### Pattern 3: Value Captured — Running Total in Header
**What:** Sum of (espnDomAuctionValues[playerId] - cost) for all `myRoster` picks where ESPN value is known.
**When to use:** Header area, always visible, Grafana "big number widget" style.

```typescript
// Compute in DraftSidebar or extract to a small hook
const valueCaptured = useMemo(() => {
  return myRoster.reduce((sum, p) => {
    const marketVal = p.playerId !== undefined
      ? (espnDomAuctionValues[p.playerId] ?? 0)
      : 0;
    return sum + (marketVal - (p.cost ?? 0));
  }, 0);
}, [myRoster, espnDomAuctionValues]);
```

Display: `+$XX` in green if positive, `-$XX` in red if negative.

### Pattern 4: Position Supply Heatmap — Data Derivation
**What:** Count how many of the top-N ranked players at each position are still undrafted.
**When to use:** PositionSupplyHeatmap component.

Pool sizes from locked decisions:
- Default positions: top 15 per position
- OF: top 50
- SP: top 30

```typescript
// Derive from rankings + allPicks in the component (no engine change needed)
const SUPPLY_POOL_SIZES: Record<string, number> = {
  C: 15, '1B': 15, '2B': 15, '3B': 15, SS: 15,
  OF: 50, SP: 30, RP: 15,
};

function computePositionSupply(
  rankings: DraftRanking[],
  allPicks: DraftPick[],
): Record<string, { drafted: number; total: number }> {
  const draftedIds = new Set(allPicks.map(p => p.playerId));
  const result: Record<string, { drafted: number; total: number }> = {};
  for (const [pos, poolSize] of Object.entries(SUPPLY_POOL_SIZES)) {
    const topN = rankings
      .filter(r => r.positions.some(p => p.toUpperCase().includes(pos)))
      .slice(0, poolSize);
    const drafted = topN.filter(r => draftedIds.has(r.playerId)).length;
    result[pos] = { drafted, total: topN.length };
  }
  return result;
}
```

### Pattern 5: Next Nominee — Strategy Tag Derivation
**What:** Take `simulation.nominationStrategy[0]` (top recommendation) and map its `reason` to a compact tag.
**When to use:** NextNominee component.

```typescript
// Derive strategy tag from NominationRecommendation.reason string
function deriveStrategyTag(reason: string): 'Budget Drain' | 'Own Target' | 'Overpriced' {
  if (reason.toLowerCase().includes('overpriced')) return 'Overpriced';
  if (reason.toLowerCase().includes("don't need")) return 'Budget Drain';
  return 'Own Target';
}
```

Auto-pilot "Nominating" active state: Poll `autoBidController.getNominationDiagnostics()` — when `diag.currentAuctionPlayer == null && diag.autoMode && diag.nominationAttempts > 0 && diag.cooldownRemainingMs === 0`, show "Nominating..." state. (Same polling pattern as NominationDiagnostics.tsx.)

### Pattern 6: pitcherHitterSplit Default Change
**What:** Decision locks the default split to 75% hitters / 25% pitchers. Current default in `draft-state.ts` is 65%.
**When to use:** Update the Zustand store default value.

Current state (draft-state.ts line ~77):
```typescript
pitcherHitterSplit: number; // 0-100, default 65 = 65% hitting
```

The store initializes via Zustand `persist` — the default is set in the `create()` call. Need to find and change the initial value to `75`.

### Anti-Patterns to Avoid
- **Direct CSS dark mode via media queries:** The sidebar runs in a Shadow DOM context injected into ESPN. Use explicit Grafana color values in Tailwind config — do not use `dark:` variants (ESPN page's dark mode shouldn't affect the sidebar).
- **Adding new engine computations in components:** All data needed (projectedStandings, inflation, budgetCurve, nominationStrategy, scarcity) already flows through `useDraftEngineSignals()`. Derive in component, don't touch engine files.
- **Deleting files for removed sections:** CONTEXT.md explicitly says preserve snake draft code and narrator. Don't render, don't delete.
- **Sparklines via canvas/d3 in Shadow DOM:** If sparklines are implemented, use pure SVG with inline React — canvas elements behave inconsistently in Shadow DOM extensions.
- **Removing `<ErrorBoundary>` wrappers:** Every section that had one should keep one. Dark mode reskin doesn't change the error boundary requirement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Category rank colors | Custom color lerp | Simple 4-bucket mapping (see Pattern 2) | Only 4 color stops needed, no library overhead |
| Value captured | Separate agent/computation | `useMemo` over `myRoster` + `espnDomAuctionValues` | Data already in store |
| Position supply counts | New engine module | Inline derivation in component (see Pattern 4) | Simple filter+count, not engine-critical |
| Dark mode theming | CSS variables injected at runtime | Tailwind config extension | Tailwind already processes the extension CSS |
| Sparklines | D3 / recharts | SVG path (3-5 data points max) | Extension weight concern, Shadow DOM canvas issues |

**Key insight:** All engine signals are computed. This phase only adds display logic over existing data — no new workers, no new engine modules, no API calls.

## Common Pitfalls

### Pitfall 1: Tailwind Token Conflicts Between Light and Dark Sections
**What goes wrong:** If DraftSidebar uses both old `surface-*` tokens (for sections not yet reskinned) and new `grafana-*` tokens, sections will have mismatched backgrounds.
**Why it happens:** Incremental refactor — some components reskinned, some not.
**How to avoid:** Do a full pass on every rendered component. Replace all `bg-surface`, `bg-surface-secondary`, `text-content`, `text-content-secondary` with `grafana-*` equivalents in one plan task.
**Warning signs:** White boxes inside dark panels.

### Pitfall 2: `pitcherHitterSplit` Persisted to localStorage
**What goes wrong:** Zustand `persist` middleware saves `pitcherHitterSplit` to `localStorage`. If a user has an old value (65), changing the store default to 75 won't update it for existing users.
**Why it happens:** Zustand persist restores from storage and ignores the new default.
**How to avoid:** Add a `version` bump to the Zustand persist config + a migration that resets the split to 75. Or: just remove `pitcherHitterSplit` from the persisted state and always initialize from the default (since the slider is being removed anyway).
**Warning signs:** Split shows wrong value despite code change.

### Pitfall 3: Category Heatmap With No projectedStandings Data
**What goes wrong:** `engineSignals.projectedStandings` is null until 3+ teams have FG-matched players. Early in the draft, the heatmap has nothing to display.
**Why it happens:** `computeProjectedStandings` returns empty signal when `teamsWithData < 3`.
**How to avoid:** Show a "Waiting for draft data..." placeholder with skeleton bars at the correct color-neutral gray.
**Warning signs:** Null access crash or invisible section.

### Pitfall 4: ESPN DOM Auction Values Decision Change
**What goes wrong:** CONTEXT.md says "always use preloaded ESPN values from Live Draft Trends page CSV — stop trying to detect/scrape from ESPN DOM." The current code has multiple paths that fall back to `espnDomAuctionValues` scraped from the DOM.
**Why it happens:** The DOM scraping code in `AuctionRecommendations.tsx` still references `espnDomAuctionValues`. The nominated player display in `DraftSidebar.tsx` has a `domEspnValue` fallback path.
**How to avoid:** The research finding here is that `espnDomAuctionValues` is populated by DOM scraping in `dom-observers.ts`, separate from the preloaded CSV path. The decision is to use preloaded CSV values (loaded via `csv-parser.ts` → `auctionValues` in store). In the new nominated player display, use `auctionValues` lookup only — remove the `espnDomAuctionValues` path from the display components. Do NOT remove `espnDomAuctionValues` from the engine (it's used for nomination strategy's `espnAvgSalary`) — only remove from display.
**Warning signs:** Market value shows "--" for all players even when CSV is loaded.

### Pitfall 5: Shadow DOM and Scrolling
**What goes wrong:** New always-visible sections (CategoryHeatmap, SignalStrip) increase the fixed-height portion of the sidebar, compressing the scrollable area.
**Why it happens:** `DraftSidebar.tsx` uses `flex flex-col h-full` with `flex-1 overflow-y-auto` for the scrollable content. Adding more non-scrolling sections reduces scroll area.
**How to avoid:** Keep all new sections inside the `flex-1 overflow-y-auto` scroll container except the Header, Auto-pilot toggle, and Nominated Player + BidVerdict (those are above-the-fold fixed). CategoryHeatmap can be always-visible within the scroll area — it doesn't need to be fixed.
**Warning signs:** Ideal roster list gets cut off.

### Pitfall 6: `autoMode` Defaulting to ON
**What goes wrong:** CONTEXT.md says auto-pilot defaults to ON. Currently `autoMode: false` in store. With Zustand persist, existing users won't get the new default.
**Why it happens:** Same persist issue as pitcherHitterSplit.
**How to avoid:** Add a session-only reset: since `autoMode` is already documented as "session-only, NOT persisted" in draft-state.ts (line 80), verify it's actually excluded from persist. If it is, just change the initial state value to `true`. If not, add it to the persist exclude list.
**Warning signs:** Auto-pilot toggle starts OFF despite code showing `true` default.

## Code Examples

Verified patterns from the existing codebase:

### Accessing Engine Signals (existing pattern, unchanged)
```typescript
// Source: DraftSidebar.tsx
const engineSignals = useDraftEngineSignals();
// engineSignals.inflation.inflationBand → "overspending" | "neutral" | "buying_window" | "strong_value"
// engineSignals.budgetCurve.endgameMode → boolean
// engineSignals.budgetCurve.hitterSpent → number
// engineSignals.budgetCurve.pitcherSpent → number
// engineSignals.projectedStandings?.standings → ProjectedTeamStanding[]
// engineSignals.simulation?.nominationStrategy → NominationRecommendation[]
```

### InflationBand → Signal Strip Badge
```typescript
// Source: engine/types.ts InflationSignal.inflationBand values
const INFLATION_BAND_DISPLAY = {
  overspending: { label: 'OVERSPENDING', color: 'bg-grafana-inflation-overspending text-white' },
  neutral: { label: 'NEUTRAL', color: 'bg-grafana-inflation-neutral text-white' },
  buying_window: { label: 'BUY WINDOW', color: 'bg-grafana-inflation-buying text-white' },
  strong_value: { label: 'STRONG VALUE', color: 'bg-grafana-inflation-strong text-white' },
};
```

### SP Tier Count from myRoster
```typescript
// Source: engine/draft-constants.ts getSpTierCap pattern
const spCount = myRoster.filter(p =>
  p.positions?.some(pos => pos.toUpperCase().includes('SP'))
).length;
// Display: "SP 2/5" where 5 is the total SP slots from detectedRosterSlots or default
```

### Market Value for Nominated Player (new approach — CSV only)
```typescript
// Remove domEspnValue path. Use auctionValues (from CSV) only.
const matchedAuction = auctionValues.find(av =>
  av.playerId === currentAuctionPlayer.playerId ||
  av.playerName.toLowerCase() === currentAuctionPlayer.playerName.toLowerCase()
);
const marketValue = matchedAuction?.dollarValue;
```

### Tier Badge for Nominated Player
```typescript
// Use auctionValues.dollarValue to determine tier (consistent with IdealRosterPlayer.tier)
function getPlayerTier(dollars: number): 'anchor' | 'core' | 'value' {
  if (dollars > 20) return 'anchor';
  if (dollars >= 5) return 'core';
  return 'value';
}
```

### Budget Split Tracking for Signal Strip
```typescript
// From BudgetCurveSignal (engine/types.ts lines 80-84)
const { hitterSpent, pitcherSpent } = engineSignals.budgetCurve;
const totalSpent = hitterSpent + pitcherSpent;
const actualHitPct = totalSpent > 0 ? Math.round(hitterSpent / totalSpent * 100) : 75;
// Display: "HIT 73%" vs target 75%
```

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Budget pacing section | Removed — data in header | Signal strip covers budget state |
| AI Narrator | Removed | Files kept, not rendered |
| Full nomination list | Single next-nominee card | Simpler, less scroll |
| 50 auction recommendations | Top 10 | Less scroll, more focused |
| Light mode (white/gray) | Grafana dark (#181b1f/#22252b) | New tailwind token namespace |
| DOM-scraped ESPN values (display) | CSV preloaded values | More reliable, always available |

**Deprecated in this phase (not deleted):**
- `AuctionBudgetTracker.tsx` — not rendered in new layout
- `DraftNarrator.tsx` — not rendered
- `PositionScarcityAlerts.tsx` — not rendered
- Snake UI components (`SnakeTurnPairs.tsx`, `DraftRecommendations.tsx`, `RosterSummary.tsx`) — not rendered in auction, unchanged

## Open Questions

1. **NominationDiagnostics in new layout**
   - What we know: It's a collapsible panel with Force Nominate button — high value for debugging
   - What's unclear: Does it belong in the new section order? It wasn't mentioned in CONTEXT.md's section order.
   - Recommendation: Keep it collapsed by default below the NextNominee section. It's a dev/debug aid and doesn't disrupt the visual hierarchy.

2. **"Value captured" when no ESPN CSV is loaded**
   - What we know: `espnDomAuctionValues` may be empty early in draft, `auctionValues` (CSV) should always be available if user uploaded FG data
   - What's unclear: Should value captured use FG dollar values as fallback, or show "--" when CSV not loaded?
   - Recommendation: Use `auctionValues` CSV as the market value source. If no CSV, show "$--" or "Load CSV" prompt.

3. **Position supply heatmap — position eligibility from `rankings` vs `auctionValues`**
   - What we know: `rankings` (DraftRanking[]) has `positions` field. `auctionValues` (AuctionValue[]) also has `positions`. The pool defined in CONTEXT.md references "top 15 per position" — meaning top 15 by external rank or by FG dollar value?
   - What's unclear: Which sort order defines "top" for pool size purposes
   - Recommendation: Use external rank from `rankings` (sorted by `externalRank` ascending) as the canonical "top N" definition, consistent with how the scarcity engine works.

4. **`autoMode` default value and Zustand persist**
   - What we know: `autoMode` is documented as "session-only, NOT persisted" in draft-state.ts comments
   - What's unclear: Whether it's actually excluded from the Zustand persist configuration
   - Recommendation: Verify the persist config's `partialize` function. If `autoMode` is excluded, set initial value to `true`. If it's included, add it to the exclude list AND set initial value to `true`.

## Sources

### Primary (HIGH confidence)
- Direct codebase read: `packages/extension/components/DraftSidebar.tsx` — full current component structure
- Direct codebase read: `packages/extension/lib/engine/types.ts` — all signal types (`InflationSignal`, `BudgetCurveSignal`, `DraftEngineSignals`, `ProjectedStandingsSignal`, etc.)
- Direct codebase read: `packages/extension/lib/engine/inflation.ts` — confirms `inflationBand` values
- Direct codebase read: `packages/extension/lib/engine/budget-curve.ts` — confirms `endgameMode`, `hitterSpent`, `pitcherSpent`
- Direct codebase read: `packages/extension/lib/engine/draft-constants.ts` — confirms `POSITIONAL_WEIGHTS`, `SP_TIER_CAPS`, `CATEGORY_RANK_TARGETS`
- Direct codebase read: `packages/extension/lib/engine/nomination-strategy.ts` — confirms `NominationRecommendation.reason` string content
- Direct codebase read: `packages/extension/tailwind.config.js` — existing token names (`surface-*`, `content-*`, `accent`, `positive`, `negative`, etc.)
- Direct codebase read: `packages/extension/styles/content.css` — sidebar positioning, Shadow DOM setup

### Secondary (MEDIUM confidence)
- Grafana OSS design system palette: `#181b1f` / `#22252b` are the canonical Grafana dark panel colors, widely documented in Grafana's public docs and Github issues

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing dependencies, no new libraries
- Architecture: HIGH — direct code reading, signal types fully understood
- Pitfalls: HIGH — derived from reading actual implementation (persist behavior, Shadow DOM, DOM scraping paths)
- Grafana colors: MEDIUM — verified from public Grafana documentation, secondary accent colors are Claude's discretion

**Research date:** 2026-03-16
**Valid until:** 60 days (stable Tailwind + React, no fast-moving dependencies)
