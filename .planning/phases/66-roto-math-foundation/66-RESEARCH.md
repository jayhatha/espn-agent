# Phase 66: Roto Math Foundation - Research

**Researched:** 2026-03-23
**Domain:** Roto standings computation, marginal gain analysis, interactive data visualization
**Confidence:** HIGH

## Summary

Phase 66 builds the core roto math engine and its visual presentation layer. The backend already has `StandingsProjectionAgent` which computes projected category values, ranks them, and assigns roto points (numTeams - rank + 1) per category, storing results in `team_daily_projected_category` and `team_daily_projected_overall`. The existing `/api/leagues/:id/standings/projected` endpoint already returns both current and projected standings with category-level detail. The frontend `standings/page.tsx` already renders current and projected standings tables with category breakdowns.

This phase needs to: (1) enhance the standings table with change-since-last-snapshot data (ROTO-01), (2) verify the roto points are truly rank-based (ROTO-02 -- already implemented in backend), (3) add historical category curves as fallback (ROTO-03), (4) build a marginal gain engine as a pure function in `shared/formulas.ts` (ROTO-05), (5) add category pace bars (ROTO-07), and (6) add hover-to-inspect gap detail (ROTO-08).

The marginal gain engine is the most technically interesting piece. It must answer: "For each category, what stat improvement would gain me one roto point?" This requires comparing your team's projected value against the team immediately above you in that category's ranking, computing the delta. This is a pure computation over the projected standings data already available from the API.

