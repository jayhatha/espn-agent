# Phase 37: App Performance Audit — Research

**Researched:** 2026-03-09
**Domain:** Performance audit verification — backend DB, frontend React, extension DOM, infrastructure
**Confidence:** HIGH (all claims verified by reading actual source code)

---

## Summary

PERFORMANCE_AUDIT.md was written on 2026-03-09. Every issue was verified against the current codebase. Since the audit was produced the same day as this research, very few items have been fixed. The primary exceptions are Docker layer ordering (I-01 is already fixed in the Dockerfile), recharts is now used (F-05 no longer applies), and some indexes partially exist already.

The audit found 26 issues. After code verification: **22 issues remain fully open**, **2 are partially addressed**, **1 is fully fixed** (Docker layers), and **1 no longer applies** (recharts). The planner should NOT include fixed/inapplicable items.

The highest-impact work is the N+1 query cluster (B-01, B-02, B-03, B-04) — these produce thousands of DB round-trips on normal operations. The B-05 / B-06 / B-07 quick wins are one-liners that materially reduce latency. The extension issues (E-01, E-02) are the most likely cause of reported extension lockups from phase 30.

**Primary recommendation:** Fix in the order specified by PERFORMANCE_AUDIT.md's recommended batch order: Quick Wins first (already validated as genuinely quick), then N+1 elimination, then indexes/pagination, then ESPN resilience, then extension DOM, then infrastructure.

---

## Verification Results by Issue

This section is the core deliverable. Each issue is verified against the actual codebase. The planner should only create tasks for issues marked OPEN or PARTIAL.

### Critical / High Severity

| ID | Status | Evidence | Notes |
|----|--------|----------|-------|
| B-01 | **OPEN** | `snapshot-orchestrator.ts:446-526` — inner loop with `existingPlayer` SELECT + player upsert + optional injury_event INSERT + roster_snapshot INSERT per player | Exactly as audited. ~4 queries/player, ~1,920 per snapshot. |
| B-02 | **OPEN** | `projections-ingest.ts:333-412` — `matchPlayer()` called per row inside `for...of`, individual `player_projection` insert per row | N+1 pattern confirmed. |
| B-03 | **OPEN** | `recommendations.ts:110-128` — `for (const fa of espnFreeAgents)` with individual `insertInto("player")` per iteration | Confirmed loop-based upsert. |
| B-04 | **OPEN** | `snapshot-orchestrator.ts:367-376` — `for (const team of normalized.teams)` with DB query per iteration to rebuild `teamIdMap` | Confirmed. `espnTeamIdToDbId` Map already populated inside the transaction (lines 286-304) but not passed out; rebuilt with new queries at line 367. |
| B-05 | **OPEN** | `standings-projection.ts:86-95` — `for (const team of teams)` with `await computeTeamProjection(...)` inside | Sequential. No `Promise.all`. |
| B-06 | **OPEN** | `db/connection.ts:12` — `max: 10` only, no timeout config | No `connectionTimeoutMillis` or `idleTimeoutMillis`. |
| B-07 | **OPEN** | `snapshot-worker.ts:40-68` — `new Worker(...)` with no options object at all | No concurrency setting. BullMQ default is 1. |
| B-08 | **PARTIAL** | `recommendations.ts:32` — `limit` query param exists, `maxPlayers` used in ESPN fetch; but no `offset` pagination; IN clause is bounded by the returned set | Limit works; pagination (offset) not implemented. Fix: add `offset` and `page` params. |
| E-01 | **OPEN** | `dom-observers.ts:357-362` — `bootstrapObserver.observe(document.body, { childList: true, subtree: true })` | Watches entire body. Periodic `setInterval` 2000ms also present at line 379. |
| E-02 | **OPEN** | `dom-observers.ts:1354-1371` — MutationObserver on `document.body` with attributes+subtree AND `setInterval(checkCurrentPlayer, 2000)` | Both mechanisms confirmed. |

### Medium Severity

