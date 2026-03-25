# Phase 74: Cache and Materialize Derived Data from Previous Seasons - Research

**Researched:** 2026-03-25
**Domain:** PostgreSQL materialization, Kysely query patterns, historical stat caching
**Confidence:** HIGH

## Summary

Phase 74 addresses a specific performance and correctness problem: every daily snapshot run re-computes projected standings from scratch — even for past seasons where all the input data is already immutable. The `StandingsProjectionAgent.computeProjectedStandings()` method re-queries current category totals, current rosters, and player projections each run. For the current season this is correct behavior. For completed seasons (2024 and earlier) the inputs will never change, so recomputing is pure waste.

The fix is a targeted materialization strategy: once a season ends (i.e., its final scoring period has been processed), freeze the final derived tables in place and gate all recomputation behind a "season complete" check. The existing schema already has everything needed — `team_daily_projected_overall`, `team_daily_projected_category`, `team_daily_overall`, `team_daily_category_totals`, and `team_daily_category_ranks` are already written per-snapshot. No new tables are required. The only additions are: (1) a `season_cache` metadata table to record that a season is finalized and skip re-runs, and (2) guard logic in `SnapshotOrchestratorAgent` and `StandingsProjectionAgent` to consult that flag before writing.

The scope is intentionally narrow: previous seasons' per-team-per-day numbers are already stored in the database. The only thing being eliminated is the redundant recomputation of projected standings for closed seasons. The current-season pipeline is unchanged.

**Primary recommendation:** Add a `season_metadata` table with a `is_finalized` boolean, populate it at backfill completion, and add a short-circuit guard in `SnapshotOrchestratorAgent.executeSnapshot()` that skips projected standings recomputation when the season is finalized.

## Project Constraints (from CLAUDE.md)

No CONTEXT.md exists for this phase — no user decisions to copy. The following constraints come from CLAUDE.md and govern all implementation choices:

- **ORM:** Kysely for all DB queries — no raw `pg` queries except in migration files
- **Backend framework:** Fastify 4 — agents accept `db: Kysely<Database>` and optional `logger: Pino.Logger`
- **Migration pattern:** Numbered SQL files in `packages/backend/src/db/migrations/` (next number: 020)
- **Empty array guard:** Always check `array.length > 0` before using `.where("col", "in", array)`
- **Degraded snapshots:** Use `is_degraded` + `degraded_reasons` JSONB array, never fabricate data
- **No secrets in logs:** Never log ESPN cookies or auth headers
- **Agent isolation:** Each agent is an isolated class — agents do not call each other's private methods

## Standard Stack

### Core (already in project — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Kysely | 0.27.2 | Type-safe DB queries | Project standard — all agents use it |
| pg | 8.11.3 | PostgreSQL driver | Project standard |
| Pino | 8.17.2 | Structured logging | Project standard |

### No new dependencies required

This phase is purely backend — new migration SQL + TypeScript guard logic in existing agents. No new npm packages.

## Architecture Patterns

### What "Immutable Historical Data" Means in This Codebase

The `league_daily_snapshot` table stores one row per `(league_id, snapshot_date)`. For a completed 2024 season, there are ~26 weekly snapshot rows. Each snapshot has child rows in:

- `team_daily_category_totals` — accumulated counting stats and rate-stat components
- `team_daily_category_ranks` — roto ranks per category
- `team_daily_overall` — overall roto points and rank
- `team_daily_projected_category` — projected end-of-season category values/ranks
- `team_daily_projected_overall` — projected end-of-season overall points/rank

For a completed season, ALL of these are already written and should never change. The problem is that `SnapshotOrchestratorAgent.executeSnapshot()` currently re-runs `StandingsProjectionAgent.computeProjectedStandings()` whenever `forceFresh=true` is passed (which happens during backfill).

### Recommended Materialization Pattern

**Pattern: Season Finalization Flag**

This is the simplest correct approach for this codebase. Rather than building a complex materialized view system:

1. Add a `season_metadata` table with `(league_id, season)` as primary key and `is_finalized BOOLEAN`
2. At the end of `HistoricalBackfillAgent.backfillSeason()`, set `is_finalized = true` for that `(league_id, season)` pair
3. At the start of `SnapshotOrchestratorAgent.executeSnapshot()`, check `is_finalized` before the standings projection step — if finalized, skip `computeProjectedStandings()`
4. Expose an admin API to reset `is_finalized = false` if a re-run is needed

