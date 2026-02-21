# Technology Stack Additions

**Project:** ESPN Fantasy Baseball Assistant - Multi-Player Trades & Historical Analysis
**Researched:** 2026-02-20
**Confidence:** HIGH

## Executive Summary

The existing stack (Fastify, Next.js 14, Kysely, BullMQ, Recharts) handles the NEW features with minimal additions. No new frameworks required. Three focused libraries plus existing infrastructure upgrades address:

1. **Multi-player trade combinatorics** → js-combinatorics (already familiar pattern from your codebase)
2. **Large free agent/candidate lists** → react-window (complement to existing Recharts)
3. **Historical backfill orchestration** → BullMQ FlowProducer (already have BullMQ 5.1.5)
4. **ESPN historical data** → Same adapter, new query params (no new library)

**Key principle:** Leverage what you have. Kysely handles temporal queries natively. Recharts handles timeline visualization. BullMQ handles backfill jobs.

---

## NEW Dependencies

### Backend: Combinatorial Trade Analysis

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **js-combinatorics** | ^2.1.2 | N-for-N trade candidate generation | TypeScript-native (compiled from .ts), BigInt support for large combinations, proven in 132+ npm projects. Alternative considered: manual recursion (unmaintainable for 3-for-3+ trades). |

**Installation:**
```bash
cd packages/backend
pnpm add js-combinatorics
```

**Integration point:** New `MultiPlayerTradeAgent` in `packages/backend/src/agents/`. Uses `Combination` class to generate candidates, filters via projection delta simulation (reusing existing StandingsProjectionAgent component math).

**Why NOT add:**
- ❌ **optimization-js** — Overkill. Assignment problem solvers (Hungarian algorithm) are for weighted bipartite matching. Fantasy trades aren't optimization problems; they're simulation + ranking.
- ❌ **Custom recursive generators** — js-combinatorics handles edge cases (empty sets, large N), provides iterators (memory-efficient for 5-for-5 trades = 3,003 combinations from 15-player rosters).

---

### Frontend: Virtualized Lists

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **react-window** | ^2.2.3 | Virtualize 100+ free agent/candidate lists | Built-in TypeScript defs, 30KB smaller than react-virtualized, integrates with existing TanStack Query data fetching. Recharts handles charts; react-window handles tables. |
| **@types/react-window** | (NOT needed) | N/A | react-window 2.2.3+ includes native TypeScript definitions. Installing @types would conflict. |

**Installation:**
```bash
cd packages/frontend
pnpm add react-window
```

**Integration point:**
- `/leagues/[id]/free-agents` — FixedSizeList for player rows
- `/leagues/[id]/teams/[teamId]/trades/recommendations` — VariableSizeList for multi-player trade candidates (varying row height based on N-for-N complexity)

**Why NOT add:**
- ❌ **react-virtuoso** — Infinite scroll focus. We need fixed-height tables with sorting (which you already handle via TanStack Query state).
- ❌ **@tanstack/react-virtual** — Headless (no styled components). react-window provides <FixedSizeList> out-of-box, pairs with existing Tailwind classes.

---

## Existing Stack: UPGRADE Versions

### BullMQ FlowProducer (Already Installed)

| Current | Upgrade To | Purpose | Why Upgrade |
|---------|------------|---------|-------------|
| bullmq@5.1.5 | bullmq@^5.69.3 | Historical backfill job orchestration | FlowProducer dependency fixes (v5.20+), batch processing improvements (v5.40+), 68 patch releases of reliability fixes. |

**Installation:**
```bash
cd packages/backend
pnpm add bullmq@^5.69.3
```

**Integration point:** New `HistoricalBackfillOrchestrator` agent uses FlowProducer to create job trees:
```
Parent: BackfillSeason(2023)
├─ Child: FetchWeek(1) → Child: SnapshotWeek(1)
├─ Child: FetchWeek(2) → Child: SnapshotWeek(2)
└─ Child: FetchWeek(26) → Child: SnapshotWeek(26)
```

FlowProducer guarantees fetch-before-snapshot ordering per week, parallelizes weeks, marks parent complete only when all 26 weeks succeed.

**Why NOT add:**
- ❌ **Temporal.io** — Workflow engine overkill. You have 16 tables, not 1000 microservices.
- ❌ **Agenda** — MongoDB-backed. You're on PostgreSQL.

**Configuration additions** (no new libraries):
```typescript
// Existing BullMQ worker already supports batch processing (v5.1.5+)
// Add to SnapshotOrchestratorAgent worker options:
{
  concurrency: 3, // Parallel weeks
  limiter: {
    max: 10,      // ESPN rate limit (existing pattern)
    duration: 1000
  }
}
```

