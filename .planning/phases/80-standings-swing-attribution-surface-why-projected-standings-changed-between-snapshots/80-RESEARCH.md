# Phase 80: Standings Swing Attribution - Research

**Researched:** 2026-03-31
**Domain:** Fantasy baseball projected standings delta analysis, attribution engine, snapshot-over-snapshot diffing
**Confidence:** HIGH

## Summary

Phase 79 delivered a sophisticated projection model producing high-quality per-team projected standings stored in `team_daily_projected_category` and `team_daily_projected_overall`. Each snapshot now carries allocation-aware projections with confidence intervals. Phase 80 answers the natural follow-on question: **when a team's projected roto points change between yesterday's snapshot and today's, why did that happen?**

Three distinct causal buckets drive projected standings swings: (1) **actual performance** — the team's counted-stat YTD totals changed (team played games, accumulating HR, IP, etc.); (2) **projection changes** — FanGraphs RoS projections uploaded with a new `projections_run_id` changed individual player forecasts; (3) **competitor movement** — another team's performance or projection changed, shifting everyone's relative rank in a category even though this team's absolute value didn't change. Without attribution, a manager seeing "+1.5 roto points today" has no idea whether to take action or simply accept it as background noise.

The research confirms that all data required for attribution already exists in the DB. The delta between consecutive `team_daily_projected_category` rows isolates the total projected category value change per team. The delta between consecutive `team_daily_category_totals` rows isolates the actual-performance contribution. The difference is the projection-change contribution. Competitor movement is detectable by comparing a team's rank change against its absolute value change: if the value held flat but rank improved, a competitor's value dropped. The plan must define an attribution API endpoint and a frontend summary panel on the standings page.

**Primary recommendation:** Implement `StandingsSwingAttributionAgent` as a pure-query computation class (no new DB tables required) with a new API endpoint `GET /api/leagues/:id/standings/swing`. Surface the output as an expandable "What Changed?" panel on the Projected Standings page, anchored to the selected team.

## Project Constraints (from CLAUDE.md)

- **Backend:** Fastify 4, TypeScript, Kysely (PostgreSQL) — no new ORM or DB connection approach
- **Agent pattern:** Isolated class accepting Kysely `db` + optional Pino `logger`, single responsibility, mark outputs as degraded when data incomplete — never fabricate data
- **Rate stats:** Always use component-based math from `packages/shared/src/formulas.ts` — never average rates directly
- **Empty array guard:** Always check `array.length > 0` before using `.where("col", "in", array)` with Kysely
- **Projections are global:** `projections_run` and `player_projection` are shared across leagues — attribution must handle the case where the same run covers multiple days
- **Team selection:** Frontend stores selected team per league in `localStorage` key `league_${leagueId}_team`
- **Frontend patterns:** Next.js App Router, TanStack Query v5, Tailwind CSS dark mode (`dark:` prefix), semantic token classes (`text-positive`, `text-negative`, etc.), no raw green/red/amber — use semantic tokens
- **No new shared frontend components unless truly reusable** — inline helper functions preferred (per Phase 77 decision)

## Standard Stack

### Core (No new installs — all existing)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Kysely | existing | Multi-snapshot delta queries | Already the DB access pattern everywhere |
| shared/formulas.ts | existing | Rate stat recalculation for component deltas | Rate math must use component path |
| Fastify 4 | existing | New API route mounting | Existing server framework |
| TanStack Query v5 | existing | Frontend data fetching | Used everywhere in the app |

**No new npm packages required.** Attribution is pure computation over existing data.

## Architecture Patterns

### Recommended Module Structure
```
packages/backend/src/
  agents/
    standings-swing-attribution.ts   # New agent class
  api/
    timeseries.ts                    # Add new route here (fits thematically)

packages/frontend/src/
  app/leagues/[id]/standings/
    page.tsx                         # Add "What Changed?" panel (SwingAttributionPanel)
  components/league/
    SwingAttributionPanel.tsx        # New component (reusable across views)
```

### Data Model: What Exists

All required data is present without new migrations:

| Table | What It Provides |
|-------|-----------------|
| `team_daily_projected_category` | `projected_value` per team per category per snapshot_date |
| `team_daily_projected_overall` | `projected_overall_points` per team per snapshot_date |
| `team_daily_category_totals` | YTD actual category values per snapshot_date |
| `team_daily_category_ranks` | Current YTD ranks per snapshot_date |
| `player_projection` | Per-player stat_components_json per projections_run_id |
| `projections_run` | as_of_date + staleness per run — detects when a new CSV was uploaded |
| `team_roster_snapshot` | Which players were on each team per snapshot_date |
| `league_daily_snapshot` | `projections_run_id` — tells you which run each snapshot used |
| `player` | Player names for display |

**No new DB table is required.** Attribution is computed on-demand from existing rows.

### Pattern 1: Three-Bucket Attribution Model

**What:** Decompose a team's projected overall roto point delta into three causes.

**Algorithm:**
```typescript
// Source: Derived from existing timeseries.ts inflection-points pattern

interface SwingBucket {
  actual_performance: number;     // roto pts gained from YTD stats accumulating
  projection_change: number;      // roto pts gained from FanGraphs CSV update
  competitor_movement: number;    // roto pts gained from other teams' values changing
}

// For each category:
// prevProjected = team_daily_projected_category.projected_value at prevDate
// currProjected = team_daily_projected_category.projected_value at currDate
// prevActual    = team_daily_category_totals.value at prevDate
// currActual    = team_daily_category_totals.value at currDate
//
// actual_delta = currActual - prevActual
//   (the team played more games since yesterday)
//
// projected_delta = (currProjected - currActual) - (prevProjected - prevActual)
//   i.e., did the RoS remainder grow or shrink beyond what actual accumulation explains?
//   This isolates projection-change contribution.
//
// After computing absolute value deltas, re-rank all teams for prev/curr snapshots
// to translate absolute deltas → roto point deltas.
// The residual of (total roto point delta - actual_delta_pts - projection_delta_pts)
// is competitor movement.
```

### Pattern 2: Per-Player Driver Attribution

**What:** For projection-change bucket, surface the top 2-3 players whose projection changed most.

**How:**
1. Find the `projections_run_id` used by `prevSnapshot` and `currSnapshot` from `league_daily_snapshot`
2. If the run ID changed (new CSV uploaded), diff `player_projection` rows between the two run IDs for players on this team's roster at either snapshot
3. If the run ID is the same, there is no projection-change component — skip

**Key constraint:** The same projections run can span multiple days (one upload, many daily snapshots). Only when `projections_run_id` differs between snapshots does projection change contribute.

### Pattern 3: Significance Threshold

**What:** Only surface swings above a minimum threshold to avoid noise.

**Threshold:** 0.5 roto points absolute delta triggers "significant swing" labeling. Below this, the UI shows no attribution panel (or a minimal "no significant change" state).

This is consistent with the existing `deltaOverallPoints` pattern in WaiverRecommendationAgent.

### Pattern 4: Competitor Movement Attribution

**What:** If a team's projected category value was flat but its projected rank improved, a competitor's value fell. Name the competitor that moved the most.

**How:** Compare `team_daily_projected_category.projected_value` between the two snapshots for ALL teams in the category. The team with the largest absolute decrease (for HIGHER_BETTER) or increase (for LOWER_BETTER) near this team's rank band is the "competitor that moved."

### Anti-Patterns to Avoid

- **Cross-category totaling of absolute stat deltas:** Absolute HR delta and ERA delta are incommensurable. All attribution must be expressed in roto points, not raw stats.
- **Re-running allocateProjections during attribution:** Attribution reads existing DB results — it must NOT re-invoke the allocation pipeline. That would be O(N teams) DB work per attribution call.
- **Fabricating causes when data is sparse:** If `prevSnapshot` has no `team_daily_projected_category` rows (degraded), mark `attribution_available: false` and return the raw delta only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding prev snapshot | Custom date arithmetic | Kysely `where snapshot_date < currDate orderBy desc limit 1` | Already used in timeseries.ts for inflection points |
| Rate stat delta | Delta of rate values | Delta of components, recalculate rate | formulas.ts pattern — never average rates |
| Player name lookup | Inline JOIN | Same pattern as existing inflection-points endpoint | Already established pattern |
| Re-ranking for roto pts | Custom sort | Reuse `assignRanksWithTies` from `utils/roto-ranking.ts` | Already exported and used by StandingsProjectionAgent |