| ID | Status | Evidence | Notes |
|----|--------|----------|-------|
| B-09 | **OPEN** | `projections-ingest.ts:1` — `import { parse } from "csv-parse/sync"` and used at lines 299 and 443 | Sync parse confirmed. |
| B-10 | **OPEN** | `timeseries.ts:97, 145` — no LIMIT on `query.orderBy("snapshot_date", "asc").execute()` | Confirmed unbounded. |
| B-11 | **OPEN** | `espn.ts:22-30` — module-level `let lastEspnCall = 0` with no locking | Race condition possible under concurrent load. |
| B-12 | **PARTIAL** | `espn.ts:910-916` — 429 caught, `retryAfter` parsed and logged, but `throw error` immediately after | No retry loop. Error is logged then re-thrown. The `createRetryableAxios` import exists (line 5) — need to verify if it handles 429. |
| B-13 | **PARTIAL** | Migration 001 has `idx_player_identity_fangraphs ON player_identity_map(fangraphs_key)`. Migration 002 has `idx_player_projection_composite ON player_projection(player_id, projections_run_id)` and `idx_league_snapshot_league_date ON league_daily_snapshot(league_id, snapshot_date DESC)`. **Missing**: `team_roster_snapshot(league_id, snapshot_date, team_id)` composite and `team_daily_category_totals(league_id, snapshot_date DESC, team_id)` composite. | Only 2 of 5 suggested indexes exist. Need a new migration. |
| B-14 | **OPEN** | `formulas.ts:153-157` — `.map((val) => Math.pow(val - mean, 2))` creates intermediate array, then `.reduce(...)` traverses it again | Double-pass confirmed. |
| B-15 | **OPEN** | `projections-ingest.ts:256-264` — `sql\`SUM(CASE WHEN (pp.stat_components_json->>'IP')::float > 0...\`` | JSONB inline cast confirmed. |
| B-16 | **OPEN** | `db/connection.ts` — no `connectionTimeoutMillis`, `idleTimeoutMillis`, or `maxUses` | Confirmed missing. |
| I-01 | **FIXED** | `backend/Dockerfile` — copies `package.json`/`pnpm-lock.yaml` first (lines 12-17), then runs `pnpm install` (line 21), then copies source (lines 24-25). `.dockerignore` exists with `node_modules/`, `dist/`, `.next/`, `.git`, etc. | Both issues from the audit are resolved. **Do not include in plan.** |
| F-01 | **OPEN** | `standings/page.tsx:102-145` — `buildCurrentMatrix` and `buildProjectedMatrix` are plain functions; `buildCurrentMatrix()` and `buildProjectedMatrix()` called directly at lines 144-145 on each render with no `useMemo` | Confirmed. |
| F-02 | **OPEN** | `providers.tsx:13` — `staleTime: 60 * 1000` | Confirmed 1 minute. |
| F-03 | **OPEN** | `waivers/page.tsx:396-472` — `aiData.recommendations.map(...)` renders all items; no pagination | Confirmed unbounded render. |

### Low Severity

| ID | Status | Evidence | Notes |
|----|--------|----------|-------|
| E-03 | **OPEN** | `api-client.ts:357-421` — `pitcherMap`, `hitterMap`, `relieverMap` built from scratch on each call; last-name fallback loops entire maps | Confirmed per-call map construction. |
| F-04 | **OPEN** | All page files have `"use client"` at top | Still true. Deferred/low priority. |
| F-05 | **FIXED** | `recharts` imported in `trends/page.tsx`, `moves/page.tsx`, `CategoryMiniChart.tsx` | Recharts is actively used. **Do not include in plan.** |
| I-02 | **OPEN** | `turbo.json` — `globalDependencies` only includes `.env.*local`, no `**/tsconfig*.json`; no `inputs` on build tasks | Confirmed. |
| I-03 | **OPEN** | `next.config.mjs` — only `reactStrictMode: true` and `env`. No `swcMinify`, `compress`, `productionBrowserSourceMaps` | Confirmed missing. Note: `swcMinify` was made the default in Next.js 13+, so only `compress` and `productionBrowserSourceMaps: false` are needed. |
| I-04 | **OPEN** | `snapshot-worker.ts:91` — DLQ jobs have `removeOnComplete: { age: 86400 * 30 }` (30 days). Main snapshot jobs use 24 hours (correct). | DLQ retention is the issue — 30 days accumulates Redis memory. Reduce DLQ to 7 days. |
| I-05 | **OPEN** | `espn.ts:287` — `max: 500` | Confirmed. |
| B-17 | **OPEN** | `leagues.ts:334-357` — no LIMIT on league list query | Confirmed. Low impact. |

---

## Issues to Fix (Actionable List)

Organized by the audit's recommended batch order. Fixed/inapplicable issues excluded.

### Batch 1: Quick Wins (minimal code change, high payoff)

