# Phase 25: Projected Standings Engine - Research

**Researched:** 2026-03-05
**Domain:** Chrome Extension — pure TypeScript draft engine extension, roto standings projection, draft-progress confidence weighting, sidebar integration
**Confidence:** HIGH

---

## Summary

Phase 25 extends `league-analysis.ts` (quick-41) from a per-category ranking snapshot into a full projected standings engine. The existing code already does the hardest part — it computes per-team FG-projection-based category totals and ranks all teams per category. What's missing is: (1) summing per-category ranks into overall roto points per team, (2) projecting full-season totals by filling each team's remaining roster slots with a lightweight "best available" estimate rather than a full greedy fill per team, and (3) weighting the projections by draft progress so early-draft noise doesn't produce misleading standings.

The key architectural insight is that full greedy fill for 12 teams would be expensive (~12x the cost of single-team archetype fill, which can already take 20–40ms). The right solution is a two-tier approach: use each team's already-drafted players as the real signal, then add a uniform "replacement-level filler" for remaining slots — the same filler applied to every team so the relative ordering is preserved without expensive team-specific optimization. This keeps the cost O(teams * drafted_players) rather than O(teams * greedy_fill).

The draft-progress weight should follow a simple piecewise linear curve: 0% confidence at 0% drafted (no data), ramping linearly to a "useful threshold" around 40% of total slots drafted, reaching high confidence (~90%) at 70% and 100% at full draft. The user said "more weight once teams are about half drafted" — a threshold around 45-50% of total picks is consistent with this intent.

**Primary recommendation:** Add `computeProjectedStandings()` as a new module in `engine/projected-standings.ts`. It piggybacks on `league-analysis.ts` team totals computation (reuse the same iteration logic), adds replacement-level filler for remaining slots, computes overall roto points from per-category ranks, and wraps results with a `draftProgressWeight` confidence factor. Wire it into `engine/index.ts` as step 5c after league analysis. Surface in `EngineInsights.tsx` and pass category-rank weaknesses into top-target sorting as a category boost multiplier.

---

## Standard Stack

### Core (no new installs needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5 | Pure function module | All engine code is vanilla TS |
| `@espn-fantasy/shared` | workspace | `calculateFinalRate`, `Category` types | Already used in league-analysis.ts and archetype.ts |
| `fangraphs-data.ts` | local | `FgHitterProjection`, `FgPitcherProjection` | Static bundled data, already imported in index.ts |

**No new packages required.** All math is arithmetic on existing data structures.

---

## Architecture Patterns

### Recommended Project Structure
```
packages/extension/lib/engine/
├── projected-standings.ts   # NEW: full-season projected standings engine
├── league-analysis.ts       # EXISTING: per-team category totals + rankings
├── index.ts                 # EXISTING: wire in step 5c
└── types.ts                 # ADD: ProjectedStandingsSignal type
packages/extension/components/
└── EngineInsights.tsx       # EXTEND: add Projected Standings section
```

### Pattern 1: Replacement-Level Filler for Opponent Teams

**What:** For each team's remaining roster slots (totalSlots - draftedCount), add a
"replacement-level player" whose stats are the median stats of all remaining undrafted players.
This is O(1) per team per category — compute the replacement-level stat once for the full pool,
then multiply by `slotsRemaining` for each team.

**Why not full greedy fill per team:** `computeBuildArchetype` in `archetype.ts` runs greedy fill
for one team and can take 20–40ms. For 12 teams that's 240–480ms — exceeding the 300ms budget.
Replacement-level filler produces the same relative ordering (all teams get the same filler) while
being 100x cheaper. The goal is ranking accuracy, not absolute precision.

**When to use:** For "projected full-season total" for opponent teams. The user's own team
already has `BuildArchetypeSignal.ceilings` for precise ceiling projections — those are
surfaced separately in the archetype panel. The standings view uses the simplified model for
all teams uniformly.