---

## Existing Stack: NO Changes Needed

### PostgreSQL + Kysely → Temporal Queries

**Current:** Kysely 0.27.2
**Action:** None. Already supports recursive CTEs, window functions, and "AS OF" query patterns.

**Why no temporal_tables extension:**
Your `league_daily_snapshot` table IS a temporal table (manually implemented):
- snapshot_date = valid_from (inclusive)
- Immutable inserts (no updates) = system-versioned
- Primary key (league_id, snapshot_date) = bitemporal-ready

**Season replay query** (pure Kysely, no new libraries):
```typescript
// Week-by-week standings from April 1 to Oct 1, 2023
db.selectFrom('team_daily_overall')
  .where('league_id', '=', leagueId)
  .where('snapshot_date', '>=', '2023-04-01')
  .where('snapshot_date', '<=', '2023-10-01')
  .where(sql`EXTRACT(DOW FROM snapshot_date) = 0`) // Sundays only
  .orderBy('snapshot_date', 'asc')
```

**Trade retrospective query** (joins existing tables):
```typescript
// Actual outcome vs projection at trade time
db.selectFrom('league_transaction_event as t')
  .innerJoin('team_daily_projected_overall as proj', (join) => join
    .onRef('proj.team_id', '=', 't.team_id')
    .onRef('proj.snapshot_date', '=', 't.timestamp::date') // "AS OF" trade date
  )
  .innerJoin('team_daily_overall as actual', (join) => join
    .onRef('actual.team_id', '=', 't.team_id')
    .on('actual.snapshot_date', '=', '2023-10-01') // End of season
  )
  .select([
    'proj.total_points as projected_at_trade',
    'actual.total_points as actual_final',
    sql<number>`actual.total_points - proj.total_points`.as('delta')
  ])
```

**Why NOT add:**
- ❌ **temporal_tables extension** — Overkill. Adds trigger complexity for features you already have via immutable inserts.
- ❌ **TimescaleDB** — Hypertable partitioning irrelevant. 182 snapshots/year/league × 10 leagues = 1,820 rows (tiny for PostgreSQL).

---

### Recharts → Timeline Visualization

**Current:** Recharts 2.10.4
**Action:** None. Already handles timeline charts.

**Season replay visualization** (existing Recharts components):
```tsx
// Week-by-week standings race chart
<LineChart data={weeklyStandings}>
  <XAxis dataKey="week" label="Week" />
  <YAxis label="Roto Points" />
  <Tooltip />
  <Legend />
  {teams.map(team => (
    <Line
      key={team.id}
      type="monotone"
      dataKey={`team_${team.id}`}
      stroke={teamColors[team.id]}
      strokeWidth={2}
    />
  ))}
</LineChart>
```

**Trade retrospective visualization** (stacked bar):
```tsx
// Projected vs Actual delta per category
<BarChart data={tradeOutcomes}>
  <XAxis dataKey="category" />
  <YAxis label="Roto Point Delta" />
  <Bar dataKey="projected_delta" fill="#8884d8" />
  <Bar dataKey="actual_delta" fill="#82ca9d" />
  <ReferenceLine y={0} stroke="#000" />
</BarChart>
```

**Why NOT add:**
- ❌ **D3.js** — 200KB unminified. Recharts (React wrapper over D3) is already installed, declarative (fits Next.js paradigm).
- ❌ **Chart.js / react-chartjs-2** — Imperative API (canvas refs). Recharts is React-first (components as data).
- ❌ **Visx** — Lower-level than Recharts. You'd rebuild what Recharts provides (axes, tooltips, legends).

**Best practice from research:**
- Limit data points for performance. For 182-day season, render every 7th point (26 weeks) unless user zooms.
- Use React.memo on <LineChart> when parent re-renders (TanStack Query refetch).

---

## ESPN API: Historical Data Endpoints

**New capability, NO new libraries.**

### Historical Endpoint Structure

ESPN Fantasy API supports historical seasons via two endpoints:

| Season | Endpoint | Auth |
|--------|----------|------|
| 2018+ | `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/{YYYY}/segments/0/leagues/{leagueId}` | SWID + espn_s2 cookies |
| 2017- | `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/leagueHistory/{leagueId}?seasonId={YYYY}` | SWID + espn_s2 cookies |