| ID | File | Change |
|----|------|--------|
| B-06 | `packages/backend/src/db/connection.ts` | `max: 25`, add `connectionTimeoutMillis: 5000`, `idleTimeoutMillis: 30000` |
| B-16 | same file | Add `maxUses: 7500` (combined with B-06) |
| B-07 | `packages/backend/src/workers/snapshot-worker.ts` | Add `{ concurrency: 3 }` to Worker constructor |
| B-05 | `packages/backend/src/agents/standings-projection.ts` | Wrap `computeTeamProjection` calls in `Promise.all()` |
| B-04 | `packages/backend/src/agents/snapshot-orchestrator.ts` | Reuse `espnTeamIdToDbId` Map from the transaction instead of re-querying at step 8 |
| F-01 | `packages/frontend/src/app/leagues/[id]/standings/page.tsx` | Wrap `buildCurrentMatrix` and `buildProjectedMatrix` in `useMemo` |
| F-02 | `packages/frontend/src/app/providers.tsx` | `staleTime: 5 * 60_000`, add `gcTime: 10 * 60_000` |
| I-04 | `packages/backend/src/workers/snapshot-worker.ts` | DLQ `removeOnComplete: { age: 86400 * 7 }` |
| I-05 | `packages/backend/src/adapters/espn.ts` | `max: 2000` on LRU cache |

### Batch 2: N+1 Query Elimination (significant DB improvement)

| ID | File | Change |
|----|------|--------|
| B-01 | `packages/backend/src/agents/snapshot-orchestrator.ts` | Batch player upserts and roster_snapshot inserts; conditional injury_event inserts |
| B-02 | `packages/backend/src/agents/projections-ingest.ts` | Pre-load identity map; batch `player_projection` inserts |
| B-03 | `packages/backend/src/api/recommendations.ts` | Single batch `insertInto("player").values([...all rows...])` |

### Batch 3: Indexes + Pagination

| ID | File | Change |
|----|------|--------|
| B-13 | New migration `017_add_missing_indexes.sql` | Add `team_roster_snapshot(league_id, snapshot_date, team_id)` and `team_daily_category_totals(league_id, snapshot_date DESC, team_id)` composite indexes |
| B-08 | `packages/backend/src/api/recommendations.ts` | Add `offset` query param; paginate the free-agent list |
| B-10 | `packages/backend/src/api/timeseries.ts` | Default `LIMIT 1000` on unbounded queries |
| B-17 | `packages/backend/src/api/leagues.ts` | Add LIMIT to league list (low priority, can be skipped) |

### Batch 4: ESPN Adapter Resilience

| ID | File | Change |
|----|------|--------|
| B-11 | `packages/backend/src/adapters/espn.ts` | Replace module-level `lastEspnCall` with mutex (p-limit or instance-level queue) |
| B-12 | `packages/backend/src/adapters/espn.ts` | Add retry loop on 429 with exponential backoff (2s/4s/8s), respect `Retry-After` |

### Batch 5: Extension DOM Performance

| ID | File | Change |
|----|------|--------|
| E-01 | `packages/extension/lib/dom-observers.ts` | Narrow bootstrap observer to draft board container; increase periodic scan to 5s or eliminate |
| E-02 | `packages/extension/lib/dom-observers.ts` | Remove `setInterval(checkCurrentPlayer, 2000)` in `observeCurrentAuctionPlayer`; debounce MutationObserver only |
| E-03 | `packages/extension/lib/api-client.ts` | Build `pitcherMap`/`hitterMap`/`relieverMap` once at data load, cache on module/closure |

### Batch 6: Infrastructure + Code Quality

| ID | File | Change |
|----|------|--------|
| I-02 | `turbo.json` | Add `**/tsconfig*.json` to `globalDependencies`; add `"inputs": ["src/**"]` to build pipeline |
| I-03 | `packages/frontend/next.config.mjs` | Add `compress: true`, `productionBrowserSourceMaps: false` (skip `swcMinify` — default in Next.js 13+) |
| B-09 | `packages/backend/src/agents/projections-ingest.ts` | Switch from `csv-parse/sync` to streaming async parser |
| B-14 | `packages/shared/src/formulas.ts` | Single-pass variance in `calculateCategorySGP`; pre-compute mean+stdDev per category in caller |
| B-15 | `packages/backend/src/agents/projections-ingest.ts` | Move batter/pitcher count detection to application code |
| F-03 | `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` | Client-side pagination for recommendations and free-agent lists |
| F-04 | Various frontend pages | Low priority — server components refactor; defer to dedicated phase |

---

## Architecture Patterns

### Batch Insert Pattern (Kysely)

For B-01, B-02, B-03: collect all rows into an array first, then do a single insert.