**Replacement-level calculation:**
```typescript
// Source: derived from archetype.ts replacement level pattern
// For each category, compute the median stat value among undrafted players
// (not mean — median is less sensitive to outliers like Shohei Ohtani)
function computeReplacementStats(
  undraftedPlayers: PoolPlayer[],
  categories: Category[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const cat of categories) {
    const values = undraftedPlayers
      .map(p => p.stats[cat.stat_key] ?? 0)
      .filter(v => v > 0)
      .sort((a, b) => a - b);
    if (values.length === 0) { result[cat.stat_key] = 0; continue; }
    const mid = Math.floor(values.length / 2);
    result[cat.stat_key] = values.length % 2 === 0
      ? (values[mid - 1] + values[mid]) / 2
      : values[mid];
  }
  return result;
}
```

**Rate stat filler:** For rate stats (AVG, ERA, WHIP), the replacement-level stat IS the
rate — a filler replacement-level hitter hitting .255 or a filler pitcher with 3.95 ERA.
Do not multiply by `slotsRemaining` for rate stats; instead add the filler's components
(`H`, `AB`, etc.) multiplied by slotsRemaining, then recompute the rate at the end.

### Pattern 2: Roto Points from Category Rankings

**What:** Standard roto scoring: for each category, rank all N teams. Team ranked 1st
gets N points, ranked Nth gets 1 point. Overall roto points = sum across all categories.

**Implementation:**
```typescript
// Source: standard fantasy baseball roto formula
function computeRotoPts(
  teamTotals: Map<string, Record<string, number>>,
  categories: Category[],
): Map<string, number> {
  const totalTeams = teamTotals.size;
  const rotoPts = new Map<string, number>();

  for (const [teamId] of teamTotals) {
    rotoPts.set(teamId, 0);
  }

  for (const cat of categories) {
    const direction = cat.direction as "HIGHER_BETTER" | "LOWER_BETTER";
    const teamValues = Array.from(teamTotals.entries())
      .map(([id, totals]) => ({ teamId: id, val: totals[cat.stat_key] ?? 0 }));

    // Sort: HIGHER_BETTER descending, LOWER_BETTER ascending (0 = no data, push to bottom)
    teamValues.sort((a, b) => {
      if (a.val === 0 && b.val === 0) return 0;
      if (a.val === 0) return 1;
      if (b.val === 0) return -1;
      return direction === "LOWER_BETTER" ? a.val - b.val : b.val - a.val;
    });

    // Assign points: rank 1 = totalTeams points
    teamValues.forEach((entry, idx) => {
      const pts = totalTeams - idx; // 1-based rank from top
      rotoPts.set(entry.teamId, (rotoPts.get(entry.teamId) ?? 0) + pts);
    });
  }

  return rotoPts;
}
```

### Pattern 3: Draft Progress Weight Curve

**What:** A confidence multiplier (0.0–1.0) based on how far through the draft we are.
Applied to standing projections to signal "how much should you trust this?"

**Why piecewise linear, not sigmoid:** Sigmoid looks elegant but the inflection point is
hard to tune intuitively. Piecewise linear lets the user say "useful at 40%, solid at 70%"
and both thresholds map directly to breakpoints. It's also easier to test deterministically.

**User intent:** "More weight once teams are about half drafted" — threshold ~45%.

```typescript
// Source: derived from user intent; no external reference needed
function computeDraftProgressWeight(
  totalPicksMade: number,  // allPicks.length
  totalPicksInDraft: number,  // totalTeams * rosterSize
): number {
  if (totalPicksInDraft === 0) return 0;
  const progress = totalPicksMade / totalPicksInDraft;

  // Breakpoints:
  //   0%   → 0.0  (no data)
  //   30%  → 0.2  (very early signal)
  //   50%  → 0.5  (half drafted = "useful" threshold per user intent)
  //   70%  → 0.85 (strong signal)
  //   100% → 1.0  (full draft)
  if (progress <= 0) return 0;
  if (progress <= 0.30) return progress / 0.30 * 0.20;
  if (progress <= 0.50) return 0.20 + (progress - 0.30) / 0.20 * 0.30;
  if (progress <= 0.70) return 0.50 + (progress - 0.50) / 0.20 * 0.35;
  return 0.85 + (progress - 0.70) / 0.30 * 0.15;
}
```