## Common Pitfalls

### Pitfall 1: Projections Run ID Comparison Across Leagues
**What goes wrong:** Projections are global (not league-scoped). A new CSV upload changes the `projections_run_id` on all leagues' next snapshot simultaneously. Attribution code must compare the `projections_run_id` from each league's own `league_daily_snapshot` rows — not assume a global "latest run."
**Why it happens:** The projections tables have no `league_id` foreign key. Developers may assume one league's run = another's.
**How to avoid:** Always join through `league_daily_snapshot.projections_run_id` to get the run ID for each specific league's snapshot.
**Warning signs:** Attribution shows "projection changed" for a team when only a different league's projections were updated.

### Pitfall 2: Same-Day Snapshot Diffing
**What goes wrong:** If `prevSnapshot` and `currSnapshot` are the same date (only one snapshot exists), the diff is zero across the board. This causes divide-by-zero or empty attribution.
**Why it happens:** The "previous snapshot" query returns null when there's only one snapshot for the league.
**How to avoid:** Add a guard: `if (!prevSnapshot) return { attribution_available: false, message: "Only one snapshot available" }`.

### Pitfall 3: Category Rank Direction for Attribution Sign
**What goes wrong:** For LOWER_BETTER categories (ERA, WHIP), a decrease in absolute value is good. If attribution labels a raw delta as "good" without checking category direction, ERA getting worse appears as a positive attribution.
**Why it happens:** All other attribution in the codebase works with COUNTING stats where higher = better.
**How to avoid:** Check `category.direction` before labeling any delta as positive or negative. Use `roto points gained` (not raw delta) as the universal attribution currency.

### Pitfall 4: Projected Value vs. Projected RoS-Only Remainder
**What goes wrong:** `team_daily_projected_category.projected_value` is the *final projected season total* (current YTD + allocated RoS projection). When actual performance accumulates, `projected_value` grows naturally even with zero projection change. Treating all of `projected_value` delta as projection change is wrong.
**Why it happens:** Confusing "projected final total" with "projected rest-of-season contribution."
**How to avoid:** The actual-performance contribution = `currActuals - prevActuals`. The projection-change contribution = `(currProjected - currActuals) - (prevProjected - prevActuals)`. Explicitly separate these in code.

### Pitfall 5: Player Projection Diff When Run IDs Are Equal
**What goes wrong:** When no new CSV was uploaded between snapshots (same `projections_run_id`), querying player_projection rows for both run IDs returns identical data. Diffing them produces all zeros, but the code may still label this "projection changed."
**Why it happens:** Assuming every snapshot pair has a projection diff.
**How to avoid:** Short-circuit: `if (prevRunId === currRunId) projectionChangeComponents = {} (all zeros)`.

## Code Examples

### Fetching Previous Snapshot for Delta
```typescript
// Source: timeseries.ts getProjectedStandings endpoint (lines 332-354)
const previousSnapshot = await db
  .selectFrom("league_daily_snapshot")
  .select("snapshot_date")
  .where("league_id", "=", leagueId)
  .where("snapshot_date", "<", targetDate)
  .orderBy("snapshot_date", "desc")
  .executeTakeFirst();
// Guard: if (!previousSnapshot) return attribution unavailable
```