```typescript
// Collect
const rosterRows = [];
for (const team of teams) {
  for (const entry of team.roster) {
    rosterRows.push({ league_id, snapshot_date, team_id, player_id, ... });
  }
}
// Insert all at once
if (rosterRows.length > 0) {
  await trx.insertInto("team_roster_snapshot").values(rosterRows).execute();
}
```

The injury_event table is trickier because it needs conditional logic (only insert when status changes). Resolve this by:
1. Pre-fetch ALL existing players in a single `WHERE id IN (...)` query
2. Build a Map of `playerId -> existingStatus`
3. Collect `injury_event` rows from the comparison
4. Batch-insert `injury_event` rows

### Promise.all Pattern (B-05)

```typescript
// Before (sequential)
for (const team of teams) {
  const projection = await this.computeTeamProjection(...);
  teamProjections.push(projection);
}

// After (parallel)
const teamProjections = await Promise.all(
  teams.map(team => this.computeTeamProjection(leagueId, snapshotDate, team.id, projectionsRunId, categories))
);
```

Caution: if each `computeTeamProjection` opens multiple DB connections, 12 parallel calls could exhaust a pool of 10 — B-06 (pool increase) must be applied first or simultaneously.

### Team ID Map Reuse (B-04)

```typescript
// Before (step 8 re-queries DB for each team)
const teamIdMap = new Map<number, number>();
for (const team of normalized.teams) {
  const dbTeam = await this.db.selectFrom("team")...
  if (dbTeam) teamIdMap.set(team.id, dbTeam.id);
}

// After (reuse Map already built in the transaction)
// Pass espnTeamIdToDbId out of the transaction scope:
const espnTeamIdToDbId = new Map<number, number>();
await this.db.transaction().execute(async (trx) => {
  // ... build espnTeamIdToDbId inside transaction ...
});
// espnTeamIdToDbId is now populated — use directly at step 8
```

### useMemo Pattern (F-01)

```typescript
import { useMemo } from "react";

const currentMatrix = useMemo(() => {
  if (!data) return null;
  // ... buildCurrentMatrix logic ...
}, [data]);

const projectedMatrix = useMemo(() => {
  if (!data) return null;
  // ... buildProjectedMatrix logic ...
}, [data]);
```

### Single-Pass Variance (B-14)

```typescript
export function calculateCategorySGP(statValue: number, allPlayerValues: number[]): number {
  if (allPlayerValues.length === 0) return 0;
  const n = allPlayerValues.length;
  let sum = 0;
  let sumSq = 0;
  for (const val of allPlayerValues) {
    sum += val;
    sumSq += val * val;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return (statValue - mean) / stdDev;
}
```

### Migration Template (B-13)

