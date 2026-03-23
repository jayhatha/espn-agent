# Phase 69: Trade Finder - Research

**Researched:** 2026-03-23
**Domain:** Roto-point-framed trade analysis with automatic 1-for-1 finder
**Confidence:** HIGH

## Summary

Phase 69 upgrades the existing trade analysis system to use the same roto-point math proven in Phase 67's waiver analysis, then builds an automatic trade finder that scans all 12 opponent rosters for beneficial 1-for-1 swaps.

The backend already has a `TradeRecommendationAgent` with `analyzeTradeImpact()` and `generateTradeCandidates()` methods that handle counting stats correctly. The primary gap is that rate stat adjustments use `calculateFinalRate()` but the trade simulation (`simulateTradeImpact()`) has a subtle bug: it JSON-parses `stat_components_json` even though Kysely may already return it as an object (same pattern was fixed in Phase 67's waiver agent). The frontend trades page already has a trade builder with partner selection, roster display, and category impact table — it just needs the roto-point delta framing and the automatic finder UI upgrade.

**Primary recommendation:** Refactor `TradeRecommendationAgent.simulateTradeImpact()` to use the same component-math pattern proven in `WaiverRecommendationAgent.simulateSwap()`, then upgrade the frontend to show roto-point delta prominently and surface the automatic finder as a first-class feature.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRADE-01 | Trade impact shows net roto point delta (same treatment as waiver analysis) | Existing `analyzeTradeImpact()` already computes delta — needs to match waiver's proven `simulateSwap()` math exactly |
| TRADE-02 | Per-category breakdown for proposed trades | Already implemented in `CategoryImpact[]` return type — frontend already renders it |
| TRADE-03 | Automatic trade finder scans all teams for roto-point-positive 1-for-1 swaps | `generateTradeCandidates()` already does this — needs rate stat fix + frontend upgrade |
| TRADE-04 | Trade finder results ranked by net roto points gained | Already sorted by `deltaOverallPoints` — confirmed in code |
| TRADE-05 | Rate stat adjustments use component math | `simulateTradeImpact()` calls `calculateFinalRate()` but has JSON.parse inconsistency — fix to match waiver pattern |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Kysely | current | Type-safe SQL queries for trade simulation | Already used in all agents |
| calculateFinalRate | shared/formulas.ts | Component-based rate stat math | Proven in Phase 67 waiver analysis |
| TanStack Query v5 | current | Frontend data fetching for trade finder | Already used on trades page |
| @tanstack/react-table | planned | Sortable trade finder results table | Mentioned in v6.0 roadmap decisions |

### No New Dependencies
No new packages needed. All trade finder functionality builds on existing infrastructure.

## Architecture Patterns

### Pattern 1: Waiver-Consistent Simulation Math
**What:** Trade simulation must use identical math to waiver simulation
**When to use:** All trade impact calculations

The proven pattern from `WaiverRecommendationAgent.simulateSwap()`:
1. Get team's projected category values + components from `team_daily_projected_category`
2. Get all teams' projected values for re-ranking
3. For counting stats: `newValue = currentProjected + addComponents[stat] - dropComponents[stat]`
4. For rate stats: Rebuild components by subtracting give-player and adding receive-player, then `calculateFinalRate(formula_id, {}, adjustedComponents)`
5. Re-rank all teams per category to get new roto points
6. Sum roto points across categories for overall delta

**Key difference from current trade agent:** The waiver agent uses `projected_components_json` directly from the DB row (already parsed by Kysely). The trade agent's `simulateTradeImpact()` calls `JSON.parse(proj.stat_components_json)` which may double-parse if Kysely already returns an object. Must align with the waiver pattern.

### Pattern 2: Category Impact with Roto Points
**What:** Every trade impact result must include per-category roto point change, not just rank change
**How:** `deltaPoints = (numTeams - newRank + 1) - (numTeams - oldRank + 1)`

### Pattern 3: Batter/Pitcher Category Filtering
**What:** Only apply batter projections to batting categories and pitcher projections to pitching categories
**How:** Use `PITCHING_STAT_KEYS` set + `isPitcherProjection()` helper (already shared across agents)

### Anti-Patterns to Avoid
- **Averaging rates directly:** Never compute `newERA = (teamERA + playerERA) / 2`. Always use component math via `calculateFinalRate()`
- **Double JSON parsing:** Don't `JSON.parse()` values that Kysely has already parsed from JSONB columns
- **Separate rank computation:** Don't compute ranks independently from the ranking done in standings — use the same `numTeams - rank + 1` formula

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate stat calculation | Custom ERA/WHIP formula | `calculateFinalRate()` from shared/formulas.ts | Handles edge cases (0 IP, etc.) |
| Component combination | Manual stat addition | `combineComponents()` from shared/formulas.ts | Handles undefined keys safely |
| Roto point calculation | Custom point system | `numTeams - rank + 1` (same as StandingsProjectionAgent) | Consistency across all agents |

## Common Pitfalls

### Pitfall 1: JSON.parse on Already-Parsed JSONB
**What goes wrong:** `stat_components_json` is a JSONB column. Kysely returns it as an object. Calling `JSON.parse()` on an object returns it unchanged, but if the DB returns a string, it throws on double-parse.
**Why it happens:** Inconsistency between how different query patterns return JSONB.
**How to avoid:** Cast with `as StatComponents` without JSON.parse, matching the waiver agent pattern.
**Warning signs:** "Unexpected token" errors in trade simulation.

### Pitfall 2: Category ID vs Stat Key Mismatch
**What goes wrong:** The trade agent uses `category.stat_key` as the map key for `teamCategoryValues`, but `team_daily_projected_category` uses `category_id`. These may differ.
**Why it happens:** ESPN category_id format (e.g., "0") differs from stat_key (e.g., "R").
**How to avoid:** Use `category_id` consistently as the map key (matching the waiver agent).
**Warning signs:** Categories not found in map, zero deltas for all categories.

### Pitfall 3: Missing Projection for Partner's Player
**What goes wrong:** Trade finder returns 0 delta for a trade because the partner's player has no projection row.
**Why it happens:** FanGraphs CSV didn't include the player, or name matching failed.
**How to avoid:** Skip pairs where either player lacks projections, log as degraded.
**Warning signs:** All trades showing near-zero impact.

## Code Examples

### Trade Simulation (aligned with waiver pattern)
```typescript
// From WaiverRecommendationAgent.simulateSwap() — proven pattern
const currentComponents = (currentProj.projected_components_json || {}) as StatComponents;
const withoutDrop: StatComponents = {};
for (const key of Object.keys(currentComponents)) {
  withoutDrop[key] = (currentComponents[key] || 0) - (dropComponents[key] || 0);
}
const withAdd: StatComponents = {};
const allKeys = new Set([...Object.keys(withoutDrop), ...Object.keys(addComponents)]);
for (const key of allKeys) {
  withAdd[key] = (withoutDrop[key] || 0) + (addComponents[key] || 0);
}
newValue = calculateFinalRate(category.formula_id, {}, withAdd);
```

### Re-ranking Pattern
```typescript
// Sort by direction, assign roto points
categoryValues.sort((a, b) => {
  if (category.direction === "HIGHER_BETTER") return b.value - a.value;
  return a.value - b.value;
});
const newRank = categoryValues.findIndex(v => v.teamId === teamId) + 1;
const oldPoints = numTeams - oldRank + 1;
const newPoints = numTeams - newRank + 1;
const deltaPoints = newPoints - oldPoints;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded 0.5 delta | Real simulation with re-ranking | Phase 67 | Waiver deltas now accurate |
| Counting stats only for trades | Component math for rate stats | Phase 69 (this phase) | Trade deltas will match waiver accuracy |

## Open Questions

1. **Performance of scanning all 12 teams x ~25 players each = 300+ simulations**
   - What we know: `generateTradeCandidates()` already has optimizations (value pre-filtering, max 500 simulations, top 20 per team)
   - What's unclear: Whether real-world performance is acceptable with rate stat math added
   - Recommendation: Keep existing optimizations, monitor query time, add timing logs

## Sources

### Primary (HIGH confidence)
- `packages/backend/src/agents/trade-recommendation.ts` — existing trade agent code (1205 lines)
- `packages/backend/src/agents/waiver-recommendation.ts` — proven simulation pattern (619 lines)
- `packages/backend/src/agents/standings-projection.ts` — ranking and roto point calculation
- `packages/shared/src/formulas.ts` — `calculateFinalRate()`, `combineComponents()`
- `packages/frontend/src/app/leagues/[id]/trades/page.tsx` — existing trades UI (878 lines)
- `.planning/phases/67-net-waiver-analysis-category-opportunity/67-VERIFICATION.md` — Phase 67 verification confirming waiver math works

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools already in project, no new dependencies
- Architecture: HIGH — proven pattern from Phase 67 waiver agent, just needs alignment
- Pitfalls: HIGH — identified from direct code inspection of existing agent

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable codebase, no external dependencies changing)