**Query parameters for week-by-week backfill:**
```typescript
// Existing adapter: packages/backend/src/adapters/espn.ts
// Add method:
async fetchHistoricalWeek(
  leagueId: number,
  season: number,
  scoringPeriodId: number // 1-26 for baseball (weekly scoring periods)
): Promise<LeagueData> {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/${season}/segments/0/leagues/${leagueId}`;
  const params = {
    view: ['mTeam', 'mRoster', 'mMatchup', 'mSettings'],
    scoringPeriodId: scoringPeriodId, // NEW: fetches standings as-of this week
  };
  // Existing retry/backoff logic applies (axios-retry 4.5.0 already installed)
}
```

**Caveats from research:**
- **Data retention:** ESPN may delete historical data. Pre-2018 boxscores often missing. Design doc's `is_degraded` flag handles this (mark snapshot degraded if ESPN returns partial data).
- **Rate limiting:** Historical fetches count against same limits as current-season API. Your existing `@fastify/rate-limit` + backoff handles this.

**Why NOT add:**
- ❌ **espn-api (Python client)** — Wrong language. You're TypeScript.
- ❌ **API client codegen** — ESPN API is undocumented, changes without notice. Hand-maintained adapter (existing pattern) allows quick fixes.

---

## Architecture Patterns: Backfill Job Orchestration

**Uses existing BullMQ (upgraded), NO new queue system.**

### Job Tree Structure (BullMQ FlowProducer)

```typescript
// packages/backend/src/agents/historical-backfill-orchestrator.ts
import { FlowProducer } from 'bullmq';

const flowProducer = new FlowProducer({ connection: redisConnection });

await flowProducer.add({
  name: `backfill-season-${season}`,
  queueName: 'backfill-orchestrator',
  data: { leagueId, season },
  children: [
    {
      name: `fetch-week-1`,
      queueName: 'espn-fetcher',
      data: { leagueId, season, week: 1 },
      children: [
        {
          name: `snapshot-week-1`,
          queueName: 'snapshot-processor',
          data: { leagueId, season, week: 1 },
        }
      ]
    },
    // ... repeat for weeks 2-26
  ]
});
```

**Guarantees:**
- Fetch → Snapshot ordering per week (children run after parent)
- Week parallelization (siblings run concurrently, respecting `concurrency: 3`)
- Atomic failure handling (if fetch-week-5 fails, snapshot-week-5 never runs, parent marked failed)

**Priority queue for user-triggered backfills:**
```typescript
// User clicks "Backfill 2023" button → high priority
await flowProducer.add({
  // ... same structure
  opts: {
    priority: 1, // Lower = higher priority (1-2,097,152 range)
  }
});

// Nightly cron backfill → low priority
await flowProducer.add({
  // ... same structure
  opts: {
    priority: 1000,
  }
});
```

**Why NOT add:**
- ❌ **Celery (Python)** — Wrong language, Redis-backed anyway (same infra).
- ❌ **RabbitMQ** — Message broker overkill. BullMQ is job queue (state persistence, retries, priorities built-in). RabbitMQ would require rebuilding these features.

---

## Component Math: NO Changes

Existing `packages/shared/src/formulas.ts` handles multi-player trades without modification.

**Example: 3-for-2 trade simulation**
```typescript
// Team A trades: Player X, Y, Z
// Team A receives: Player M, N

// Team A's new AVG projection (component-based, existing formula):
const teamA_new_AB = teamA_current_AB - (X.AB + Y.AB + Z.AB) + (M.AB + N.AB) + (X.proj_AB + Y.proj_AB + Z.proj_AB) - (M.proj_AB + N.proj_AB);
const teamA_new_H = teamA_current_H - (X.H + Y.H + Z.H) + (M.H + N.H) + (X.proj_H + Y.proj_H + Z.proj_H) - (M.proj_H + N.proj_H);
const teamA_new_AVG = teamA_new_H / teamA_new_AB; // Rate from components (correct)