**Why 45-50% is the "useful" threshold:** Below 50% of picks, teams have at most half their
roster — averaging 10-11 players in a 23-player auction. The filled slots may be unrepresentative
(e.g. a team that drafted 7 hitters has 0 pitching stats, distorting rate stats). At 50%+,
most teams have at least a partial pitching staff and the rate stat calculations stabilize.

### Pattern 4: Integrating Projected Standing Weakness into Top-Target Recommendations

**What:** In `engine/index.ts`, after computing projected standings, identify which categories
the user is projected weakest in (bottom 4 of 12 teams). Boost those category contributors
in top-targets sorting inside `computeRosterOptimization`.

**How:** Pass `projectedStandings.myWeakCategories` into `computeRosterOptimization` and
add a multiplier to `adjustedSgp` for players who contribute to weak categories.

**Boost formula:**
```typescript
// In computeRosterOptimization (engine/index.ts)
// Source: mirrors existing needByPosition boost pattern (lines 296-299 in index.ts)
const weakCategoryBoost = (playerStats: Record<string, number>) => {
  let boost = 1.0;
  for (const weakCat of projectedWeakCategories) {
    if ((playerStats[weakCat] ?? 0) > 0) {
      boost += 0.3; // 30% boost per weak category this player addresses
    }
  }
  return boost;
};
adjustedSgp = sgp * weakCategoryBoost(player.stats);
```

This mirrors the existing positional-need boost pattern already in `index.ts` lines 296–299.

### Pattern 5: Reusing league-analysis.ts Team Totals

**What:** `computeLeagueAnalysis` already computes `teamTotals: Map<string, Record<string, number>>`
(per-team per-category totals from drafted players only). The projected standings engine needs
the same data plus filler stats for remaining slots.

**Two options:**
1. **Refactor league-analysis.ts** to return `teamTotals` as part of its output, then pass
   it to `computeProjectedStandings`. Avoids re-computing projection lookups.
2. **Duplicate the iteration** in `projected-standings.ts` with filler added inline.

**Recommendation: Option 1** — return `teamDraftedTotals` from `computeLeagueAnalysis` and
pass it to `computeProjectedStandings`. This saves O(12 * draftedPlayers * categories) work
per recompute. The `LeagueAnalysisSignal` type would grow one field.

### Anti-Patterns to Avoid

- **Full greedy fill per opponent team:** O(12 * n_players * n_slots) every recompute. Exceeds
  300ms budget. Use replacement-level filler instead.
- **Averaging rate stats directly:** e.g. averaging each team's ERA to get "filler ERA".
  Rate stats must be computed from components. See `calculateFinalRate` in shared package.
- **Ranking teams before minimum data threshold:** When fewer than 2 teams have picked players,
  league-analysis.ts already returns early. Projected standings must enforce the same guard.
  Additionally, rate stat rankings are unreliable until teams have drafted enough players to
  have realistic component totals (e.g. a team with 1 pitcher has ~60IP; filler adds
  replacements). Enforce minimum 3 teams with data before showing standings.
- **Treating `draftProgressWeight = 0` differently from `null`:** Always compute and return
  the standings signal even at low confidence. Let the UI decide what to show/hide based on
  `draftProgressWeight`. The planner needs to avoid a pattern where `null` vs `{weight: 0.1}`
  creates two code paths.
- **Recomputing replacement level stats every pick:** Compute replacement stats once per
  engine call (they depend on undraftedPlayers set which is stable within a single
  recompute). Do not recompute per-team.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate stat calculation from components | Custom AVG/ERA/WHIP formula | `calculateFinalRate(formulaId, {}, components)` from `@espn-fantasy/shared` | Already handles all 6 rate stats, tested |
