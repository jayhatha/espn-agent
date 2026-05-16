# Phase 90: SnapshotRepository Centralization - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Create a `SnapshotRepository` module at `packages/backend/src/db/snapshot-repository.ts` that centralizes the 5+ duplicated Kysely query patterns across agents and views. All agents and views that currently write raw `team_roster_snapshot → player` joins or scattered projection/settings queries will call SnapshotRepository methods instead.

Files that currently duplicate queries (to be updated):

- `packages/backend/src/agents/standings-projection.ts` — bulk league roster + category totals queries
- `packages/backend/src/agents/waiver-recommendation.ts` — roster query, projection queries
- `packages/backend/src/agents/trade-recommendation.ts` — roster queries, settings queries, projection queries
- `packages/backend/src/api/views/free-agent-view.ts` — roster/projection queries
- `packages/backend/src/api/views/trade-view.ts` — dual team roster queries

</domain>

<decisions>
## Implementation Decisions

### Module Location and Interface

- File: `packages/backend/src/db/snapshot-repository.ts`
- Class: `SnapshotRepository`, constructor: `constructor(private db: Kysely<Database>)`
- No logger dependency — pure data access
- All methods return typed arrays using existing schema types

### Methods to Create (minimum viable set)

- `getRosterForSnapshot(leagueId: number, snapshotDate: string, teamId?: number): Promise<RosterRow[]>` — returns `team_roster_snapshot` joined with `player`, optional teamId filter
- `getLeagueCategoryTotals(leagueId: number, snapshotDate: string): Promise<CategoryTotalsRow[]>` — returns all `team_daily_category_totals` for a league+date
- `getPlayerProjections(projectionsRunId: number, playerIds?: number[]): Promise<PlayerProjectionRow[]>` — returns `player_projection` rows, optional player filter (guard: skip WHERE IN if playerIds empty)
- `getLeagueSettings(leagueId: number): Promise<LeagueSettingsRow | null>` — returns latest `league_settings_version` for a league
- `getLatestSnapshot(leagueId: number): Promise<SnapshotRow | null>` — returns most recent `league_daily_snapshot`

### Return Types

- Use inline inferred types from Kysely (`.select(...).execute()` return type) — do NOT define redundant interfaces just for this module
- Export the class only; do not export separate interfaces unless they're already needed by callers

### Caller Updates

- Replace raw Kysely queries with SnapshotRepository calls in all 5 files listed above
- Agent constructors gain `private repo: SnapshotRepository` (constructed from `this.db`)
- Views construct repo inline in their methods or receive it via constructor

### the agent's Discretion

- Whether SnapshotRepository is constructed by agents internally (from their db) or injected
- Exact Kysely select columns in each method (match what existing callers select)

</decisions>

<code_context>

## Existing Code Insights

### Reusable Assets

- `packages/backend/src/db/schema.ts` — full Kysely schema types for all 20+ tables
- `packages/backend/src/db/connection.ts` — `getDb()` factory
- Existing Kysely query patterns in agents/views to extract exact column lists from

### Established Patterns

- Kysely `selectFrom().innerJoin().select().where().execute()` pattern used throughout
- Empty array guard: always check `array.length > 0` before `WHERE col IN (array)` — critical for getPlayerProjections
- `.executeTakeFirst()` for single-row queries (getLeagueSettings, getLatestSnapshot)

### Integration Points

- `StandingsProjectionAgent` — bulk fetches all rosters + category totals for entire league in parallel
- `WaiverRecommendationAgent` — queries roster for specific team, player projections for candidates
- `TradeRecommendationAgent` — dual team roster queries, league settings, player projections
- `FreeAgentView` — roster + projection queries
- `TradeView` — side-by-side roster queries for two teams

</code_context>

<specifics>
## Specific Ideas

No specific requirements — pattern extraction with no behavior changes.

</specifics>

<deferred>
## Deferred Ideas

- Transaction repository (league_transaction_event queries) — separate concern
- Time-series query helpers — separate concern

</deferred>