// Rank all 12 teams by new_AVG → assign roto points → sum across 12 categories
```

Component math scales to N-for-N trades. js-combinatorics generates candidates; existing projection logic evaluates them.

---

## Database Schema: NO New Tables

Existing 16 tables support new features:

| Feature | Tables Used | Query Pattern |
|---------|-------------|---------------|
| Multi-player trade evaluation | player_projection, team_daily_category_totals, team_daily_projected_overall | IN clause for N players, component aggregation (SUM) |
| Season replay | league_daily_snapshot, team_daily_overall | WHERE snapshot_date BETWEEN start AND end |
| Trade retrospectives | league_transaction_event, team_daily_projected_overall, team_daily_overall | JOIN on trade date (temporal point-in-time) |
| Historical backfill | league_raw_payload, league_daily_snapshot (all snapshot tables) | INSERT with ON CONFLICT DO NOTHING (idempotent) |

**Why NO temporal_tables extension:**
- Existing schema already implements System-Versioned Temporal Tables pattern (SQL:2011 standard):
  - `snapshot_date` = SysStartTime
  - Immutable rows = automatic history
  - No updates (only inserts) = no triggers needed

---

## Frontend Routing: NO Changes

Next.js 14 App Router handles new routes with existing patterns:

| Route | Pattern | Existing or New |
|-------|---------|-----------------|
| `/leagues/[id]/trades/evaluate` | Dynamic segment + query params | NEW page, existing pattern |
| `/leagues/[id]/history?season=2023` | searchParams prop | NEW page, existing pattern |
| `/leagues/[id]/history/trades/[tradeId]` | Nested dynamic segments | NEW page, existing pattern |

**Query param handling (already supported):**
```tsx
// packages/frontend/src/app/leagues/[id]/history/page.tsx
export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string; week?: string }>;
}) {
  const { id } = await params;
  const { season, week } = await searchParams;
  // TanStack Query hook (existing pattern)
}
```

---

## Development Tooling: NO Changes

Existing tools handle new features:

| Tool | Current | Needed For | Status |
|------|---------|------------|--------|
| tsx | 4.7.0 | Hot reload during agent development | ✓ Installed |
| vitest | 1.1.1 | Unit tests for combinatorial logic | ✓ Installed |
| TypeScript | 5.3.3 | Type safety for js-combinatorics generics | ✓ Installed |

**Test example (vitest, no new deps):**
```typescript
// packages/backend/src/agents/__tests__/multi-player-trade.test.ts
import { describe, it, expect } from 'vitest';
import { Combination } from 'js-combinatorics';