### Fetching Per-Team Category Values for Two Snapshots in Parallel
```typescript
// Pattern: parallel Kysely queries for two dates
const [prevCatRows, currCatRows, prevActuals, currActuals] = await Promise.all([
  db.selectFrom("team_daily_projected_category")
    .selectAll()
    .where("league_id", "=", leagueId)
    .where("snapshot_date", "=", prevDate)
    .where("team_id", "=", teamId)
    .execute(),
  db.selectFrom("team_daily_projected_category")
    .selectAll()
    .where("league_id", "=", leagueId)
    .where("snapshot_date", "=", currDate)
    .where("team_id", "=", teamId)
    .execute(),
  db.selectFrom("team_daily_category_totals")
    .selectAll()
    .where("league_id", "=", leagueId)
    .where("snapshot_date", "=", prevDate)
    .where("team_id", "=", teamId)
    .execute(),
  db.selectFrom("team_daily_category_totals")
    .selectAll()
    .where("league_id", "=", leagueId)
    .where("snapshot_date", "=", currDate)
    .where("team_id", "=", teamId)
    .execute(),
]);
```

### Fetching projections_run_id From Snapshot
```typescript
// Source: standings-projection.ts computeProjectedStandings (line 63)
const snapshot = await db
  .selectFrom("league_daily_snapshot")
  .selectAll()
  .where("league_id", "=", leagueId)
  .where("snapshot_date", "=", snapshotDate)
  .executeTakeFirstOrThrow();
const runId = snapshot.projections_run_id; // null if no projections uploaded
```

### Re-ranking All Teams to Compute Roto Point Delta
```typescript
// Source: standings-projection.ts rankAndStore (lines 356-390)
import { assignRanksWithTies } from "../utils/roto-ranking.js";

const allTeamValues = allTeams.map((t) => ({
  teamId: t.team_id,
  value: projectedCatMap.get(t.team_id)?.projected_value ?? 0,
}));
const ranked = assignRanksWithTies(allTeamValues, allTeams.length);
// ranked[i].rotoPoints for this team's category roto points
```

### Frontend: Displaying Attribution Panel (Semantic Tokens)
```typescript
// Pattern: dark mode semantic tokens (Phase 72 decision)
<span className={delta > 0 ? "text-positive font-medium" : "text-negative font-medium"}>
  {delta > 0 ? "+" : ""}{delta.toFixed(1)}
</span>
// "text-positive" / "text-negative" — never "text-green-500" / "text-red-500"
```

## API Design

### New Endpoint
```
GET /api/leagues/:leagueId/standings/swing?teamId=:teamId&snapshotDate=:snapshotDate
```

**Response shape:**
```typescript
interface SwingAttributionResponse {
  snapshotDate: string;
  previousSnapshotDate: string | null;
  attribution_available: boolean; // false when only one snapshot exists
  teamId: number;
  teamName: string;
  totalDelta: number;             // overall roto pts: curr - prev
  buckets: {
    actual_performance: number;   // roto pts from YTD accumulation
    projection_change: number;    // roto pts from new FanGraphs upload
    competitor_movement: number;  // roto pts from competitors moving
  };
  categoryBreakdown: Array<{
    category_id: string;
    categoryName: string;
    prevProjectedValue: number;
    currProjectedValue: number;
    prevRotoPoints: number;
    currRotoPoints: number;
    rotoDelta: number;
    bucket: "actual_performance" | "projection_change" | "competitor_movement" | "mixed";
    topDriverPlayer?: string;     // player name when projection changed most here
    topCompetitorMoved?: string;  // competitor team name that moved into/out of this rank
  }>;
}
```

**Route location:** `timeseries.ts` — fits thematically with existing standings/delta endpoints.

## Frontend Integration

Phase 80 adds a "What Changed?" collapsible panel on the Projected Standings page, visible in the "Projected" tab when a team is selected. The panel:

1. Shows total delta (`+1.5 pts since yesterday`) with color coding
2. Shows three bucket bars: Actual Performance | Projection Change | Competitor Movement
3. Shows category breakdown: which categories gained/lost roto points and why
4. Only renders when `attribution_available: true` and `|totalDelta| >= 0.5`

**Location:** Below the "Change" column in the Projected Overall Standings card (existing `page.tsx`), or as a new collapsible card between "Overall Projected Standings" and "Projected Category Breakdown".

**Component:** `SwingAttributionPanel.tsx` in `packages/frontend/src/components/league/` — reusable if other pages need it later.