**Primary recommendation:** Build `interpolateRotoPoints()` and `computeMarginalGains()` as pure functions in `shared/formulas.ts`, compute change-from-previous-snapshot server-side via a new API field, and use Recharts + Tailwind progress bars for visualization.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ROTO-01 | Projected standings table shows all 13 teams with current points, projected points, and change | Existing `standings/projected` endpoint returns both current and projected data. Need to add `previous_snapshot_date` comparison for delta. Backend already stores daily snapshots. |
| ROTO-02 | Roto points computed from live standings (rank projected totals against all teams) | Already implemented in `StandingsProjectionAgent.rankAndStore()` -- ranks by category value, assigns `numTeams - rank + 1` points. No changes needed to ranking logic. |
| ROTO-03 | Historical category curves used as fallback when live standings unavailable | Existing `/timeseries/category-rank` and `/timeseries/category-total` endpoints provide historical data. `CategoryMiniChart` component already renders rank-over-time with Recharts. |
| ROTO-05 | Marginal gain engine computes cheapest path to next roto point per category | Pure function in `shared/formulas.ts`. Needs projected standings data (all teams' projected values per category). Compute gap to team above in each category. |
| ROTO-07 | Category pace bars show current vs target with progress visualization | Use Tailwind CSS for progress bars (div-based, not Recharts). Current value from `team_daily_category_totals`, target from `team_daily_projected_category`. |
| ROTO-08 | Hover on category row shows teams above/below and exact stat gaps | Existing Tooltip component is CSS-based hover. Need a more capable disclosure pattern (click/hover to expand row) showing neighboring teams. Data already in projected standings response. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x | Pure function implementation | Already in monorepo |
| Recharts | ^2.10.4 | Historical category curves (ROTO-03) | Already installed and used in trends page |
| Tailwind CSS | 3.x | Pace bars, progress indicators | Already in stack, CSS-only progress bars are simpler than chart libraries |
| TanStack Query v5 | ^5.17.19 | Data fetching for standings | Already used throughout frontend |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shared/formulas.ts | N/A | `interpolateRotoPoints()`, `computeMarginalGains()` | Core computation -- pure functions, no DB |
| Recharts Tooltip | ^2.10.4 | Interactive chart tooltips | For historical curve hover states |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tailwind progress bars | Recharts BarChart | Tailwind is simpler for static progress, no library overhead |
| CSS hover expand | Radix Accordion | Radix would add dependency; CSS/state toggle is sufficient for row expand |

**Installation:**
No new packages needed. Everything is already in the stack.

## Architecture Patterns

### Recommended Project Structure
```
packages/
  shared/src/
    formulas.ts          # ADD: interpolateRotoPoints(), computeMarginalGains()
  backend/src/
    api/timeseries.ts    # MODIFY: add delta-from-previous to standings/projected
  frontend/src/
    app/leagues/[id]/standings/
      page.tsx           # MODIFY: add pace bars, hover expand, change indicators
    components/league/
      CategoryPaceBar.tsx     # NEW: progress bar component
      MarginalGainCard.tsx    # NEW: cheapest-path-to-point display
      GapDetailPopover.tsx    # NEW: hover/click expand for gap info
      CategoryFallbackChart.tsx  # NEW or reuse CategoryMiniChart
```

### Pattern 1: Pure Roto Math Functions
**What:** All roto computation lives in `shared/formulas.ts` as pure functions with no DB dependency.
**When to use:** Any time roto points or marginal gains are calculated.
**Example:**
```typescript
// In shared/formulas.ts

interface TeamCategoryProjection {
  teamId: number;
  teamName: string;
  value: number;
}

interface MarginalGain {
  categoryId: string;
  categoryName: string;
  currentRank: number;
  currentRotoPoints: number;
  teamAbove: { teamId: number; teamName: string; value: number } | null;
  gap: number;              // absolute stat gap to next rank
  potentialPointsGain: number; // always 1 (one rank improvement = 1 roto point)
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
}

/**
 * Compute roto points from raw projected values.
 * Pure function -- no DB access.
 */
export function interpolateRotoPoints(
  teamProjections: TeamCategoryProjection[],
  direction: "HIGHER_BETTER" | "LOWER_BETTER",
): Array<{ teamId: number; rank: number; rotoPoints: number }> {
  const sorted = [...teamProjections].sort((a, b) =>
    direction === "HIGHER_BETTER" ? b.value - a.value : a.value - b.value
  );
  const numTeams = sorted.length;
  return sorted.map((tp, i) => ({
    teamId: tp.teamId,
    rank: i + 1,
    rotoPoints: numTeams - i,
  }));
}

/**
 * Compute marginal gains for a specific team across all categories.
 * Returns the stat improvement needed to gain 1 roto point per category,
 * sorted by "cheapest" (smallest gap).
 */
export function computeMarginalGains(
  myTeamId: number,
  allTeamProjections: Map<string, TeamCategoryProjection[]>,
  categories: Array<{
    category_id: string;
    name: string;
    direction: "HIGHER_BETTER" | "LOWER_BETTER";
  }>,
): MarginalGain[] {
  // For each category, rank all teams, find my position,
  // find the team immediately above, compute the gap
}
```

### Pattern 2: Server-Side Delta Computation
**What:** Compute point-change-since-last-snapshot on the backend, not frontend.
**When to use:** For ROTO-01's "change" column.
**Example:**
```typescript
// In api/timeseries.ts, enhance standings/projected endpoint
// Fetch previous snapshot's projected_overall standings
// Return delta alongside current data

// Response shape addition:
{
  overallStandings: [{
    ...existing,
    previousProjectedPoints: number | null,
    pointsDelta: number | null,  // current - previous
  }]
}
```

### Pattern 3: Expandable Table Row for Gap Detail
**What:** Click/hover on a category row expands it to show teams above and below with exact stat gaps.
**When to use:** ROTO-08 requirement.
**Example:**
```typescript
// Use React state to track expanded row
const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

// In table row onClick/onMouseEnter:
// Show sub-rows with team above and team below data
// Data is already available from the standings API response
```

### Pattern 4: Category Pace Bar
**What:** Horizontal progress bar showing current value vs projected end-of-season value.
**When to use:** ROTO-07 requirement.
**Example:**
```tsx
// Pure Tailwind CSS progress bar
function CategoryPaceBar({
  current,
  projected,
  label,
  isOnPace,
}: {
  current: number;
  projected: number;
  label: string;
  isOnPace: boolean;
}) {
  // Calculate season progress (roughly days elapsed / total season days)
  const progress = projected > 0 ? (current / projected) * 100 : 0;
  const barColor = isOnPace ? "bg-positive" : "bg-warning";

  return (
    <div className="flex items-center gap-3">
      <span className="text-body-sm w-16 text-right">{label}</span>
      <div className="flex-1 bg-neutral-200 dark:bg-shell-border rounded-full h-2.5">
        <div
          className={`${barColor} h-2.5 rounded-full transition-all`}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <span className="text-data w-20 text-right">
        {current} / {projected}
      </span>
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Averaging roto points across snapshots:** Roto points must always be freshly computed from rankings, never averaged.
- **Client-side re-ranking:** The backend already ranks correctly with tie handling. Don't re-rank on the frontend; use backend-provided ranks.
- **Fetching all historical data for pace calculation:** Use only current snapshot + projected values. Don't query the entire time series for pace bars.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Roto point calculation | Custom ranking algorithm | `interpolateRotoPoints()` pure function, mirroring backend `rankAndStore` | Must be consistent with backend logic |
| Historical category curves | Custom SVG chart | `Recharts LineChart` via existing `CategoryMiniChart` pattern | Already proven in trends page |
| Progress bar visualization | Canvas/SVG drawing | Tailwind CSS div-based bars | Simpler, accessible, theme-consistent |
| Stat formatting | Inline formatting logic | Existing `formatStatValue()` from `CategoryStatsTable` | Already handles RATE vs COUNTING |
| Rank color coding | Inline color logic | Existing `getRankColor()` from `CategoryStatsTable` | Already handles quartile-based colors |

**Key insight:** The backend already does 90% of the computation. This phase is primarily about presenting existing data in new ways (pace bars, marginal gains, gap detail) and adding one new pure function (`computeMarginalGains`).

## Common Pitfalls

### Pitfall 1: Rate Stat Gaps Are Not Additive
**What goes wrong:** Treating ERA gap of 0.15 as "add 0.15 fewer ER" -- rate stats depend on IP.
**Why it happens:** Marginal gain for counting stats is simple (need X more HR), but rate stats require component math.
**How to avoid:** For rate stats, express the gap as the raw value difference (e.g., "your ERA is 3.45, team above is 3.30, gap = 0.15 ERA"). Don't try to convert to component deltas in the marginal gain engine -- that's a Phase 67 concern.
**Warning signs:** If the marginal gain card shows "need -2.3 ER" for ERA improvement, the math is wrong.

### Pitfall 2: Direction-Sensitive Sorting
**What goes wrong:** Sorting ERA ascending when it should be ascending (lower is better) but then assigning rank 1 to highest.
**Why it happens:** Confusing "better" with "higher number."
**How to avoid:** Always use the category's `direction` field. `LOWER_BETTER` means rank 1 = lowest value. Backend already handles this correctly in `rankAndStore`.
**Warning signs:** ERA rank 1 going to the team with the highest ERA.

### Pitfall 3: Missing Previous Snapshot for Delta
**What goes wrong:** First snapshot of the season has no "previous" to diff against, causing null reference errors.
**Why it happens:** Edge case when there's only one snapshot.
**How to avoid:** Return `null` for delta when no previous snapshot exists. Frontend shows "--" or hides the change column.
**Warning signs:** Crash on league pages with only one snapshot taken.

### Pitfall 4: Pace Bar Season Progress Assumption
**What goes wrong:** Pace bar assumes linear season progress, but the MLB season isn't evenly distributed.
**Why it happens:** Using (days_elapsed / total_days) as progress ratio.
**How to avoid:** For counting stats, use `current / projected_final` as the progress ratio -- this already accounts for pace. For rate stats, the "pace" is the rate itself vs projected rate, not a progress bar.
**Warning signs:** Pace bars showing 50% progress on day 1 because projected values are small.

### Pitfall 5: Stale Projected Data Masking as Live
**What goes wrong:** Showing "projected standings" when projections are weeks old.
**Why it happens:** `projections_run.staleness` not checked before display.
**How to avoid:** Check `is_degraded` and `degraded_reasons` on the snapshot. Show a warning banner when projections are stale. Use historical curves as fallback (ROTO-03).
**Warning signs:** Projected standings showing wildly different numbers from current standings late in season.

## Code Examples

### Existing Rank-Based Roto Points (Backend Reference)
```typescript
// Source: packages/backend/src/agents/standings-projection.ts lines 270-280
// This is the authoritative roto point calculation
const rank = i + 1;
const rotoPoints = numTeams - rank + 1;
// Rank 1 gets numTeams points, rank 2 gets numTeams-1, etc.
```

### Existing Standings API Response Shape
```typescript
// Source: packages/backend/src/api/timeseries.ts lines 376-393
// GET /api/leagues/:id/standings/projected returns:
{
  snapshotDate: string,
  categories: Category[],
  categoryStandings: Array<{
    league_id: number,
    snapshot_date: string,
    team_id: number,
    category_id: string,
    projected_value: number,
    projected_rank: number,
    projected_roto_points: number | null,
    teamName: string,
    projected_components_json?: StatComponents,
  }>,
  overallStandings: Array<{
    team_id: number,
    projected_overall_points: number,
    projected_overall_rank: number,
    teamName: string,
  }>,
  currentCategoryStandings: Array<{...}>,
  currentOverallStandings: Array<{...}>,
}
```

### Existing Recharts Usage Pattern
```typescript
// Source: packages/frontend/src/components/league/CategoryMiniChart.tsx
// Pattern for line charts with Recharts:
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_THEME } from "@/lib/chart-theme";
// Use CHART_THEME for consistent styling
// ResponsiveContainer wraps all charts
```

### Existing Stat Formatting
```typescript
// Source: packages/frontend/src/components/league/CategoryStatsTable.tsx
import { formatStatValue, getRankColor } from "@/components/league/CategoryStatsTable";
// formatStatValue(value, type, statKey) -- handles RATE (3 decimals) vs COUNTING (rounded)
// getRankColor(rank, total) -- returns Tailwind classes for quartile-based coloring
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Standings as flat table | Category breakdown matrix | Phase 3 | Already have rich standings display |
| No projections | Full projected standings | Phase 3 | Backend already ranks and projects |
| No dark mode | Shell-based dark mode | Phase 65 | All new components must use dark: classes |

