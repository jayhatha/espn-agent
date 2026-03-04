# Phase 21: Dynamic Build Archetype Analysis - Research

**Researched:** 2026-03-04
**Domain:** Chrome extension — build archetype classification, category ceiling simulation, greedy roster fill, FanGraphs CSV bundling
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Archetype definition**
- Both category-based AND spending pattern define the archetype — e.g. "power stars-and-scrubs" vs "balanced speed build"
- Show the data (category projections, z-scores) but also surface a summary label when the shape clearly matches a known archetype (e.g. "Power Build", "Pitching-First", "Speed Punt")
- Show from pick 1 but with a confidence indicator — low confidence early, high confidence after 5+ picks
- Show both views: current trajectory from drafted picks AND projected full roster if filled optimally. Gap between them shows remaining opportunity

**Constraint expression**
- Primary constraint signal is category ceilings — "Given remaining budget + available players, your max achievable HR is ~220"
- Compare ceilings against competitive targets — "HR ceiling: ~220 (top-3 needs ~250)" makes it immediately actionable
- Update on every pick (any team's pick) but only highlight meaningful changes — ceiling dropped, punt status changed, new pivot available
- Show pivot players — name specific available players that would unlock a category ceiling (e.g. "If you grab Player X for $15, your SB ceiling jumps from 80 to 120")

**Projection data usage**
- Use both CSV types: leaderboard projections for category-level stat line analysis, auction calculator dollars for budget feasibility
- Bundle CSVs into the extension as JSON assets (like PitcherList rankings) — no backend dependency during draft, fast, static until rebuild
- Greedy fill for optimal roster simulation (or Claude's discretion on approach) — must stay within 300ms performance budget
- Unified budget — one pool across hitting and pitching, system determines best allocation

**Sidebar presentation**
- Replace/upgrade the current category gap z-scores in Engine Insights with the richer build analysis — these serve the same purpose, the new version is strictly better
- Collapsed by default — full breakdown available but collapsed. User expands when they want to check strategy. Saves space for recommendations
- Horizontal bars showing current vs ceiling vs target per category — similar visual language to existing Engine Insights z-score bars
- Subtle indicator for punt detection — color the category row or add a small icon. Don't shout, user may be intentionally punting

### Claude's Discretion
- Exact archetype label set (how many archetypes, naming)
- Greedy fill algorithm specifics vs lightweight knapsack
- Confidence indicator design (opacity, badge, text)
- When to suppress/show pivot player suggestions based on relevance
- How to handle rate stats (AVG, ERA, WHIP) in ceiling projections — component-based math required

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 21 adds a build archetype analysis layer to the existing deterministic draft engine. The engine already computes category gap z-scores (in `computeCategoryGaps`) but shows only current deficits — not ceilings, trajectory, or what remains achievable. This phase extends the engine with a new `lib/engine/archetype.ts` pure-function module that: (1) classifies the team's draft style into a named archetype, (2) simulates the optimal remaining roster via greedy fill to compute category ceilings, and (3) computes competitive targets from the full player pool. The results replace the current `EngineInsights` category gap section with a richer `BuildArchetypePanel` component.

The FanGraphs CSV data already exists in the project root and matches exactly what is needed. The leaderboard projection CSVs (hitters: 632 rows, pitchers: 809 rows) carry full stat lines with PlayerId and MLBAMID for matching. The auction calculator CSVs (hitters: 1,164 rows, pitchers: 545 rows) carry marginal SGP points per category plus dollar values. Both must be converted to bundled JSON assets (following the existing `fangraphs-auction-values.json` pattern) and imported at build time. No network calls are needed during the draft — this is fully offline.

The key algorithmic challenge is the greedy fill for ceiling simulation. Given a roster with N empty spots and a remaining budget B, the system must simulate filling those spots optimally to compute the maximum achievable total per category. A greedy approach — sorting undrafted players by dollar value descending, greedily filling remaining positions from most expensive to cheapest within budget — runs in O(P log P) once (where P ≈ 1,500 players) and then O(open spots) per category simulation, well within the 300ms budget. The existing engine already measures compute time and warns at 300ms. The new module slots into the orchestrator as a fifth computation step.

**Primary recommendation:** Implement `lib/engine/archetype.ts` as a pure function `computeBuildArchetype(input, fgProjections, fgAuctionValues)` returning `BuildArchetypeSignal`. Bundle the four FanGraphs CSVs as JSON in `assets/`. Add `BuildArchetypePanel` React component that replaces the `EngineInsights` category gap section. Wire into `computeDraftEngine` orchestrator and extend `DraftEngineSignals` with the new signal.

---

## Standard Stack

### Core (all already in project — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.3.3 | Pure function engine module | Already used throughout extension |
| React 18 | ^18.2.0 | `BuildArchetypePanel` component | Already used — WXT content script renderer |
| Zustand | ^5.0.11 | Draft state (`myRoster`, `remainingBudget`, `auctionValues`) | Already used — `useDraftStore` has all needed state |
| `@espn-fantasy/shared` | workspace | `StatComponents`, `Category`, `calculateFinalRate`, `calculateCategorySGP` | Already used — rate stat math in `computeCategoryGaps` |
| Vitest | ^1.6.1 | Unit tests for pure archetype functions | Already used — see `__tests__/draft-config-detector.test.ts` |

### Supporting (no new installs)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `fs` (build script only) | built-in | CSV-to-JSON conversion script | Run once to produce JSON assets, not in extension runtime |
| WXT asset bundling | ^0.20.18 | Serve JSON from `assets/` directory | Already configured — `assets/*.json` in `web_accessible_resources` |

**No new packages required.** All math is vanilla TypeScript leveraging existing shared formula functions.

---

## Architecture Patterns

### Recommended Project Structure
```
packages/extension/
├── assets/
│   ├── fangraphs-leaderboard-hitters.json   # new — converted from fangraphs-leaderboard-projections-7.csv
│   ├── fangraphs-leaderboard-pitchers.json  # new — converted from fangraphs-leaderboard-projections-8.csv
│   ├── fangraphs-auction-hitters.json       # new — converted from fangraphs-auction-calculator.csv
│   ├── fangraphs-auction-pitchers.json      # new — converted from fangraphs-auction-calculator-2.csv
│   ├── fangraphs-auction-values.json        # existing — keep as-is
│   ├── baseline-rankings.json               # existing
│   └── pitcherlist-rankings.json            # existing
├── lib/
│   ├── engine/
│   │   ├── index.ts          # existing — add archetype call and export
│   │   ├── types.ts          # existing — add BuildArchetypeSignal, FgProjection types
│   │   ├── archetype.ts      # NEW — computeBuildArchetype pure function
│   │   ├── inflation.ts      # existing
│   │   ├── scarcity.ts       # existing
│   │   ├── category-gap.ts   # existing
│   │   ├── budget-curve.ts   # existing
│   │   └── alerts.ts         # existing
│   ├── fangraphs-data.ts     # NEW — typed imports for bundled FanGraphs JSONs
│   ├── use-draft-engine.ts   # existing — no changes needed
│   └── draft-state.ts        # existing — no changes needed
├── components/
│   ├── BuildArchetypePanel.tsx    # NEW — replaces category gap section in EngineInsights
│   ├── EngineInsights.tsx         # existing — remove category gap section, add BuildArchetypePanel
│   └── DraftSidebar.tsx           # existing — no changes needed
└── scripts/
    └── convert-fangraphs-csvs.ts  # NEW (optional) — one-shot CSV conversion script
```

### Pattern 1: Pure Function Engine Module (matches existing pattern)

**What:** `computeBuildArchetype` accepts all inputs as arguments, returns a structured signal. No Zustand reads inside, no side effects.

**When to use:** Always — this is the established Phase 20 architecture. All engine functions are pure and testable in isolation.

```typescript
// lib/engine/archetype.ts
import type { DraftedPlayer, Category } from "@espn-fantasy/shared";
import { calculateFinalRate } from "@espn-fantasy/shared";
import type { FgHitterProjection, FgPitcherProjection, FgAuctionHitter, FgAuctionPitcher } from "../fangraphs-data";

export interface CategoryCeiling {
  stat_key: string;
  currentTotal: number;    // Sum from already-drafted players
  ceilingTotal: number;    // currentTotal + greedy-filled optimal fill
  competitiveTarget: number; // top-3 threshold from full player pool
  isPunted: boolean;       // ceiling < 70% of competitive target
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
}

export interface PivotPlayer {
  playerId: number;
  playerName: string;
  dollarValue: number;
  category: string;        // The category this player most unlocks
  ceilingLift: number;     // How much the ceiling improves if grabbed
}

export interface BuildArchetypeSignal {
  archetypeLabel: string | null;    // e.g. "Power Build", "Pitching-First", null if unclear
  archetypeConfidence: number;      // 0.0–1.0; < 0.5 = show with low-confidence indicator
  picksAnalyzed: number;            // Number of myRoster picks contributing to signal
  ceilings: CategoryCeiling[];
  pivotPlayers: PivotPlayer[];      // Top 3 most impactful available players
  spendingSplit: { hitting: number; pitching: number }; // $ already committed
}

export function computeBuildArchetype(
  myRoster: DraftedPlayer[],
  remainingBudget: number,
  allPicks: Array<{ playerId: number }>,
  fgHitters: FgHitterProjection[],
  fgPitchers: FgPitcherProjection[],
  fgAuctionHitters: FgAuctionHitter[],
  fgAuctionPitchers: FgAuctionPitcher[],
  categories: Category[],
  rosterSize: number,
): BuildArchetypeSignal {
  // ... implementation (see algorithm below)
}
```

### Pattern 2: CSV-to-JSON Asset Bundling

**What:** Convert CSVs to typed JSON at build time. Import as static JSON. WXT bundles them into the extension at `assets/*.json`.

**When to use:** For data files that are static between drafts. Follows the exact pattern of `fangraphs-auction-values.json` which is already used by `api-client.ts`.

```typescript
// lib/fangraphs-data.ts
import fgLeaderboardHitters from "../assets/fangraphs-leaderboard-hitters.json";
import fgLeaderboardPitchers from "../assets/fangraphs-leaderboard-pitchers.json";
import fgAuctionHitters from "../assets/fangraphs-auction-hitters.json";
import fgAuctionPitchers from "../assets/fangraphs-auction-pitchers.json";

export interface FgHitterProjection {
  name: string;        // from "Name" column
  team: string;
  mlbamId: number;     // from "MLBAMID"
  fgId: string;        // from "PlayerId"
  HR: number;
  R: number;
  RBI: number;
  SB: number;
  AVG: number;
  OPS: number;
  AB: number;
  H: number;
  BB: number;
  HBP: number;
  SF: number;
  TB: number;
  PA: number;
}

export interface FgPitcherProjection {
  name: string;
  team: string;
  mlbamId: number;
  fgId: string;
  W: number;
  SV: number;
  HLD: number;
  ERA: number;
  WHIP: number;
  SO: number;     // "SO" column in pitcher CSV
  IP: number;
  H: number;
  ER: number;
  BB: number;
  QS: number;
}

export interface FgAuctionHitter {
  name: string;
  team: string;
  mlbamId: number;
  fgId: string;
  dollars: number;     // "Dollars" column
  mAVG: number;        // marginal SGP for AVG
  mRBI: number;
  mR: number;
  mSB: number;
  mOPS: number;
  pts: number;         // total SGP points
}

export interface FgAuctionPitcher {
  name: string;
  team: string;
  mlbamId: number;
  fgId: string;
  dollars: number;
  mW: number;
  mSV: number;
  mERA: number;        // note: positive mERA = good (lower ERA = better)
  mWHIP: number;
  mSO: number;
  pts: number;
}

// Re-export typed JSON assets
export const fgLeaderboardHittersData = fgLeaderboardHitters as FgHitterProjection[];
export const fgLeaderboardPitchersData = fgLeaderboardPitchers as FgPitcherProjection[];
export const fgAuctionHittersData = fgAuctionHitters as FgAuctionHitter[];
export const fgAuctionPitchersData = fgAuctionPitchers as FgAuctionPitcher[];
```

### Pattern 3: Greedy Fill Algorithm for Category Ceilings

**What:** To compute category ceilings, simulate filling empty roster spots with the best available undrafted players within the remaining budget. "Best" is defined by auction dollar value from FanGraphs (maximizes overall team quality).

**Algorithm:**
1. Build set of drafted player IDs (from `allPicks`)
2. Merge hitter + pitcher projections with their dollar values
3. Sort undrafted players by dollar value descending
4. Greedily fill N remaining spots (N = rosterSize - myRoster.length) from most to least expensive, subject to budget constraint
5. Track remaining budget as each player is assigned
6. Sum the resulting roster's category projections for the ceiling

**Performance:** Sorting 1,500 players once = ~O(P log P). Greedy fill = O(open spots). Total adds ~5-20ms to the engine's 300ms budget. Run only when myRoster or allPicks changes (same memoization as the main engine).

```typescript
// Greedy fill pseudocode (simplified)
function greedyFill(
  undraftedByValue: Array<{ dollars: number; stats: StatComponents }>,
  spotsToFill: number,
  remainingBudget: number,
): StatComponents[] {
  const filled: StatComponents[] = [];
  let budgetLeft = remainingBudget - (spotsToFill - 1); // Reserve $1 per remaining spot

  for (const player of undraftedByValue) {
    if (filled.length >= spotsToFill) break;
    if (player.dollars <= budgetLeft) {
      filled.push(player.stats);
      budgetLeft -= player.dollars;
    }
    // Skip players too expensive, continue to next
  }

  // If budget ran out before filling all spots, add remaining as $1 players
  while (filled.length < spotsToFill) {
    // Use median replacement-level player stats
    filled.push(replacementLevelStats);
  }

  return filled;
}
```

**Why greedy over knapsack:** Full 0-1 knapsack on 1,500 items × 25 spots is computationally expensive (O(N*W) for integer weights). Greedy is O(N log N) and produces near-optimal results for this use case because player values are continuous (not discrete weights), and the draft constraint is simple (budget ≥ cost). Fantasy draft theory confirms greedy by dollar-value gives near-optimal roster construction when values scale linearly with cost.

### Pattern 4: Competitive Target Calculation

**What:** Compute the "top-3 target" for each category by simulating what a top-performing team would accumulate. Use the FanGraphs auction calculator's `PTS` (total SGP) field to identify top-tier teams.

**Algorithm:**
1. Partition all players into 12 simulated teams using the auction calculator $ values (greedy allocation by round)
2. For each simulated team, sum category totals
3. Sort teams by each category
4. Take the 3rd-ranked team's total as the competitive target

**Shortcut alternative (recommended for simplicity):** Rather than simulating 12 full draft rounds, compute the competitive target as the sum of the top (rosterSize/12) players by that category from the player pool. For a 12-team league with 23-player rosters, a "top-3" team for HR would need approximately the cumulative HR of the top 6-8 HR contributors to their roster. This is much simpler and sufficiently accurate.

**Practical shortcut:**
```typescript
// For counting stats: competitive target = percentile of simulated league distributions
// Simple approach: take all undrafted+drafted players, compute what the 3rd-best team
// could assemble. Use: top (rosterSize * 3 / numTeams) hitters' stats summed.
const TOP_3_ROSTER_FRACTION = 3 / 12; // top-3 team in 12-team league
const hitterSlotsPerTeam = 14; // approximate hitting roster slots
const competitiveHitterPool = Math.round(hitterSlotsPerTeam * 12 * TOP_3_ROSTER_FRACTION);
// Sum top competitiveHitterPool players' HR = top-3 team HR target
```

### Pattern 5: Archetype Label Classification

**What:** After computing current team stats and spending, classify into a named archetype. Use a rules-based classifier (not ML) on the category z-scores and spending split.

**Archetype label set (recommended):**
- "Power Build" — HR + RBI z-scores both > +0.5, SB z-score < -0.5
- "Speed Build" — SB z-score > +1.0, HR z-score < 0
- "Pitching-First" — pitching $ spend > 45% of total spent, pitching z-scores dominant
- "Balanced" — all categories within ±0.5 z-scores of competitive target
- "Stars-and-Scrubs" — spending variance high (top player cost > 30% of budget), mixed categories
- "OBP/OPS Heavy" — OBP/OPS z-scores > +0.5, HR < 0
- null — fewer than 5 picks (insufficient signal)

**Confidence:** `picks / 10` clamped to [0, 1]. Show archetype label only when confidence >= 0.5 (5+ picks). Below threshold, show "Building..." with low-confidence styling.

### Pattern 6: Rate Stat Ceilings (Component Math)

**What:** Rate stats (AVG, ERA, WHIP, OPS) require summing components across the roster, then computing the rate. The ceiling simulation adds the greedy-filled players' components to the current roster's components, then computes the rate from the total.

This is the same approach used in `computeCategoryGaps` (lib/engine/category-gap.ts). Re-use `calculateFinalRate` from `@espn-fantasy/shared`.

```typescript
// Source: existing pattern in lib/engine/category-gap.ts
function computeRateCeiling(
  draftedStats: StatComponents[],  // current roster component arrays
  filledStats: StatComponents[],   // greedy fill additions
  formulaId: string,               // "avg", "era", "whip", "ops"
): number {
  const combined: StatComponents = {};
  for (const stats of [...draftedStats, ...filledStats]) {
    for (const [key, val] of Object.entries(stats)) {
      combined[key] = (combined[key] ?? 0) + (Number(val) || 0);
    }
  }
  try {
    return calculateFinalRate(formulaId, {}, combined);
  } catch {
    return 0;
  }
}
```

### Pattern 7: Player Matching (FanGraphs ID to ESPN ID)

**What:** FanGraphs CSVs use MLBAMID for player identity. The existing draft store uses ESPN player IDs (`DraftRanking.playerId`). The existing `fangraphs-auction-values.json` only has `mlbamId` and no ESPN ID. The `api-client.ts` already resolves this via name normalization.

**Key insight:** The `DraftRanking` objects in the store have `projectedStats` populated from the backend's `DraftRankingsAgent`. However, `buildBundledRankings()` in `api-client.ts` sets `projectedStats: {}` (empty) for bundled players — meaning the existing category gap engine currently computes zeroes for teams using the offline fallback path.

**For Phase 21:** The archetype engine uses FanGraphs projections directly by name matching, bypassing the ESPN ID dependency. The same `normalizeName()` function from `api-client.ts` provides the matching key.

**Implementation approach:**
1. Build a Map keyed by `normalizeName(playerName)` from FanGraphs CSVs
2. When a pick is made, look up the player's FG projection by name
3. Match succeeds for ~90% of cases (same logic already proven in `buildBundledRankings`)
4. Players with no FG match are skipped (treated as zero contribution)

### Anti-Patterns to Avoid
- **Blocking the main thread with JSON import:** WXT/Vite inlines JSON imports at build time. The assets are ~200KB total — safe to import statically. Do NOT fetch them at runtime.
- **Running greedy fill on every render:** Memoize behind `allPicks.length` and `myRoster.length` changes, same as `computeDraftEngine`. Do not rerun when only `currentAuctionPlayer` changes.
- **Using the leaderboard CSV's pre-computed AVG/ERA/OPS directly for ceilings:** The pre-computed rate stats in the CSV are correct for individual players but cannot be summed across roster. Always reconstruct from components (AB, H, IP, ER, etc.) for team totals.
- **Averaging rate stats:** `(player1.AVG + player2.AVG) / 2` is wrong. Sum AB and H separately, then compute `totalH / totalAB`. The formula exists in `@espn-fantasy/shared`.
- **Sorting undrafted players differently per category:** Sort once by dollar value descending and reuse that order for all category simulations. The "best team" for one category is not the same as for another, but the greedy fill produces the best achievable overall portfolio — which is the correct interpretation of "ceiling."

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate stat math (AVG, ERA, WHIP, OPS) | Custom formula | `calculateFinalRate` from `@espn-fantasy/shared` | Already handles component combination, zero-division guards, formula dispatch |
| Category z-score | Custom std-dev | `calculateCategorySGP` from `@espn-fantasy/shared` | Already implemented and tested |
| Player name normalization | Custom fuzzy match | `normalizeName()` in `api-client.ts` (copy or export) | Already proven to match 90%+ of FanGraphs players against ESPN names |
| CSV parsing at runtime | Runtime Papa Parse or similar | Pre-convert to JSON at build time | Extension has no CSV parser, build-time conversion is simpler and faster |
| Knapsack optimizer | Dynamic programming budget solver | Greedy fill by dollar value | Near-optimal for continuous-valued items, runs in <5ms, no extra dependency |

**Key insight:** The shared package already has all the math. The core work of this phase is algorithm design (ceiling simulation, archetype classification), data wiring (FG JSON assets), and UI (replace EngineInsights category section).

---

## Common Pitfalls

### Pitfall 1: Pitcher vs Hitter Stat Key Collision
**What goes wrong:** Both the hitter CSV and pitcher CSV have a column named "H" — but for hitters it means hits produced; for pitchers it means hits allowed. Similarly "BB" means different things. Naively merging both into a single `StatComponents` object causes WHIP to be computed with hitter BB values.
**Why it happens:** `StatComponents` in shared types uses generic keys. The existing WHIP formula already handles this via `HA` and `BBA` keys (pitcher-specific), but the FanGraphs CSV uses `H` and `BB` for both.
**How to avoid:** When building pitcher projections from FanGraphs CSV, store hits-allowed as `HA` and walks-allowed as `BBA` (the keys `calculateWHIP` already prefers per the formula file). Keep hitter and pitcher player pools separate throughout the archetype computation.
**Warning signs:** WHIP ceiling values > 5.0 or < 0.1 indicate wrong components.

### Pitfall 2: Greedy Fill Ignores Position Constraints
**What goes wrong:** A pure dollar-value greedy fill picks the top 25 hitters and no pitchers, which is invalid. The resulting "ceiling" dramatically overstates what's actually achievable.
**Why it happens:** The optimization target (dollar value) doesn't encode positional roster requirements.
**How to avoid:** Apply position-aware fills. Use the rosterSlots from `DraftConfiguration` (available via `leagueCategories` chain or `rosterSize`). A simple approach: fill each position slot independently. First fill SP slots from SP-eligible players, then RP slots, then hitting slots. Within each position group, apply greedy by dollar value.
**Warning signs:** Ceiling team contains 20 outfielders or 0 pitchers.

### Pitfall 3: FanGraphs CSV Encoding Issues
**What goes wrong:** The CSV files have a UTF-8 BOM (`\ufeff`) at the start, causing the first column name to appear as `"\ufeffName"` instead of `"Name"`. This breaks all player name matching.
**Why it happens:** Confirmed from live inspection: `fangraphs-leaderboard-projections-7.csv` first column is `'\ufeffName'`.
**How to avoid:** Strip BOM when reading CSVs in the conversion script: `fs.readFileSync(path, 'utf-8').replace(/^\uFEFF/, '')`. Or: when accessing the first column, strip the BOM prefix if present.
**Warning signs:** Player lookups return 0 matches for all players.

### Pitfall 4: Mismatch Between FanGraphs and ESPN Player IDs
**What goes wrong:** The FanGraphs CSVs use MLBAMID and FanGraphs PlayerId. The draft store uses ESPN player IDs. There is no direct mapping table. Name-based matching works for 90%+ but fails on players with common names or international characters.
**Why it happens:** FanGraphs and ESPN maintain separate player ID systems.
**How to avoid:** Use the same `normalizeName()` normalization already used in `api-client.ts`. Accept ~10% miss rate — players that don't match contribute 0 to the team ceiling, which is a conservative (not misleading) error. Do NOT attempt to join on MLBAMID without an existing mapping table.
**Warning signs:** All well-known players (Judge, Ohtani) return 0 stats — indicates normalization failure, not just edge cases.

### Pitfall 5: `projectedStats` is Empty in Bundled Rankings Path
**What goes wrong:** `DraftRanking.projectedStats` is set to `{}` (empty object) when using the offline bundled rankings path in `buildBundledRankings()` in `api-client.ts`. The existing `computeCategoryGaps` function reads from `ranking.projectedStats` — which means category gaps currently show as 0 for everyone when using bundled rankings. Phase 21's archetype module must NOT rely on `ranking.projectedStats` from the store — it must use the FanGraphs leaderboard CSVs directly.
**Why it happens:** `buildBundledRankings()` was built to provide dollar values and tier rankings, not full stat projections. The stat projection path only populates when the backend is available.
**How to avoid:** The archetype module uses `fgLeaderboardHittersData` and `fgLeaderboardPitchersData` (bundled JSON) as the projection source, matching players by name. Do not use `ranking.projectedStats` as the primary stats source.
**Warning signs:** All category ceilings show 0, even after 10+ picks.

### Pitfall 6: Rate Stat Ceilings Look Wrong When Pitching Mix Changes
**What goes wrong:** ERA and WHIP ceilings get better or worse dramatically as the greedy fill adds pitchers — because IP denominator changes significantly. A team with 1 SP drafted and 4 more greedy-filled shows an ERA ceiling calculated from 5 very different pitchers, which may be unexpected.
**Why it happens:** Rate stats' denominators scale with roster size. Adding a dominant SP lowers ERA ceiling dramatically; adding a mediocre one raises it.
**How to avoid:** This is correct behavior, not a bug — it's the whole point of ceiling simulation. The UI should label ceilings as "if optimally filled" to set expectations. The punt indicator (ceiling < 70% of competitive target) prevents the confusion of showing a good ERA ceiling when the user has committed too much budget to hitters.

### Pitfall 7: 300ms Budget Violation from JSON Size
**What goes wrong:** Importing all four FanGraphs JSONs as static assets adds ~200-300KB to the extension bundle. If the archetype compute runs on every render cycle (not just on pick changes), it could stall the sidebar UI.
**Why it happens:** The greedy fill sorts 1,500+ players on every invocation if not memoized.
**How to avoid:** Memoize `computeBuildArchetype` behind `allPicks.length` and `myRoster.length` — not on every render. The JSON assets are imported at module load time (sync), not per-call. Pre-sort the player pool once at module initialization rather than inside the function.
**Warning signs:** `computeTimeMs` in DraftEngineSignals consistently shows >250ms.

---

## Code Examples

### CSV Conversion Script (build time)

```typescript
// scripts/convert-fangraphs-csvs.ts
// Run: npx tsx scripts/convert-fangraphs-csvs.ts
import * as fs from "fs";
import * as path from "path";

function parseCsv(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, ""); // strip BOM
  const lines = raw.split("\n").filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] ?? "").trim()]));
  });
}

function parseCsvLine(line: string): string[] {
  // Handle quoted fields with commas
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

// Convert hitter projections
const hitterRows = parseCsv("../../../../fangraphs-leaderboard-projections-7.csv");
const hitters = hitterRows.map(r => ({
  name: r["Name"],
  team: r["Team"],
  mlbamId: Number(r["MLBAMID"]) || 0,
  fgId: r["PlayerId"],
  HR: Number(r["HR"]) || 0,
  R: Number(r["R"]) || 0,
  RBI: Number(r["RBI"]) || 0,
  SB: Number(r["SB"]) || 0,
  AVG: Number(r["AVG"]) || 0,
  OPS: Number(r["OPS"]) || 0,
  AB: Number(r["AB"]) || 0,
  H: Number(r["H"]) || 0,
  BB: Number(r["BB"]) || 0,
  HBP: Number(r["HBP"]) || 0,
  SF: Number(r["SF"]) || 0,
  TB: Number(r["TB"]) || 0,
  PA: Number(r["PA"]) || 0,
})).filter(p => p.name && p.mlbamId > 0);

fs.writeFileSync(
  "../../packages/extension/assets/fangraphs-leaderboard-hitters.json",
  JSON.stringify(hitters, null, 0), // compact JSON
);
console.log(`Converted ${hitters.length} hitters`);
// ... repeat for pitchers and auction calculator CSVs
```

### Archetype Engine Integration (engine/index.ts)

```typescript
// Source: existing pattern in lib/engine/index.ts
import { computeBuildArchetype } from "./archetype";
import { fgLeaderboardHittersData, fgLeaderboardPitchersData, fgAuctionHittersData, fgAuctionPitchersData } from "../fangraphs-data";

export function computeDraftEngine(input: DraftEngineInput): DraftEngineSignals {
  const t0 = performance.now();

  // ... existing steps 1-5 ...

  // 6. Build archetype analysis (new)
  const archetype = computeBuildArchetype(
    input.myRoster,
    input.remainingBudget,
    input.allPicks,
    fgLeaderboardHittersData,
    fgLeaderboardPitchersData,
    fgAuctionHittersData,
    fgAuctionPitchersData,
    input.leagueCategories,
    input.rosterSize,
  );

  const elapsed = performance.now() - t0;
  if (elapsed > 300) {
    console.warn(`[DraftEngine] Recompute took ${elapsed.toFixed(1)}ms -- exceeds 300ms budget`);
  }

  return {
    inflation,
    scarcity,
    categoryGaps,  // Keep for backward compat, archetype replaces the UI
    budgetCurve,
    alerts,
    archetype,     // new
    computeTimeMs: Math.round(elapsed * 10) / 10,
  };
}
```

### BuildArchetypePanel Component (replacing EngineInsights category gap section)

```tsx
// components/BuildArchetypePanel.tsx
import React from "react";
import type { BuildArchetypeSignal } from "../lib/engine/archetype";

interface BuildArchetypePanelProps {
  signal: BuildArchetypeSignal | null;
}

export default function BuildArchetypePanel({ signal }: BuildArchetypePanelProps) {
  if (!signal) return null;
  if (signal.picksAnalyzed === 0) return null;

  const showLabel = signal.archetypeConfidence >= 0.5 && signal.archetypeLabel;

  return (
    <details className="group">
      <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none border-t border-surface-tertiary">
        <div className="flex items-center gap-2">
          <span className="text-body-sm font-semibold text-content">Build Analysis</span>
          {showLabel && (
            <span className="text-body-xs font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent">
              {signal.archetypeLabel}
            </span>
          )}
          {!showLabel && signal.picksAnalyzed > 0 && (
            <span className="text-body-xs text-content-secondary opacity-60">
              Building...
            </span>
          )}
        </div>
        <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-3 pb-3 pt-2 bg-surface space-y-1.5">
        {signal.ceilings.map(ceiling => (
          <CategoryCeilingBar key={ceiling.stat_key} ceiling={ceiling} />
        ))}
        {signal.pivotPlayers.length > 0 && (
          <div className="mt-2 pt-2 border-t border-surface-tertiary">
            <div className="text-body-xs font-semibold text-content-secondary mb-1">Pivot Players</div>
            {signal.pivotPlayers.map(p => (
              <div key={p.playerId} className="flex items-center justify-between text-body-xs">
                <span className="text-content">{p.playerName}</span>
                <span className="text-content-secondary">${p.dollarValue} → +{p.ceilingLift.toFixed(0)} {p.category}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function CategoryCeilingBar({ ceiling }: { ceiling: CategoryCeiling }) {
  const { stat_key, currentTotal, ceilingTotal, competitiveTarget, isPunted, direction } = ceiling;

  // For LOWER_BETTER stats, show inverse progress (lower ceiling = better)
  const isGood = direction === "HIGHER_BETTER"
    ? ceilingTotal >= competitiveTarget
    : ceilingTotal <= competitiveTarget;

  const currentPct = Math.min(100, (currentTotal / competitiveTarget) * 100);
  const ceilingPct = Math.min(100, (ceilingTotal / competitiveTarget) * 100);

  return (
    <div className="flex items-center gap-2">
      <div className={`w-10 text-body-xs font-semibold shrink-0 ${isPunted ? "text-content-secondary" : "text-content"}`}>
        {stat_key}
        {isPunted && <span className="ml-0.5 text-warning" title="Punting">⊘</span>}
      </div>
      <div className="flex-1 relative h-3 bg-surface-tertiary rounded-full overflow-hidden">
        {/* Target marker at 100% */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-content-secondary/40" />
        {/* Current total bar */}
        <div
          className="absolute top-1 bottom-1 bg-accent/40 rounded-full"
          style={{ left: 0, width: `${currentPct}%` }}
        />
        {/* Ceiling bar (additive — shows remaining potential) */}
        <div
          className={`absolute top-0.5 bottom-0.5 rounded-full ${isGood ? "bg-positive/60" : isPunted ? "bg-surface-tertiary" : "bg-warning/60"}`}
          style={{ left: `${currentPct}%`, width: `${Math.max(0, ceilingPct - currentPct)}%` }}
        />
      </div>
      <div className="text-body-xs w-16 text-right shrink-0 text-content-secondary">
        {Math.round(ceilingTotal)}/{Math.round(competitiveTarget)}
      </div>
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Category gap z-scores from current roster only | Category ceilings + competitive targets + archetype label | Phase 21 | Actionable strategy visibility instead of just current deficit |
| `projectedStats: {}` in bundled rankings | FanGraphs leaderboard CSV projected stats (full stat lines) | Phase 21 | Real projection data available offline without backend |
| FanGraphs auction-values.json has only name/dollars | New: leaderboard JSONs have full stat lines, auction JSONs have marginal SGP | Phase 21 | Enables both category ceiling (stat lines) and budget feasibility (dollars) |

**Existing state note:**
- `computeCategoryGaps` uses `ranking.projectedStats` from the store — which is `{}` empty in the offline bundled path. The category gap z-scores therefore show 0 for all teams unless the backend is running. Phase 21's archetype module bypasses this by using FanGraphs data directly. The category gap section in EngineInsights being replaced is therefore somewhat already broken — making this replacement high-value.

---

## Open Questions

1. **FanGraphs CSV player count vs extension bundle size**
   - What we know: Hitter CSV = 632 rows, pitcher CSV = 809 rows, auction CSVs = 1,164 + 545 rows. Total ~3,000 player records across 4 files. Estimated JSON size: ~150-250KB total (compact JSON).
   - What's unclear: WXT's total extension bundle size limit (Chrome hard limit is 10MB for unpacked). Current extension is well under. New JSON assets should be fine.
   - Recommendation: Proceed. If size becomes an issue, filter to top-500 players by dollar value.

2. **Competitive target calibration**
   - What we know: The "top-3 needs ~X" target must be derived from the player pool, not hardcoded. The auction calculator's `PTS` field (total SGP) can rank players, but simulating full 12-team drafts is complex.
   - What's unclear: Whether to simulate a full draft or use the simpler percentile approach.
   - Recommendation: Use the percentile approach (sum of top N players' stats where N = hitter slots × 12 teams × 3/12). This is fast, requires no simulation, and is calibrated to the actual available player pool.

3. **Pivot player relevance threshold**
   - What we know: There may be 50+ players that could improve a punted category. Showing all is noisy.
   - What's unclear: How to pick the "most impactful" 3 pivot players without being misleading (e.g., showing a $45 player when budget is $30 is useless).
   - Recommendation: Filter pivot candidates to players whose dollar value <= remainingBudget - (remainingSpots - 1), then sort by ceilingLift and take top 3. Suppress pivot section entirely if no qualified candidates exist.

4. **Archetype classification edge cases**
   - What we know: With 5+ picks, classification is feasible. With 12+ picks, classification stabilizes.
   - What's unclear: What to show at 1-4 picks (confidence < 0.5) — empty panel vs minimal data.
   - Recommendation: Show only the ceiling bars at low confidence (< 0.5), suppress the archetype label. The bars are useful from pick 1; the label requires more data.

---

## Sources

### Primary (HIGH confidence)
- Direct inspection of `/Users/jay-work/Code/espn-agent/packages/extension/lib/engine/` — all engine modules read and analyzed
- Direct inspection of `/Users/jay-work/Code/espn-agent/packages/extension/lib/api-client.ts` — `buildBundledRankings()` pattern confirmed
- Direct inspection of `/Users/jay-work/Code/espn-agent/packages/extension/assets/fangraphs-auction-values.json` — confirmed existing pattern for JSON assets
- Direct CSV inspection — column names and data types confirmed for all 4 FanGraphs CSVs including BOM issue
- `/Users/jay-work/Code/espn-agent/packages/shared/src/formulas.ts` — `calculateFinalRate`, `calculateCategorySGP` confirmed available and correct
- `/Users/jay-work/Code/espn-agent/packages/extension/lib/engine/category-gap.ts` — rate stat component pattern confirmed

### Secondary (MEDIUM confidence)
- Fantasy baseball draft theory: greedy-by-value produces near-optimal results for continuous-valued items (established in auction draft literature, consistent with the FanGraphs SGP approach)
- WXT docs: `web_accessible_resources` already configured for `assets/*.json`, confirmed no changes needed for new JSON assets

### Tertiary (LOW confidence — flag for validation)
- Archetype label set: custom proposal, not verified against any standard classification framework
- 70% ceiling threshold for punt detection: rule-of-thumb, should be tested against actual draft outcomes

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all existing packages verified in codebase
- Architecture: HIGH — follows established Phase 20 patterns, confirmed via code inspection
- CSV data formats: HIGH — confirmed by direct inspection with Python
- Pitfalls: HIGH — BOM issue confirmed by direct inspection; `projectedStats: {}` confirmed in `buildBundledRankings()`; rate stat collision documented in existing formulas.ts
- Competitive target calibration: MEDIUM — percentile approach is sound but specific thresholds (70% for punt) need empirical validation
- Archetype labels: MEDIUM — set is reasonable but untested against real draft scenarios

**Research date:** 2026-03-04
**Valid until:** 2026-05-01 (FanGraphs CSV format is stable within a season; archetype logic is custom so doesn't expire)