## Validation Architecture

Framework: Vitest ^1.1.1 (already installed in backend)
Config: `packages/backend/vitest.config.ts` (existing)
Quick run: `pnpm --filter backend test --run`
Full suite: `pnpm --filter backend test --run`

### Phase Requirements to Test Map
| Behavior | Test Type | File |
|----------|-----------|------|
| Three-bucket attribution sums to total delta (round-trip) | unit | `agents/__tests__/standings-swing-attribution.test.ts` |
| actual_performance = currActuals - prevActuals roto delta | unit | same |
| projection_change = 0 when same projections_run_id | unit | same |
| competitor_movement detected when absolute value flat, rank changes | unit | same |
| attribution_available = false when no previous snapshot | unit | same |
| LOWER_BETTER category (ERA) directions handled correctly | unit | same |

### Wave 0 Gaps
- [ ] `packages/backend/src/agents/__tests__/standings-swing-attribution.test.ts` — new test file, covers all above behaviors

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure computation over existing DB data and existing API patterns).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No attribution — manager sees delta number with no explanation | Three-bucket attribution with category breakdown and player drivers | Phase 80 | Actionable insight vs. unexplained number |
| inflection-points endpoint shows biggest historical rank changes | swing endpoint shows today's delta breakdown | Phase 80 | Daily "why?" vs. historical "when?" |

## Open Questions

1. **Granularity of "projection change" — whole run vs. per-player**
   - What we know: `player_projection` has per-player rows per `projections_run_id`; joining prev and curr run IDs for this team's roster players is straightforward.
   - What's unclear: How many players typically change between consecutive FanGraphs uploads? If it's all 600+ players, the per-player diff will always surface something, which may create noise.
   - Recommendation: Compute per-player deltas but only surface players whose projected category contribution changed by more than 5% of team total in that category. This prevents minor rounding noise from dominating the explanation.

2. **Mixed bucket when both actual and projection changed the same day**
   - What we know: Both `prevActuals != currActuals` AND `prevRunId != currRunId` can be true simultaneously.
   - What's unclear: Which bucket gets credit for rank improvement when both contributed?
   - Recommendation: Assign buckets sequentially: first attribute actual-performance roto delta, then compute what rank would have been with only actual-performance change, then attribute residual to projection-change, then residual to competitor-movement. Category-level `bucket` = "mixed" when both actual and projection contributed to the same category's rank change.

3. **Competitor movement naming**
   - What we know: We can query all teams' `team_daily_projected_category` rows for prev and curr dates to find which teams' absolute values moved most.
   - What's unclear: Is naming a specific competitor useful or does it add noise (many competitors move slightly)?
   - Recommendation: Only name the top competitor that moved AND whose movement directly caused a rank boundary crossing for the focal team. If no rank boundary was crossed by competitor movement, omit the competitor name.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `packages/backend/src/agents/standings-projection.ts` — how projected standings are computed and stored
- Existing codebase: `packages/backend/src/api/timeseries.ts` — inflection-points endpoint as direct pattern for snapshot-delta attribution
- Existing codebase: `packages/shared/src/types.ts` — `TeamDailyProjectedCategory`, `TeamDailyProjectedOverall`, `TeamDailyCategoryTotals` schema
- Existing codebase: `packages/backend/src/db/schema.ts` — full database table catalog

### Secondary (MEDIUM confidence)
- STATE.md accumulated decisions — Phase 69, 72, 73 patterns for frontend component structure and semantic token usage

### Tertiary (LOW confidence — not needed, data is sufficient)
- No external library research required; this phase is entirely internal computation

## Metadata

**Confidence breakdown:**
- Data availability: HIGH — all required tables exist, verified against schema.ts and migration files
- Attribution algorithm: HIGH — three-bucket model is a clean decomposition given the data model
- Frontend integration: HIGH — clear placement on existing standings page, established component patterns
- Per-player driver attribution: MEDIUM — depends on how FanGraphs upload frequency behaves in practice

**Research date:** 2026-03-31
**Valid until:** 2026-05-01 (stable domain — no external dependencies)