**Deprecated/outdated:**
- Direct `localhost:3001` fetching is replaced by `api.ts` client in most pages (some legacy remains)

## Open Questions

1. **Tie-Breaking in Rankings**
   - What we know: Backend uses simple sort (no explicit tie-breaking). Two teams with identical projected values get different ranks based on array position.
   - What's unclear: Should ties share the same rank and roto points? (e.g., two teams tied for 3rd both get 11 points in a 13-team league)
   - Recommendation: Keep current behavior for Phase 66 (simple sequential ranking). Tie-breaking is a refinement for later.

2. **Marginal Gain for Rate Stats**
   - What we know: For counting stats, the gap is straightforward (need X more HR). For rate stats, the gap is a rate differential.
   - What's unclear: Should we express rate stat gaps in terms of component changes (e.g., "need 5 fewer ER in remaining 100 IP")?
   - Recommendation: Phase 66 shows the raw rate gap. Phase 67's "category opportunity map" can add component-level guidance.

3. **"Target" for Pace Bars**
   - What we know: ROTO-07 says "current vs target with progress."
   - What's unclear: Is "target" the projected final value, or a user-set goal?
   - Recommendation: Use projected final value as the target. This is automatically available from the standings data.

## Sources

### Primary (HIGH confidence)
- `packages/backend/src/agents/standings-projection.ts` -- Authoritative roto ranking logic
- `packages/backend/src/api/timeseries.ts` -- Existing standings API endpoint
- `packages/frontend/src/app/leagues/[id]/standings/page.tsx` -- Current standings UI
- `packages/shared/src/formulas.ts` -- Existing rate stat and SGP functions
- `packages/shared/src/types.ts` -- Category, TeamDailyProjectedCategory types

### Secondary (MEDIUM confidence)
- `packages/frontend/src/components/league/CategoryMiniChart.tsx` -- Recharts pattern reference
- `packages/frontend/src/lib/chart-theme.ts` -- Chart styling tokens

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, everything already in the monorepo
- Architecture: HIGH -- extending existing patterns (standings API, category tables, Recharts)
- Pitfalls: HIGH -- well-understood domain (roto math is deterministic, edge cases are known)
- Marginal gain engine: MEDIUM -- algorithm is clear but rate stat presentation needs judgment calls

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable domain, no external dependency changes expected)