```
Season finalization check flow:
  executeSnapshot() called
    → look up season_metadata for (leagueId, year)
    → if is_finalized = true AND forceFresh = false: skip computeProjectedStandings()
    → if is_finalized = true AND forceFresh = true: still skip (season is done, no new projections possible)
    → if is_finalized = false or no row: run computeProjectedStandings() as normal
```

**Why not PostgreSQL materialized views?**

Kysely 0.27.x does not support `CREATE MATERIALIZED VIEW` or `REFRESH MATERIALIZED VIEW` natively. Workarounds exist (raw SQL via `sql` tagged template) but the existing data is already materialized in regular tables via the snapshot pipeline. There is nothing to materialize — the data is already there. The problem is the pipeline re-running computation, not missing a read-side cache.

**Why not Redis/in-memory cache?**

The bottleneck is compute work during backfill/snapshot runs, not read latency. The frontend already reads from already-written DB rows. An in-memory cache would not prevent the projection re-runs.

### Recommended Project Structure Changes

```
packages/backend/src/
  db/
    migrations/
      020_add_season_metadata.sql    # New: season_metadata table
    schema.ts                         # New: SeasonMetadata interface
  agents/
    snapshot-orchestrator.ts          # Modified: guard computeProjectedStandings()
    historical-backfill.ts            # Modified: call finalizeSeasonIfComplete()
  api/
    seasons.ts (or admin.ts)          # New or modified: expose finalization endpoint
```

### Pattern 1: Season Metadata Table

```sql
-- 020_add_season_metadata.sql
CREATE TABLE IF NOT EXISTS season_metadata (
  league_id      INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  season         INTEGER NOT NULL,
  is_finalized   BOOLEAN NOT NULL DEFAULT FALSE,
  finalized_at   TIMESTAMP,
  snapshot_count INTEGER,
  PRIMARY KEY (league_id, season)
);
```

### Pattern 2: Guard in SnapshotOrchestratorAgent

```typescript
// In executeSnapshot(), before calling computeProjectedStandings():
const snapshotYear = parseInt(snapshotDate.substring(0, 4), 10);
const seasonMeta = await this.db
  .selectFrom("season_metadata")
  .select("is_finalized")
  .where("league_id", "=", leagueId)
  .where("season", "=", snapshotYear)
  .executeTakeFirst();

if (seasonMeta?.is_finalized) {
  this.logger?.info(
    { leagueId, snapshotDate, season: snapshotYear },
    "Season finalized — skipping projected standings recomputation",
  );
  return; // Skip the whole standings projection step
}
// ... proceed with computeProjectedStandings()
```

### Pattern 3: Finalization at Backfill Completion

```typescript
// In HistoricalBackfillAgent.backfillSeason(), after the loop completes:
async finalizeSeasonIfComplete(
  leagueId: number,
  season: number,
  snapshotCount: number,
): Promise<void> {
  await this.db
    .insertInto("season_metadata")
    .values({
      league_id: leagueId,
      season,
      is_finalized: true,
      finalized_at: new Date(),
      snapshot_count: snapshotCount,
    })
    .onConflict((oc) =>
      oc.columns(["league_id", "season"]).doUpdateSet({
        is_finalized: true,
        finalized_at: new Date(),
        snapshot_count: snapshotCount,
      }),
    )
    .execute();
}
```

### Pattern 4: Kysely Schema Addition

```typescript
// In schema.ts:
export interface SeasonMetadata {
  league_id: number;
  season: number;
  is_finalized: boolean;
  finalized_at: Date | null;
  snapshot_count: number | null;
}

// In Database interface:
season_metadata: SeasonMetadata;
```

### Anti-Patterns to Avoid

- **PostgreSQL MATERIALIZED VIEW:** Kysely doesn't support it natively; the data is already in regular tables — no benefit.
- **Re-implementing the full projection pipeline just to skip it:** The guard pattern is sufficient; don't refactor StandingsProjectionAgent internals.
- **Caching projected standings in Redis:** The projection outputs are already persisted in `team_daily_projected_category` and `team_daily_projected_overall`. Redis would duplicate what's already in Postgres.
- **Wiping and re-populating rows on every backfill re-run:** `StandingsProjectionAgent.rankAndStore()` already DELETEs then re-INSERTs on each call — this is safe but wasteful for past seasons. The fix is skipping the call entirely, not changing the delete pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent upsert | Custom SELECT + INSERT logic | Kysely `.onConflict(...).doUpdateSet()` | Already used throughout codebase |
| Migration tracking | Custom version check | Existing `schema_migrations` + numbered SQL files | Established pattern in this project |
| Season year extraction | String parsing or JS Date gymnastics | `parseInt(snapshotDate.substring(0, 4), 10)` | Simple and already done in backfill agent |