| Player name normalization | Custom string cleaner | `normalizeName()` from `archetype.ts` (exported) | Already used in league-analysis.ts |
| FG data lookup maps | Custom data loader | `fgLeaderboardHittersData` / `fgLeaderboardPitchersData` from `fangraphs-data.ts` | Static bundled data, already loaded in index.ts |
| Undrafted player pool | Custom filtering logic | `buildFgPlayerPool()` from `archetype.ts` | Already handles normalized names and $0 exclusion |
| Roto scoring math | Custom rank-points table | Standard N-rank-minus-idx formula (inline) | 3 lines of code; no library needed |

**Key insight:** The standing calculation data pipeline already exists in `archetype.ts` and
`league-analysis.ts`. Phase 25 is mostly assembly work — combining existing pieces with new
glue logic, not net-new algorithmic work.

---

## Common Pitfalls

### Pitfall 1: Rate Stats Distorted by Small Sample Filler
**What goes wrong:** A team with 3 drafted pitchers + 6 replacement-level fillers computes
an ERA by combining components across all 9. If filler ERA components are uniform (replacement
ER/IP), the rate is stable. But if any filler IP is 0 (e.g. player was excluded for $0), the
denominator is too small and ERA explodes or returns NaN.
**Why it happens:** The WHIP/ERA formulas divide by IP. Replacement-level filler with 0 IP
passes through as a no-op when computing components, but the formula itself doesn't guard
against zero denominators.
**How to avoid:** When adding replacement-level filler, ensure filler pitcher always has IP > 0.
Use the replacement-level pitcher's median stats, which will have positive IP. Add a guard:
`if (combinedComponents.IP <= 0) catTotal = 0` before calling `calculateFinalRate`.
**Warning signs:** NaN or Infinity in category totals; ERA ranks showing weird inversions.

### Pitfall 2: Minimum Teams Guard Not Matching league-analysis.ts
**What goes wrong:** `computeLeagueAnalysis` returns early when `teamsAnalyzed < 2`. If
`computeProjectedStandings` uses a different threshold (e.g. 3), the planner may pass a signal
where `leagueAnalysis.teamsAnalyzed = 2` but `projectedStandings = null` — confusing state.
**How to avoid:** Use `teamsAnalyzed < 3` as the minimum threshold for projected standings
(stricter than league analysis since rate stats need more data), and document the difference.

### Pitfall 3: draftProgressWeight on Existing categoryRankings
**What goes wrong:** The planner might try to apply `draftProgressWeight` to the EXISTING
`categoryRankings` in `LeagueAnalysisSignal`. Those rankings are already used for the
"League Analysis" UI section without a weight. Adding weight there breaks the existing display.
**How to avoid:** `draftProgressWeight` lives only in the NEW `ProjectedStandingsSignal`.
The existing `LeagueAnalysisSignal.categoryRankings` stays unchanged — it already shows
current drafted-player totals with a rank. The new signal shows PROJECTED full-season standings.

### Pitfall 4: 300ms Budget with 12-Team Standings
**What goes wrong:** Adding projected standings to the existing engine pipeline (which already
runs in 150–250ms for a typical mid-draft state) could push total time over 300ms.
**Profiling baseline:** `computeLeagueAnalysis` for 12 teams with ~10 players each takes
approximately 5–15ms (simple iteration, no recursion). The new filler computation adds one
pass over undrafted players to compute medians, then one pass over team totals to add filler.
Estimated total for `computeProjectedStandings`: 10–25ms additional.
**How to avoid:** Cache the replacement-level stats between picks (they only change when
a new player is drafted, same invalidation condition as `sgpCacheKey`). Use the existing
`allPicks.length` cache invalidation pattern from `index.ts` lines 143–151.

### Pitfall 5: Confusing "Current" vs "Projected" Totals in UI
**What goes wrong:** The League Analysis section already shows "current drafted player totals"
with rankings. Adding "projected full-season totals" to the same UI section creates ambiguity
about what each number means.
**How to avoid:** Give the new section a distinct label "Projected Standings" vs the existing
"League Analysis". Add a confidence badge (based on `draftProgressWeight`) to the Projected
Standings section header so users understand early-draft projections are low-confidence.