describe('MultiPlayerTradeAgent', () => {
  it('generates correct 2-for-2 candidates from 15-player roster', () => {
    const roster = Array.from({ length: 15 }, (_, i) => ({ id: i }));
    const combos = new Combination(roster, 2);
    expect([...combos].length).toBe(105); // 15 choose 2
  });
});
```

---

## Deployment: NO Changes

Railway config supports new features without modification:

| Service | Existing | New Feature Support |
|---------|----------|---------------------|
| Backend | Fastify + 11 agents | +3 agents (MultiPlayerTrade, HistoricalBackfill, SeasonReplay) run in same process |
| Workers | BullMQ workers (Redis) | FlowProducer uses same Redis, same worker pool (no separate service) |
| Database | PostgreSQL (Railway) | Temporal queries use same indexes (snapshot_date already indexed per design doc) |
| Frontend | Next.js 14 (Vercel/Railway) | react-window adds 30KB gzipped (negligible for bundle) |

**Environment variables (NO new secrets):**
```bash
# Existing .env (no additions needed)
ESPN_SWID=...          # Same cookie for historical API
ESPN_S2=...            # Same cookie for historical API
POSTGRES_URL=...       # Same DB for temporal queries
REDIS_URL=...          # Same Redis for FlowProducer
```

---

## Anti-Patterns to AVOID

### 1. Averaging Rate Stats
**Wrong:**
```typescript
// 2-for-2 trade: average the AVGs
const newAVG = (playerA.AVG + playerB.AVG - playerX.AVG - playerY.AVG) / 2;
```

**Correct (existing formulas.ts pattern):**
```typescript
const newAB = teamAB - (playerX.AB + playerY.AB) + (playerA.AB + playerB.AB);
const newH = teamH - (playerX.H + playerY.H) + (playerA.H + playerB.H);
const newAVG = newH / newAB; // Component-based rate
```

### 2. Separate Temporal Database
**Wrong:** Add PostgreSQL extension temporal_tables or switch to TimescaleDB.

**Correct:** Your existing schema (league_daily_snapshot with snapshot_date) IS a temporal table. Just query it.

### 3. Client-Side Combinatorics
**Wrong:** Generate 10,000 trade candidates in browser (blocks UI thread).

**Correct:** js-combinatorics on backend, stream top 50 candidates to frontend (react-window renders).

### 4. Real-Time Historical Backfill
**Wrong:** User clicks "Backfill 2023" → blocks UI for 2 minutes fetching 26 weeks.

**Correct:** BullMQ FlowProducer returns job ID immediately → frontend polls job status → shows progress bar.

---

## Migration Plan

### Phase 1: Upgrade Existing (Zero New Features)
```bash
cd packages/backend
pnpm add bullmq@^5.69.3  # 68 patch releases of fixes
pnpm test                # Ensure existing SnapshotOrchestrator still works
```

### Phase 2: Add Combinatorics (Backend Only)
```bash
pnpm add js-combinatorics@^2.1.2
```
Create `MultiPlayerTradeAgent` (mirrors existing `TradeRecommendationAgent` structure).

### Phase 3: Add Virtualization (Frontend Only)
```bash
cd packages/frontend
pnpm add react-window@^2.2.3
```
Refactor `/free-agents` table to `<FixedSizeList>`.

### Phase 4: Historical Orchestration (Backend Only)
Extend `ESPNAdapter` with `fetchHistoricalWeek` method.
Create `HistoricalBackfillOrchestrator` using BullMQ FlowProducer.

**Total new dependencies:** 2 (js-combinatorics, react-window)
**Total upgrades:** 1 (bullmq)

---

## Version Summary

| Library | Action | Version | Confidence |
|---------|--------|---------|------------|
| js-combinatorics | ADD | ^2.1.2 | HIGH (npm registry, 2 years stable) |
| react-window | ADD | ^2.2.3 | HIGH (official docs, native TS) |
| bullmq | UPGRADE | ^5.69.3 | HIGH (official docs, 4 days old) |
| Kysely | NO CHANGE | 0.27.2 | HIGH (existing recursive CTE support) |
| Recharts | NO CHANGE | 2.10.4 | HIGH (existing timeline examples) |
| Next.js | NO CHANGE | 14.1.0 | HIGH (existing searchParams support) |

---

## Sources

### ESPN API Research
- [Using ESPN's new Fantasy API (v3)](https://stmorse.github.io/journal/espn-fantasy-v3.html)
- [ESPN Fantasy API GitHub (cwendt94)](https://github.com/cwendt94/espn-api)
- [ESPN's Hidden API: How to Access Free Sports Data](https://scrapecreators.com/blog/espn-api-free-sports-data)

### Combinatorics
- [js-combinatorics - npm](https://www.npmjs.com/package/js-combinatorics)
- [GitHub - dankogai/js-combinatorics](https://github.com/dankogai/js-combinatorics)

### Virtualization
- [react-window - npm](https://www.npmjs.com/package/react-window)
- [Virtualize large lists with react-window](https://web.dev/articles/virtualize-long-lists-react-window)
- [react-virtualized vs. react-window - LogRocket](https://blog.logrocket.com/react-virtualized-vs-react-window/)

### BullMQ & Job Orchestration
- [BullMQ - Flows](https://docs.bullmq.io/guide/flows)
- [BullMQ - Prioritized Jobs](https://docs.bullmq.io/guide/jobs/prioritized)
- [Untangling Job Dependencies with BullMQ's FlowProducer](https://seyiogunjuyigbe.medium.com/untangling-job-dependencies-with-bullmqs-flowproducer-76eec80a976c)
- [How to Use BullMQ Flow Producer for Job Pipelines](https://oneuptime.com/blog/post/2026-01-21-bullmq-flow-producer-pipelines/view)

### Recharts & Visualization
- [Recharts Timeline Example](https://recharts.github.io/en-US/examples/TimelineExample/)
- [Data Formatting Best Practices - Recharts](https://app.studyraid.com/en/read/11352/354981/data-formatting-best-practices)
- [The Top 5 React Chart Libraries to Know in 2026](https://www.syncfusion.com/blogs/post/top-5-react-chart-libraries)

### PostgreSQL Temporal Queries
- [Saving Data Historically with Temporal Tables](https://www.red-gate.com/simple-talk/databases/postgresql/saving-data-historically-with-temporal-tables-part-1-queries/)
- [Temporal Extensions - PostgreSQL wiki](https://wiki.postgresql.org/wiki/Temporal_Extensions)
- [GitHub - arkhipov/temporal_tables](https://github.com/arkhipov/temporal_tables)

### Kysely
- [CTE | Kysely](https://kysely.dev/docs/category/cte)
- [Simple selects | Kysely](https://kysely.dev/docs/examples/cte/simple-selects)

### Next.js 14 App Router
- [File-system conventions: Dynamic Segments | Next.js](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes)
- [Functions: useSearchParams | Next.js](https://nextjs.org/docs/app/api-reference/functions/use-search-params)
- [Functions: useParams | Next.js](https://nextjs.org/docs/app/api-reference/functions/use-params)
