# Phase 70: Trends and Efficiency - Research

**Researched:** 2026-03-23
**Domain:** Player trend analysis, lineup efficiency tracking
**Confidence:** HIGH

## Summary

Phase 70 adds two features to the in-season dashboard: (1) a hot/cold player panel showing 7-day rolling trends for roster players, and (2) a lineup efficiency view showing production left on the bench. Both features are well-supported by existing infrastructure.

The `player_period_stats` table already stores per-player per-scoring-period stat components with `lineup_slot_id` (which distinguishes active vs bench). The snapshot orchestrator populates this table daily. The `team_roster_snapshot` table tracks which players are on each team with `roster_status` (active/bench/il/na). This means the data layer for both hot/cold trends and bench production analysis already exists — the work is primarily computing 7-day rolling aggregates and building frontend UI.

**Primary recommendation:** Build a backend trends API that queries `player_period_stats` for 7-day windows, computes rolling stat aggregates and directional indicators, then build frontend components that render hot/cold panels and lineup efficiency tables using the existing dark shell layout.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TREND-01 | Hot/cold panel showing 7-day trend for roster players | `player_period_stats` stores daily components per player; aggregate over 7-day window, compare to season average |
| TREND-02 | Hot players highlighted by OPS surge, HR burst, K spike | Compute 7-day OPS/HR-rate/K-rate from `components_json`, compare to season baseline, label the driving stat |
| TREND-03 | Cold players flagged with declining production | Same 7-day vs season comparison, flag when 7-day significantly underperforms season average |
| TREND-04 | Lineup efficiency tracks bench production | `lineup_slot_id` in `player_period_stats` distinguishes bench (>15) from active; sum bench player production |
| TREND-05 | Warning when benched player outproduced starter at same position | Compare bench player stats to started player at same `roster_slot` from `team_roster_snapshot` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Kysely | (existing) | Query player_period_stats for 7-day aggregates | Already used throughout backend |
| Fastify | 4 (existing) | New trends API routes | Already used for all API endpoints |
| TanStack Query v5 | (existing) | Frontend data fetching | Already used on all pages |
| Recharts | (existing) | Sparkline/mini charts for trends | Already installed and used on trends page |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shared/formulas.ts | (existing) | Component math for OPS, ERA, WHIP from raw components | Computing rate stats from components_json |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Computing trends in backend | Computing in frontend | Backend is better — avoids sending all raw period data to client |
| Sparkline charts | Plain up/down arrows | Sparklines give more context but arrows are simpler; arrows sufficient for v1 |

## Architecture Patterns

### Recommended Project Structure
```
packages/backend/src/
├── api/trends.ts             # New API routes for hot/cold + lineup efficiency
├── agents/                   # No new agent needed — pure API queries
packages/frontend/src/
├── app/leagues/[id]/trends/
│   ├── page.tsx              # Existing trends page (time series charts)
│   ├── _sections/
│   │   ├── HotColdPanel.tsx  # Hot/cold player panel component
│   │   └── LineupEfficiency.tsx # Bench production component
```

### Pattern 1: 7-Day Rolling Trend Computation
**What:** Query `player_period_stats` for last 7 scoring periods, aggregate components, compute rate stats, compare to season baseline
**When to use:** For TREND-01, TREND-02, TREND-03

The `player_period_stats` table has:
- `league_id`, `snapshot_date`, `scoring_period`, `player_id`, `team_id`
- `lineup_slot_id` (null or slot number; bench slots are > 15 in ESPN)
- `components_json` (e.g., `{"H": 5, "AB": 15, "HR": 2, "R": 3, ...}`)

To compute 7-day trend:
1. Get current team roster from `team_roster_snapshot` (latest snapshot_date)
2. Query `player_period_stats` for those players, last 7 scoring periods
3. Sum components across 7 days
4. Compute rate stats (OPS, ERA, WHIP) using shared formulas
5. Compare to season-long average (all scoring periods)
6. Classify as hot/cold based on deviation threshold

### Pattern 2: Bench Production Analysis
**What:** Sum stat production from players with bench lineup_slot_id, compare to starters at same position
**When to use:** For TREND-04, TREND-05

ESPN lineup slot IDs:
- 0-15: Active roster slots (C, 1B, 2B, SS, 3B, OF, UTIL, DH, SP, RP, P)
- 20+: Bench slots (20 = Bench, 21 = IL)

To compute lineup efficiency:
1. Query `player_period_stats` for team's players over recent days
2. Split by `lineup_slot_id` into active vs bench
3. Sum bench player production (HR, SB, OPS components)
4. For TREND-05: Match bench players to starters at same position via `team_roster_snapshot.roster_slot`

### Anti-Patterns to Avoid
- **Averaging rate stats:** Never average OPS/ERA/WHIP across days. Sum components, then compute rate.
- **Fetching all periods to frontend:** Compute aggregates in backend, send only results.
- **Hardcoding scoring period numbers:** Use date-based queries, not hardcoded period IDs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate stat computation | Custom OPS/ERA/WHIP formulas | `shared/formulas.ts` | Already has AVG, OBP, SLG, OPS, ERA, WHIP with component math |
| Date range queries | Manual date arithmetic | Kysely SQL date functions | DB handles timezone and date math correctly |
| Data fetching + caching | Custom fetch + state | TanStack Query | Already configured with proper cache keys |

**Key insight:** The hardest part (collecting per-player per-period stats) is already done by the snapshot orchestrator. This phase is primarily aggregation + UI.