## Common Pitfalls

### Pitfall 1: Guarding With Season Year vs. Season-Complete Signal

**What goes wrong:** Using `snapshotDate < today` as the guard (skipping any past snapshot). This would incorrectly skip recomputing the CURRENT season's snapshots if the app is run on a date after a snapshot date.

**Why it happens:** "Previous season" is confused with "past date."

**How to avoid:** The guard must be `season_metadata.is_finalized = true`, not date arithmetic. Finalization is explicit — set at end of backfill, never set automatically for the current season.

**Warning signs:** If current-season snapshots stop updating projected standings, the guard is misconfigured.

### Pitfall 2: Forgetting forceFresh Handling

**What goes wrong:** The `forceFresh=true` flag bypasses the existing snapshot-exists check in `executeSnapshot()`. If the finalization guard is added only inside the `!forceFresh` branch, forceFresh calls will still re-run projections for finalized seasons.

**How to avoid:** The `is_finalized` guard must be checked independently of the `forceFresh` flag. A finalized season should never have projected standings recomputed regardless of forceFresh.

### Pitfall 3: schema.ts Database interface Out of Sync

**What goes wrong:** Adding `season_metadata` to the migration SQL but forgetting to add it to `Database` in `schema.ts`. Kysely will not complain at runtime — it will simply not type-check queries against that table.

**How to avoid:** Any new migration that adds a table MUST be accompanied by a new interface in `schema.ts` and a new entry in the `Database` interface.

### Pitfall 4: No Reset Path

**What goes wrong:** `is_finalized` is set to true but there's no way to unflag it if a backfill needs to be re-run (e.g., data correction).

**How to avoid:** Add an admin API endpoint (or at minimum a script) that sets `is_finalized = false` for a given `(leagueId, season)`.

### Pitfall 5: Empty IN Clause

**What goes wrong:** Code that collects `playerIds` before the finalization check and passes an empty array to a Kysely `.where("player_id", "in", playerIds)` call.

**Why it happens:** Kysely generates invalid SQL for `WHERE col IN ()`.

**How to avoid:** This is an existing project rule — always check `array.length > 0` before using `.where("col", "in", array)`. The finalization guard eliminates the code path entirely for past seasons, but any new query code must still follow this rule.

## Code Examples

### Migration 020 Pattern (follows existing convention)

```sql
-- 020_add_season_metadata.sql
-- Phase 74: Season finalization flag to skip projection recomputation for completed seasons

CREATE TABLE IF NOT EXISTS season_metadata (
  league_id      INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  season         INTEGER NOT NULL,
  is_finalized   BOOLEAN NOT NULL DEFAULT FALSE,
  finalized_at   TIMESTAMP,
  snapshot_count INTEGER,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (league_id, season)
);

CREATE INDEX IF NOT EXISTS idx_season_metadata_league
  ON season_metadata (league_id, season);

COMMENT ON TABLE season_metadata IS
  'Tracks finalized seasons where projection recomputation is skipped';
```

### Kysely Upsert Pattern (consistent with rest of codebase)

```typescript
// Source: existing usage in projections-ingest.ts and snapshot-orchestrator.ts
await this.db
  .insertInto("season_metadata")
  .values({
    league_id: leagueId,
    season,
    is_finalized: true,
    finalized_at: new Date(),
    snapshot_count: weeksProcessed,
  })
  .onConflict((oc) =>
    oc.columns(["league_id", "season"]).doUpdateSet({
      is_finalized: true,
      finalized_at: new Date(),
      snapshot_count: weeksProcessed,
    }),
  )
  .execute();
```

### Backfill Completion Hook Point

In `historical-backfill.ts`, the correct insertion point for `finalizeSeasonIfComplete()` is after the `for (let week = startWeek; week <= endWeek; week++)` loop completes without throwing, before the function returns `BackfillResult`. The `weeksProcessed` count is already available in scope.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Re-run all projections on every backfill pass | Finalization guard skips closed seasons | Phase 74 | Backfill re-runs become idempotent no-ops for past seasons |
| No season completion tracking | `season_metadata.is_finalized` flag | Phase 74 | Explicit control over which seasons are mutable |