```sql
-- 017_add_missing_indexes.sql
CREATE INDEX IF NOT EXISTS idx_roster_snapshot_league_date_team
  ON team_roster_snapshot(league_id, snapshot_date, team_id);

CREATE INDEX IF NOT EXISTS idx_category_totals_league_date_team
  ON team_daily_category_totals(league_id, snapshot_date DESC, team_id);
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mutex for ESPN throttle | Custom lock class | `p-limit(1)` | Already in ecosystem, handles edge cases |
| Retry with backoff | Manual setTimeout loop | `createRetryableAxios` already imported in espn.ts — verify if it covers 429 | The util already exists; extend it |
| Pagination state | Custom hook | Simple `useState(page)` + slice | No complexity needed here |

---

## Common Pitfalls

### Pitfall 1: Parallelizing before pool increase
**What goes wrong:** Applying B-05 (Promise.all for 12 teams) without B-06 (pool increase) exhausts the pool of 10 connections under snapshot load.
**How to avoid:** Apply B-06 first or in the same commit. Verify B-05 and B-06 go into the same plan task or consecutive tasks.

### Pitfall 2: Batch insert size limit
**What goes wrong:** PostgreSQL has a limit on parameterized values (~65,535). Inserting 1,920 roster rows with 8 columns each = 15,360 params — fine. But confirm the actual row count stays within limits.
**How to avoid:** For B-01, chunk batches at 500 rows if needed. In practice, 12 teams × 40 players = 480 rows, well under limit.

### Pitfall 3: B-01 injury_event conditional logic in batch mode
**What goes wrong:** The injury_event insert depends on comparing `existingPlayer.injury_status` to the new status — you can't remove the per-player SELECT without a different approach.
**How to avoid:** Pre-fetch all `player` rows for the roster in one query before the loop: `WHERE id IN (all_espn_player_ids)`. Build a Map, then use it to evaluate condition without DB round-trips.

### Pitfall 4: B-04 Map scope — transaction vs outside
**What goes wrong:** The `espnTeamIdToDbId` Map is built inside the `transaction()` callback, which is a closure. TypeScript will require it to be declared outside the transaction and populated inside.
**How to avoid:** Declare `const espnTeamIdToDbId = new Map<number, number>()` before the `transaction().execute()` call; mutate it inside the transaction body.

### Pitfall 5: swcMinify in I-03
**What goes wrong:** Adding `swcMinify: true` to `next.config.mjs` for Next.js 14 is a no-op or generates a deprecation warning — it is the default.
**How to avoid:** Only add `compress: true` and `productionBrowserSourceMaps: false`.

### Pitfall 6: B-07 BullMQ concurrency with snapshot serialization
**What goes wrong:** Setting concurrency:3 allows 3 snapshot jobs simultaneously. If the same league gets duplicate jobs (race), both may run concurrently.
**How to avoid:** The codebase already uses `jobId` deduplication (`snapshot-${league.id}-${today}`), which prevents duplicate jobs in the queue. Concurrency:3 is safe.

---

## Open Questions

1. **B-12: Does `createRetryableAxios` already handle 429?**
   - What we know: `createRetryableAxios` is imported from `../utils/retry.js` in espn.ts. The audit didn't check what it does.
   - What's unclear: If it already retries on 429, B-12 may be partially done.
   - Recommendation: Read `packages/backend/src/utils/retry.ts` before implementing B-12. If it handles 429 with backoff, close the issue.

2. **E-01: Can the bootstrap observer be narrowed without breaking async load?**
   - What we know: The observer watches `document.body` because the draft board doesn't exist yet on page load.
   - What's unclear: ESPN's DOM structure — what container is available early enough to scope the observer.
   - Recommendation: In the extension, the observer's purpose is to detect when `findDraftBoardElement()` returns a result. Narrowing is only possible if there's a known parent container that's in the DOM before the board. If not, increase the periodic scan interval to 5s and add a debounce to the observer callback instead.

3. **B-02: Batching player_identity_map inserts**
   - What we know: `matchPlayer()` does an identity map lookup, then optionally inserts a new mapping.
   - What's unclear: Whether pre-loading the entire identity map at ingest start is safe (it could be large).
   - Recommendation: The PERFORMANCE_AUDIT.md says "Pre-load the entire player_identity_map for the relevant source into a hash map." The relevant source is `fangraphs` so only one source's entries need loading. Acceptable size.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection — all files read and verified against each audit item
- `packages/backend/src/agents/snapshot-orchestrator.ts` — B-01, B-04
- `packages/backend/src/agents/projections-ingest.ts` — B-02, B-09, B-15
- `packages/backend/src/api/recommendations.ts` — B-03, B-08
- `packages/backend/src/agents/standings-projection.ts` — B-05
- `packages/backend/src/db/connection.ts` — B-06, B-16
- `packages/backend/src/workers/snapshot-worker.ts` — B-07, I-04
- `packages/backend/src/adapters/espn.ts` — B-11, B-12, I-05
- `packages/backend/src/db/migrations/001_initial_schema.sql` — B-13 (existing indexes)
- `packages/backend/src/db/migrations/002_add_performance_indexes.sql` — B-13 (existing indexes)
- `packages/shared/src/formulas.ts` — B-14
- `packages/backend/src/api/timeseries.ts` — B-10
- `packages/backend/src/api/leagues.ts` — B-17
- `packages/frontend/src/app/leagues/[id]/standings/page.tsx` — F-01
- `packages/frontend/src/app/providers.tsx` — F-02
- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` — F-03
- `packages/extension/lib/dom-observers.ts` — E-01, E-02
- `packages/extension/lib/api-client.ts` — E-03
- `packages/backend/Dockerfile` — I-01 (FIXED)
- `.dockerignore` — I-01 (FIXED)
- `turbo.json` — I-02
- `packages/frontend/next.config.mjs` — I-03
- `packages/frontend/src/app/leagues/[id]/trends/page.tsx`, `moves/page.tsx`, `components/league/CategoryMiniChart.tsx` — F-05 (NOT an issue)

---

## Metadata

**Confidence breakdown:**
- Issue status (open/fixed): HIGH — verified by reading actual source code
- Fix patterns: HIGH — standard Kysely/React/BullMQ patterns, no unusual APIs
- Infrastructure fixes: HIGH — Next.js defaults documented, Docker layer ordering verified

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable codebase; only invalidated by concurrent phase work on these files)