## Common Pitfalls

### Pitfall 1: Missing Scoring Periods
**What goes wrong:** Not all scoring periods may have data (missed snapshots, season gaps)
**Why it happens:** Snapshot orchestrator may not run every day
**How to avoid:** Use date-based queries with COUNT of available periods; degrade gracefully when < 7 days of data
**Warning signs:** Division by zero when computing averages, NaN values in frontend

### Pitfall 2: ESPN Lineup Slot ID Mapping
**What goes wrong:** Misidentifying bench vs active players
**Why it happens:** ESPN lineup slot IDs are not well-documented
**How to avoid:** Use `lineup_slot_id > 15` for bench detection (slot 20 = Bench, 21 = IL in ESPN); or use `roster_status` from `team_roster_snapshot`
**Warning signs:** Players showing as benched when they were active, or vice versa

### Pitfall 3: Rate Stat Averaging
**What goes wrong:** Averaging OPS over 7 days instead of summing components
**Why it happens:** Intuitive but mathematically wrong
**How to avoid:** Always sum H, AB, BB, HBP, SF, TB components across the window, then compute OPS from totals
**Warning signs:** OPS values that don't match manual calculation

### Pitfall 4: Hot/Cold Threshold Calibration
**What goes wrong:** Too many or too few players flagged as hot/cold
**Why it happens:** Fixed thresholds don't account for position norms or sample size
**How to avoid:** Use percentage deviation from player's own season average (e.g., 7-day OPS > 120% of season OPS = hot)
**Warning signs:** All catchers flagged as cold, all DHs flagged as hot

### Pitfall 5: ESPN Period Stats Blocker
**What goes wrong:** `player_period_stats` may not have 7-day granularity
**Why it happens:** State blocker notes: "ESPN period stats endpoint for 7-day rolling windows needs verification; player_period_stats exists in schema but ESPN feeding is unconfirmed"
**How to avoid:** Verify `player_period_stats` has data with `SELECT COUNT(*) FROM player_period_stats WHERE league_id = X`. If empty, fall back to computing trends from daily `team_roster_snapshot` + `player_projection` deltas
**Warning signs:** Empty query results, no trend data displayed

## Code Examples

### Querying 7-Day Player Stats
```typescript
// Get last 7 days of player stats for a team
const recentStats = await db
  .selectFrom("player_period_stats")
  .select(["player_id", "lineup_slot_id", "components_json", "snapshot_date"])
  .where("league_id", "=", leagueId)
  .where("team_id", "=", teamId)
  .where("snapshot_date", ">=", sevenDaysAgo)
  .execute();
```

### Computing OPS from Components
```typescript
import { computeOBP, computeSLG } from "@espn-agent/shared";

// Sum components across 7-day window
const totals = { H: 0, AB: 0, BB: 0, HBP: 0, SF: 0, TB: 0 };
for (const row of playerRows) {
  const c = row.components_json as Record<string, number>;
  totals.H += c.H || 0;
  totals.AB += c.AB || 0;
  // ... etc
}

const obp = computeOBP(totals.H, totals.BB, totals.HBP, totals.AB, totals.SF);
const slg = computeSLG(totals.TB, totals.AB);
const ops = obp + slg;
```

### Bench Production Detection
```typescript
// Separate active vs bench using lineup_slot_id
const benchRows = recentStats.filter(r => r.lineup_slot_id !== null && r.lineup_slot_id >= 20);
const activeRows = recentStats.filter(r => r.lineup_slot_id !== null && r.lineup_slot_id < 20);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Table-based trends (v1) | Recharts line charts | Phase 35 | Trends page already has chart infrastructure |
| No per-player stats | player_period_stats table | Phase 46/migration 009 | Enables per-player trend computation |

## Open Questions

1. **player_period_stats population status**
   - What we know: Schema exists, snapshot orchestrator has code to populate it
   - What's unclear: Whether it's been running long enough to have 7+ days of data (state blocker flags this)
   - Recommendation: Build the feature, add graceful fallback message when < 7 days available

2. **Hot/cold threshold values**
   - What we know: Need percentage deviation from season average
   - What's unclear: Optimal thresholds for "hot" vs "cold"
   - Recommendation: Start with 25% above/below season average; make configurable

3. **Pitcher hot/cold metrics**
   - What we know: Hitters use OPS surge, HR burst; pitchers need different metrics
   - What's unclear: Best pitcher "heat" indicator
   - Recommendation: K-rate spike (TREND-02 mentions K spike), ERA drop for pitchers

## Sources

### Primary (HIGH confidence)
- Codebase: `packages/backend/src/agents/snapshot-orchestrator.ts` — player_period_stats population logic (lines 895-966)
- Codebase: `packages/shared/src/types.ts` — PlayerPeriodStats interface (line 318)
- Codebase: `packages/shared/src/types.ts` — TeamRosterSnapshot interface (line 219)
- Codebase: `packages/backend/src/agents/transaction-impact.ts` — player_period_stats query patterns (lines 510-523)

### Secondary (MEDIUM confidence)
- State blocker: "ESPN period stats endpoint for 7-day rolling windows needs verification"

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use
- Architecture: HIGH — extends existing patterns, data tables exist
- Pitfalls: MEDIUM — ESPN lineup slot ID mapping needs validation, player_period_stats population status uncertain

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable — internal codebase, no external dependency changes)