### Pitfall 6: teamRosters.size vs teamRosters Map Reference in useMemo
**What goes wrong:** `use-draft-engine.ts` uses `teamRosters.size` in the dependency array
(not the Map itself) to avoid spurious re-renders. Projected standings depends on the same
`teamRosters` Map. If the computation is added as a separate memo, it must use the same
`teamRosters.size` dependency pattern.
**How to avoid:** Add projected standings computation inside the EXISTING `computeDraftEngine`
call in `engine/index.ts` — not in a separate `useMemo`. The orchestrator already handles
all signals in one pass.

---

## Code Examples

Verified patterns from existing codebase:

### How league-analysis.ts builds team totals (already exists, Phase 25 extends this)
```typescript
// Source: packages/extension/lib/engine/league-analysis.ts lines 70-158
// team totals: teamId -> category stat_key -> total
const teamTotals = new Map<string, Record<string, number>>();
for (const [teamId] of teamRosters) {
  const picks = picksByTeam.get(teamId) ?? [];
  // ... match to FG projections, compute per-category ...
  teamTotals.set(teamId, catTotals);
}
```

### How archetype.ts computes replacement-level via greedy fill (expensive, don't use for all teams)
```typescript
// Source: packages/extension/lib/engine/archetype.ts lines 152-252
// positionAwareGreedyFill — fills hitter + pitcher slots from budget
// EXPENSIVE: O(n_players * n_slots). Use only for user's own team.
// For opponents, use replacement-level median filler instead.
```

### Engine cache invalidation pattern (reuse for projected standings cache)
```typescript
// Source: packages/extension/lib/engine/index.ts lines 143-151
if (sgpCacheKey !== input.allPicks.length || cachedSGPVectors === null) {
  cachedSGPVectors = buildSGPVectors(...);
  sgpCacheKey = input.allPicks.length;
}
// Same pattern: cache projected standings result, invalidate on allPicks.length change
```

### How to pass weak categories into top-target sorting (mirror existing pattern)
```typescript
// Source: packages/extension/lib/engine/index.ts lines 292-299
// Existing: position-need boost
const maxNeed = p.positions.reduce((max, pos) => {
  return Math.max(max, needByPosition[pos.toUpperCase()] ?? 0);
}, 0);
const adjustedSgp = sgp * (1 + maxNeed * 0.5);
// New (Phase 25): add category-weakness boost as additional multiplier
```

### Rate stat calculation (already in use, apply to filler components)
```typescript
// Source: @espn-fantasy/shared calculateFinalRate
// Components example for ERA: { IP: 162, ER: 72 } → ERA = 9 * 72 / 162 = 4.00
const rate = calculateFinalRate(cat.formula_id, {}, combinedComponents);
if (!isFinite(rate)) catTotal = 0;
```