## Open Questions

1. **Should the current season also be finalized at season end?**
   - What we know: The season ends in late September; after that, no new ESPN data. The 2024 backfill is presumably complete.
   - What's unclear: Is there a trigger to auto-finalize when the last scoring period is reached, or is it always manual?
   - Recommendation: Keep finalization manual (explicit admin action or end-of-backfill hook). Do not auto-detect season end from ESPN data — that adds scope.

2. **Should projected standings be deleted for finalized seasons, or kept as-is?**
   - What we know: `team_daily_projected_overall` and `team_daily_projected_category` exist for completed seasons and reflect the final projected state from the last snapshot run.
   - What's unclear: For a fully completed season, the "projected" final values equal the actual final values. Are these rows still useful, or should they be replaced with actual values?
   - Recommendation: Keep existing rows as-is. They represent what the model projected at each point in time — that's historically valuable. Do not delete.

3. **What's the migration number?**
   - What we know: Last migration is 019 (`019_add_team_faab_spent.sql`).
   - Answer: Next migration is `020_add_season_metadata.sql`.

## Environment Availability

Step 2.6: SKIPPED — This phase is purely code/config changes in the backend. The PostgreSQL instance and Kysely stack are already in use by all other agents. No external dependencies beyond what's already installed.

## Validation Architecture

No `workflow.nyquist_validation` key is present in `.planning/config.json`, so treat as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 1.1.1 |
| Config file | `packages/backend/` (vitest default config, no explicit file found) |
| Quick run command | `pnpm --filter @espn-fantasy/backend test` |
| Full suite command | `pnpm --filter @espn-fantasy/backend test` |

### Phase Requirements → Test Map

No phase requirement IDs were provided. The following behaviors should be tested:

| Behavior | Test Type | Automated Command | Notes |
|----------|-----------|-------------------|-------|
| `season_metadata` table created by migration | Integration | Manual — run migration, check schema | No automated schema assertion tests |
| Guard skips projection recompute for finalized seasons | Unit | `pnpm --filter @espn-fantasy/backend test` | Mock DB; assert `computeProjectedStandings` not called when `is_finalized=true` |
| Guard runs projection for non-finalized seasons | Unit | `pnpm --filter @espn-fantasy/backend test` | Baseline test |
| Backfill sets `is_finalized=true` on completion | Unit | `pnpm --filter @espn-fantasy/backend test` | Assert upsert called with correct args |
| `forceFresh=true` does NOT bypass finalization guard | Unit | `pnpm --filter @espn-fantasy/backend test` | Regression guard |

### Wave 0 Gaps

Existing agent tests (if any) in `packages/backend/src/agents/__tests__/` may need new test cases. No new test files are needed — new test cases can be added to existing snapshot orchestrator and backfill test files.

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `packages/backend/src/agents/snapshot-orchestrator.ts` — guard insertion point identified
- Direct code inspection: `packages/backend/src/agents/historical-backfill.ts` — backfill completion hook identified
- Direct code inspection: `packages/backend/src/agents/standings-projection.ts` — confirmed `rankAndStore()` does DELETE+INSERT
- Direct code inspection: `packages/backend/src/db/migrations/` — confirmed next migration is 020
- Direct code inspection: `packages/backend/src/db/schema.ts` — confirmed schema pattern for new table interface
- Direct code inspection: `packages/backend/package.json` — Kysely 0.27.2 confirmed, no MATERIALIZED VIEW support needed

### Secondary (MEDIUM confidence)
- Kysely 0.27 API patterns: observed from existing code in `projections-ingest.ts`, `snapshot-orchestrator.ts`, `transaction-impact.ts` — `.onConflict().doUpdateSet()` is consistent pattern

## Metadata

**Confidence breakdown:**
- Guard pattern: HIGH — code paths confirmed by direct inspection of snapshot-orchestrator.ts and historical-backfill.ts
- Migration pattern: HIGH — follows identical pattern of 19 existing migrations
- Kysely upsert: HIGH — pattern verified from 5+ existing call sites in the codebase
- Scope (no new npm deps): HIGH — purely additive TypeScript + SQL changes

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable domain — no external APIs or fast-moving libraries involved)