### Projected standings signal type to add to types.ts
```typescript
// New type — add to packages/extension/lib/engine/types.ts
export interface ProjectedTeamStanding {
  teamId: string;
  teamName: string;
  projectedRotoPts: number;        // Sum of category rank points (N, N-1, ..., 1)
  projectedOverallRank: number;    // 1 = best
  categoryRanks: Record<string, number>;  // stat_key -> rank (1-based)
  draftedPlayersCount: number;     // How many players this team has drafted
}

export interface ProjectedStandingsSignal {
  standings: ProjectedTeamStanding[];  // All teams, sorted by projectedRotoPts desc
  myTeamRank: number;                  // User's projected overall rank (0 if unknown)
  myWeakCategories: string[];          // stat_keys where user ranks bottom 4
  myStrongCategories: string[];        // stat_keys where user ranks top 3
  draftProgressWeight: number;         // 0.0-1.0 confidence weight
  totalTeamCount: number;
  teamsWithData: number;               // Teams with >= 1 FG-matched player
  computeTimeMs: number;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No standings projection in draft tools | FanGraphs Auction Calculator provides per-player projections, not team standings | N/A | Users must manually aggregate |
| Full greedy fill per team (archetype.ts) | Replacement-level median filler for opponents | Phase 25 | 12x speedup for multi-team standings |
| No draft-progress confidence | Piecewise linear weight curve | Phase 25 | Avoids misleading early-draft "standings" |

**Deprecated/outdated:**
- The current `TeamCategoryRanking` type in `LeagueAnalysisSignal` shows CURRENT totals only. Phase 25 adds a separate `ProjectedTeamStanding` type for full-season projections. The existing type stays unchanged.

---

## Open Questions

1. **Whether to expose teamDraftedTotals from computeLeagueAnalysis**
   - What we know: `computeLeagueAnalysis` computes `teamTotals` internally but doesn't return it
   - What's unclear: Does refactoring the return type to expose `teamTotals` create any
     downstream API contract issues for consumers of `LeagueAnalysisSignal`?
   - Recommendation: Return `teamDraftedTotals` as an optional field on `LeagueAnalysisSignal`
     (add to the existing interface, don't break existing callers). `EngineInsights.tsx`
     doesn't use it. Only `computeProjectedStandings` in `index.ts` needs it.

2. **Rate stat filler approach for teams with 0 pitchers drafted**
   - What we know: Teams early in the draft may have 0 pitchers. Computing ERA/WHIP requires
     IP > 0 in the denominator.
   - What's unclear: Should we exclude rate stat categories for teams with 0 relevant drafted
     players, or use pure replacement-level (all filler, no real players)?
   - Recommendation: Use pure replacement-level for rate stats when a team has 0 matching
     drafted players — this is stable and consistent. Mark these teams as having "low data"
     in `draftedPlayersCount = 0` so the UI can show a data-quality indicator.

3. **Whether weak-category boost should influence top-targets or only show in UI**
   - What we know: The user mentioned "incorporate those to guide recommendations"
   - What's unclear: Should the boost apply to `topTargets` SGP sorting (changes bid advice)
     or only appear as a UI observation in the Projected Standings panel?
   - Recommendation: Apply a soft boost (30% per weak category) to `adjustedSgp` in
     `computeRosterOptimization`. This is the same pattern as the existing positional-need
     boost. Keep it lightweight — if the category-boost total exceeds 2x the base SGP, cap at 2x
     to avoid completely overriding SGP-based ordering.

---

## Sources

### Primary (HIGH confidence)
- `packages/extension/lib/engine/league-analysis.ts` — per-team category totals logic, existing pattern to extend
- `packages/extension/lib/engine/archetype.ts` — greedy fill (performance baseline), `buildFgPlayerPool`, `normalizeName`
- `packages/extension/lib/engine/index.ts` — orchestrator, SGP cache pattern, 300ms budget enforcement, step 5b hook point
- `packages/extension/lib/engine/types.ts` — all existing signal type contracts
- `packages/extension/lib/use-draft-engine.ts` — `teamRosters.size` dependency pattern, memo invalidation
- `packages/extension/components/EngineInsights.tsx` — existing League Analysis UI section to extend
- `packages/extension/lib/narrator-types.ts` + `use-narrator.ts` — narrator payload extension pattern

### Secondary (MEDIUM confidence)
- Standard roto scoring formula (numTeams - rank + 1 per category) — industry standard, used in all major fantasy platforms
- Piecewise linear confidence curve — derived from user intent "half drafted = useful"; consistent with domain expertise for auction drafts (typically 23 roster spots, 12 teams = 276 total picks; half = ~138 picks)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing code, no new dependencies
- Architecture: HIGH — clear extension of existing league-analysis.ts pattern; cache and performance patterns already proven in index.ts
- Pitfalls: HIGH — identified from direct code inspection of the existing engine (rate stat guards, cache pattern, 300ms budget, existing memo dependencies)
- Draft-progress curve breakpoints: MEDIUM — derived from user intent ("half drafted") plus domain reasoning; exact thresholds (30%, 50%, 70%) should be adjustable constants

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable TypeScript codebase — no external dependencies to go stale)
