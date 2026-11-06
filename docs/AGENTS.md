<!-- generated-by: gsd-doc-writer -->

# Agent Architecture Guide

This document describes every backend agent in `packages/backend/src/agents/` and the ESPN adapter in `packages/backend/src/adapters/espn.ts`. For each, it covers purpose, constructor, key methods, inputs, outputs, dependencies, and known gaps.

---

## Table of Contents

1. [ESPNAdapter](#1-espnadapter)
2. [SnapshotOrchestratorAgent](#2-snapshotorchestratoragent)
3. [LivePollAgent](#3-livepollagent)
4. [StandingsProjectionAgent](#4-standingsprojectionagent)
5. [StandingsChangeLogAgent](#5-standingschangelogagent)
6. [ProjectionsIngestAgent](#6-projectionsingestagent)
7. [PlayerIdentityResolutionAgent](#7-playeridentityresolutionagent)
8. [WaiverRecommendationAgent](#8-waiverrecommendationagent)
9. [TradeRecommendationAgent](#9-traderecommendationagent)
10. [TransactionImpactAgent](#10-transactionimpactagent)
11. [PlayerPoolSyncAgent](#11-playerpoolsyncagent)
12. [HistoricalBackfillAgent](#12-historicalbackfillagent)
13. [GsPacingAgent](#13-gspacingagent)
14. [FaabTrackerAgent](#14-faabtrackeragent)
15. [DraftRankingsAgent](#15-draftrankingsagent)
16. [AuctionValuationAgent](#16-auctionvaluationagent)
17. [MorningReportAgent](#17-morningreportagent)
18. [StandingsSwingAttributionAgent](#18-standingsswingattributionagent)
19. [StreamingPitcherAgent](#19-streamingpitcheragent)
20. [SitStartAdvisorAgent](#20-sitstartadvisoragent)
21. [LineupOptimizerAgent](#21-lineupoptimizeragent)
22. [DraftNarratorAgent](#22-draftnarratoragent)

- [Shared Utilities](#shared-utilities)
- [BullMQ Workers](#bullmq-workers)

---

## Design Principles

All agents follow a common set of conventions:

- **Constructor inputs**: `db: Kysely<Database>` + optional `logger?: BaseLogger` (Pino).
- **Single responsibility**: each agent has one clear job.
- **Degraded outputs**: agents set `is_degraded = true` and populate `degraded_reasons` when data is incomplete — they never fabricate numbers.
- **Secret hygiene**: no agent logs ESPN cookies, auth headers, or encryption keys.
- **Empty-array guard**: `WHERE col IN (...)` is only issued after checking `array.length > 0` to avoid Kysely generating invalid SQL.

---

## 1. ESPNAdapter

**File:** `packages/backend/src/adapters/espn.ts`

### Purpose

Fetches raw ESPN Fantasy Baseball API responses, validates schema shape, computes schema fingerprints, and normalizes responses into canonical TypeScript models.

### Constructor

```ts
new ESPNAdapter(logger?: BaseLogger)
```

Internally creates a retryable Axios client (`createRetryableAxios`) configured with:

- Base URL: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb`
- 30-second timeout
- LRU cache (2000 entries, 1-hour TTL)
- Repeated-param serializer (`view=mTeam&view=mRoster` style)
- Global `espnThrottle` — serializes all outbound requests through `p-limit(1)` with a minimum 2-second gap between calls.

### Key Methods

#### `fetchLeague(options: ESPNFetchOptions): Promise<ESPNRawResponse>`

Fetches a current-season league payload. `ESPNFetchOptions` includes `leagueId`, `season`, optional `auth` (SWID + espn_s2 cookies), `views` array, `scoringPeriodId`, and `xFantasyFilter`. Sets a `Cookie` header for private leagues. Validates the response against `ESPNLeagueResponseSchema` (Zod) and calls `assertEspnCriticalShape` to verify required fields exist before returning.

#### `fetchHistoricalWeek(options): Promise<ESPNRawResponse>`

Fetches a specific scoring period with a `filterStatsForSplitTypeIds: [5]` and `filterStatsForExternalIds: [scoringPeriodId]` x-fantasy-filter to get per-period player stats rather than season totals. Enforces a 2-second instance-level throttle.

#### `fetchFreeAgents(options): Promise<ESPNRawResponse>`

Fetches the free-agent pool using the `kona_player_info` view. Validates against `ESPNFreeAgentsResponseSchema`.

#### `getFinalScoringPeriod(season: number): Promise<number | undefined>`

Calls the season-level game API (`/seasons/{season}`) to retrieve `currentScoringPeriod.id` — used by backfill to bound the historical loop.

#### `normalizeLeagueData(raw: Record<string, unknown>): ESPNLeagueData`

Transforms the raw ESPN JSON into `ESPNLeagueData` with typed `settings`, `teams` (with rosters), `standings`, `freeAgents`, and `transactions`. Uses `ESPN_STAT_MAP`, `ESPN_LINEUP_SLOT_MAP`, and `ESPN_PRO_TEAM_MAP` lookup tables to translate ESPN integer IDs to canonical string keys.

### Inputs

- ESPN Fantasy Baseball REST API (external)
- `ESPNAuthCookies` (`SWID`, `espn_s2`) for private league access

### Outputs

- `ESPNRawResponse` — `{ data, schemaFingerprint, fetchedAt }` (not persisted here)
- `ESPNLeagueData` — normalized in-memory structure consumed by downstream agents

### Dependencies

- `utils/retry.ts` — `createRetryableAxios` (axios-retry with Retry-After backoff for 429s)
- `utils/espn-schemas.ts` — Zod schemas + `validateEspnResponse`, `assertEspnCriticalShape`, `logUnexpectedFields`

### Known Gaps

- No retry/backoff at the module level (relies on axios-retry at the HTTP layer only).
- LRU cache is in-process memory — not shared across worker processes.
- No activity feed parsing — `transactions` field in `ESPNLeagueData` is a stub.

---

## 2. SnapshotOrchestratorAgent

**File:** `packages/backend/src/agents/snapshot-orchestrator.ts`

### Purpose

Orchestrates the daily snapshot pipeline: fetch live ESPN data → archive raw payload → normalize → write to snapshot tables → compute projected standings → generate change-log events.

### Constructor

```ts
new SnapshotOrchestratorAgent(db: Kysely<Database>, logger?: BaseLogger)
```

Internally constructs `ESPNAdapter` and `StandingsProjectionAgent`.

### Key Methods

#### `executeSnapshot(options: SnapshotJobOptions): Promise<void>`

`SnapshotJobOptions`: `{ leagueId, snapshotDate, espnAuth?, forceFresh? }`.

Steps executed in order:

1. Skip if snapshot already exists (unless `forceFresh`).
2. Fetch ESPN data via `ESPNAdapter.fetchLeague` (views: `mSettings`, `mTeam`, `mRoster`, `mStandings`, `kona_player_info`).
3. Archive raw payload to `league_raw_payload` with schema fingerprint.
4. Normalize with `ESPNAdapter.normalizeLeagueData`.
5. Resolve or create `league_settings_version` record.
6. Find most recent `projections_run`; mark snapshot as degraded if missing or stale.
7. Within a DB transaction: upsert `league_daily_snapshot`, upsert teams, write players + rosters, write free agent players, write current category totals/ranks/overall, write per-player period stats (`player_period_stat` via `writePlayerPeriodStats`).
8. Call `StandingsProjectionAgent.computeProjectedStandings` (only when a projections run exists).
9. Call `StandingsChangeLogAgent.generateEvents` and emit `CHANGE_LOG_EVENT` on `changeLogEmitter` (non-blocking — errors here do not fail the snapshot).

### Inputs

- `league` table (DB)
- ESPN API (via `ESPNAdapter`)
- `projections_run` table (DB) — determines degraded status

### Outputs

- `league_raw_payload` — raw ESPN JSON + schema fingerprint
- `league_daily_snapshot` — one row per (league, date)
- `team` — upserted from ESPN data
- `player` — upserted from ESPN roster entries
- `team_roster_snapshot` — per-player per-team roster row
- `league_free_agent_snapshot` — free agents observed in this snapshot
- `team_daily_category_totals` — raw stat totals per team per category
- `team_daily_category_ranks` — rank within league per category
- `team_daily_overall` — total roto points + overall rank
- `player_period_stat` — per-player per-period counting stats
- `changeLogEmitter` — emits `standings_change` event if change-log events were generated

### Dependencies

- `ESPNAdapter`
- `StandingsProjectionAgent`
- `StandingsChangeLogAgent`
- `utils/change-log-emitter.ts` — `changeLogEmitter`, `CHANGE_LOG_EVENT`
- `utils/roto-ranking.ts` — `assignRanksWithTies`
- `utils/notification-bus.ts` — `createNotificationBus`

### Known Gaps

- Transaction ingestion from ESPN is not implemented (no `league_transaction_event` writes during snapshot).

---

## 3. LivePollAgent

**File:** `packages/backend/src/agents/live-poll.ts`

### Purpose

Refreshes live standings from ESPN every 15 minutes during MLB game hours (1 pm–midnight ET), updating today's category/rank/overall tables without a full snapshot, and emits live-poll change events.

### Constructor

```ts
new LivePollAgent(db: Kysely<Database>, logger?: BaseLogger)
```

Internally constructs `ESPNAdapter` and `StandingsProjectionAgent`.

### Key Methods

#### `static isGameWindow(): boolean`

Returns `true` when the current UTC hour is ≥ 17 or < 4 (corresponding to 1 pm–midnight EDT).

#### `refresh(leagueId: number, today: string): Promise<number>`

Steps:

1. Load `league` from DB.
2. Fetch ESPN with lightweight views only (`mSettings`, `mTeam`, `mStandings`) — no rosters or free agents.
3. Build ESPN team ID → DB team ID map.
4. Resolve most recent `league_settings_version` and `projections_run`.
5. For each team, upsert `team_daily_category_totals`, `team_daily_category_ranks`, and `team_daily_overall` using live stat values from ESPN.
6. Call `StandingsProjectionAgent.computeProjectedStandings` to refresh projected standings.
7. Call `StandingsChangeLogAgent.generateEvents` and emit `LIVE_POLL_EVENT` on `changeLogEmitter`.
8. Return the number of change events generated.

### Inputs

- `league` table (DB)
- ESPN API — `mSettings`, `mTeam`, `mStandings` views only
- `league_settings_version`, `projections_run` (DB)

### Outputs

- `team_daily_category_totals` — upserted with live values
- `team_daily_category_ranks` — upserted
- `team_daily_overall` — upserted
- `team_daily_projected_category`, `team_daily_projected_overall` — refreshed via `StandingsProjectionAgent`
- `changeLogEmitter` — emits `live_poll` event with `{ leagueId, polledAt, eventCount }`

### Dependencies

- `ESPNAdapter`
- `StandingsProjectionAgent`
- `StandingsChangeLogAgent`
- `utils/change-log-emitter.ts` — `changeLogEmitter`, `LIVE_POLL_EVENT`
- `utils/roto-ranking.ts` — `assignRanksWithTies`
- `utils/espn-env.ts` — `getEspnAuthFromEnv`

### Known Gaps

- No roster update during live poll — `team_roster_snapshot` is not refreshed (uses today's morning snapshot).
- If today's morning snapshot has not run yet, `team_daily_category_totals` for `today` may not exist and the upsert creates rows without a backing `league_daily_snapshot`.

---

## 4. StandingsProjectionAgent

**File:** `packages/backend/src/agents/standings-projection.ts`

### Purpose

Computes projected end-of-season standings by combining each team's current YTD stat totals with rest-of-season player projections, using component-based math for all rate stats.

### Constructor

```ts
new StandingsProjectionAgent(db: Kysely<Database>, logger?: BaseLogger)
```

### Key Methods

#### `computeProjectedStandings(leagueId, snapshotDate, projectionsRunId): Promise<void>`

1. Load `league_daily_snapshot` + `league_settings_version` (categories, roster slots).
2. Fetch all teams for the league.
3. In parallel: resolve `projectionAsOfDate`, GS cap, latest raw ESPN payload (for GS-used extraction), and team ESPN IDs.
4. Extract GS used per team from the raw ESPN payload (`valuesByStat[33]`) — zero extra queries.
5. Call `computeTeamProjection` for all teams in parallel.
6. Call `rankAndStore` to rank teams by category and persist results.

#### `computeTeamProjection(leagueId, snapshotDate, teamId, ...): Promise<TeamProjection>`

1. In parallel: fetch `team_daily_category_totals` and `team_roster_snapshot`.
2. Fetch `player_projection` for all rostered players (guarded by empty-array check).
3. Build a `RosteredPlayer[]` + `projectionsByPlayerId` map and pass to `allocateProjections`.
4. `allocateProjections` applies lineup constraints, GS cap scaling, and staleness proration.
5. Combine allocated projections with current YTD components per category using `combineComponents` + `calculateFinalRate` from `shared/formulas.ts`.
6. Optionally compute confidence intervals via `computeRateConfidence` (variance module).

### Inputs

- `league_daily_snapshot`, `league_settings_version` (DB)
- `team`, `team_daily_category_totals`, `team_roster_snapshot`, `player_projection` (DB)
- `league_raw_payload` — single latest payload for GS extraction
- `projections_run` — determines `projectionAsOfDate`

### Outputs

- `team_daily_projected_category` — one row per (team, category, date) with `projected_value`, `projected_rank`, `roto_points`, `is_degraded`, `confidence_interval_json`
- `team_daily_projected_overall` — one row per (team, date) with `projected_overall_points`, `projected_overall_rank`

### Dependencies

- `projection/allocator.ts` — `allocateProjections` (lineup constraint + GS cap + prorate)
- `projection/variance.ts` — `computeRateConfidence`
- `utils/roto-ranking.ts` — `assignRanksWithTies`
- `shared/formulas.ts` — `combineComponents`, `calculateFinalRate`

### Known Gaps

- Rate stat projection quality depends on accurate component totals in `team_daily_category_totals` — if that table is missing or degraded, projections use only RoS components (still valid, but less accurate intra-season).
- GS cap is read from `league_settings_version.settings_json` and falls back to a hardcoded `DEFAULT_GS_CAP = 200` if not configured.

---

## 5. StandingsChangeLogAgent

**File:** `packages/backend/src/agents/standings-change-log.ts`

### Purpose

Compares projected category values between the two most recent snapshots and emits `StandingsChangeEventPayload` records whenever a team's projected rank in any category changes.

### Constructor

```ts
new StandingsChangeLogAgent(
  db: Kysely<Database>,
  logger: BaseLogger,
  bus: NotificationBus,
)
```

Note: `logger` is required (not optional), and a `NotificationBus` must be provided.

### Key Methods

#### `generateEvents(leagueId, snapshotDate): Promise<number>`

1. Find the two most recent `league_daily_snapshot` rows.
2. Fetch `team_daily_projected_category` for both dates.
3. Fetch teams and latest `league_settings_version` (for category direction and display names).
4. For each category: re-rank all teams at both dates using `assignRanksWithTies`; emit a `StandingsChangeEventPayload` via `bus.publish` for any team whose rank changed.
5. Returns the count of events emitted.

### Inputs

- `league_daily_snapshot` — to find prev/curr dates
- `team_daily_projected_category` — projected values for both dates
- `team` — team names
- `league_settings_version` — category direction (HIGHER_BETTER / LOWER_BETTER)

### Outputs

- Events published to `NotificationBus` (in-process SSE fan-out or future Redis pub/sub)
- Return value: number of change events generated (used by caller to decide whether to emit `changeLogEmitter`)

### Dependencies

- `utils/notification-bus.ts` — `NotificationBus`
- `utils/roto-ranking.ts` — `assignRanksWithTies`

### Known Gaps

- Only compares projected category values — does not track changes in actual (YTD) standings.
- Silently returns 0 if fewer than 2 snapshots exist for the league.

---

## 6. ProjectionsIngestAgent

**File:** `packages/backend/src/agents/projections-ingest.ts`

### Purpose

Parses FanGraphs Depth Charts Rest-of-Season CSV uploads and persists them as `projections_run` + `player_projection` rows. Marks the run `fresh` once both batters and pitchers files are uploaded for the same date.

### Constructor

```ts
new ProjectionsIngestAgent(db: Kysely<Database>, logger?: BaseLogger)
```

Internally constructs `PlayerIdentityResolutionAgent`.

### Key Methods

#### `ingest(options: IngestOptions): Promise<{ projectionsRunId, battersReport?, pitchersReport? }>`

`IngestOptions`: `{ battersCsv?, pitchersCsv?, asOfDate, leagueId? }`.

1. Upsert a `projections_run` row for `(source='fangraphs', system='depth_charts_ros', as_of_date)`.
2. If `battersCsv` provided: parse CSV, match each player via `matchPlayer`, build `ProjectionRow[]`, deduplicate, bulk-upsert to `player_projection`.
3. If `pitchersCsv` provided: same flow.
4. If both files present, update `projections_run.staleness = 'fresh'`.
5. Returns validation reports with `rowsParsed`, `unmatchedPlayers`, `mappingCoverage`, and `matchStats`.

**Required batter columns:** `AB`, `H`, `R`, `HR`, `RBI`, `SB`, `BB`, `HBP`, `SF`, `TB`.
**Required pitcher columns:** `IP`, `ER`, `H`, `BB`, `K`, `W`, `SV`. Optional: `HLD`, `QS`.

#### `matchPlayer(playerName, team?, positions?): Promise<{ playerId, matchType } | null>`

1. Look up existing `player_identity_map` by `fangraphs_key` (normalized name, lowercase alpha only).
2. If no cached mapping, call `PlayerIdentityResolutionAgent.findBestMatch`.
3. Reject fuzzy matches below `FUZZY_MATCH_CONFIDENCE_THRESHOLD = 0.95`.
4. Store new mappings in `player_identity_map` with `onConflict doUpdateSet`.

### Inputs

- CSV strings (in-memory, from HTTP upload)
- `projections_run` table — for idempotent run lookup
- `player_identity_map` table — cached name-to-ID mappings
- `player` table — candidate list for fuzzy matching (via `PlayerIdentityResolutionAgent`)

### Outputs

- `projections_run` — one row per (source, system, as_of_date)
- `player_projection` — one row per (projections_run_id, player_id) with `stat_components_json`
- `player_identity_map` — new entries for any newly resolved players

### Dependencies

- `PlayerIdentityResolutionAgent` — for fuzzy name matching
- `csv-parse/sync` — CSV parsing

### Known Gaps

- Name matching uses `NameASCII` column (preferred) then `Name`; players with non-ASCII names that lack `NameASCII` may fail to match.
- The `FUZZY_MATCH_CONFIDENCE_THRESHOLD` was raised to 0.95 after finding the character-overlap algorithm matched completely unrelated names (e.g., "Jared Young" → Aaron Judge) at 0.80+.
- No validation that CSV stat columns are numeric — non-numeric values silently produce `NaN`, which is sanitized to 0 by `sanitizeStats`.

---

## 7. PlayerIdentityResolutionAgent

**File:** `packages/backend/src/agents/player-identity.ts`

### Purpose

Matches FanGraphs player names to internal `player` table IDs using fuzzy name matching with team and position boosting.

### Constructor

```ts
new PlayerIdentityResolutionAgent(db: Kysely<Database>, logger?: BaseLogger)
```

### Key Methods

#### `resolvePlayer(espnPlayerId, fangraphsKey, options?): Promise<void>`

Looks up a player by `espnPlayerId`, computes a confidence score using `fuzzyNameMatch` + team/position checks, and upserts a `player_identity_map` row.

#### `findBestMatch(fangraphsKey, playerName, team?, positions?): Promise<PlayerMatchCandidate | null>`

1. Query all players (filtered by `team` if provided).
2. Score each candidate with `fuzzyNameMatch` (custom character-set overlap + Levenshtein).
3. Boost by 1.1× if team matches, 1.05× if position overlaps.
4. Return the highest-scoring candidate capped at confidence 1.0.
5. Method is `"exact_match"` if confidence ≥ 0.95, `"fuzzy_match"` otherwise.

#### `fuzzyNameMatch(a, b): number` (private)

Computes a score in [0, 1] using character-set overlap. Higher values = closer match.

### Inputs

- `player` table — full scan (optionally filtered by `mlb_team`)

### Outputs

- `player_identity_map` — `{ player_id, fangraphs_key, confidence, resolution_method, updated_at }`

### Dependencies

- None (leaf agent)

### Known Gaps

- `findBestMatch` scans the entire `player` table when no team filter is provided — may be slow for large player pools.
- Character-set overlap algorithm is too permissive at low thresholds (see `ProjectionsIngestAgent` threshold note above).
- Currently disconnected from ESPN sync flow — `resolvePlayer` is only called if another agent explicitly invokes it.

---

## 8. WaiverRecommendationAgent

**File:** `packages/backend/src/agents/waiver-recommendation.ts`

### Purpose

Recommends add/drop waiver moves that maximize a team's projected overall roto-points improvement.

### Constructor

```ts
new WaiverRecommendationAgent(
  db: Kysely<Database>,
  standingsAgent: StandingsProjectionAgent, // reserved; currently @ts-expect-error unused
  espnAdapter: ESPNAdapter,
  logger?: BaseLogger,
)
```

### Key Methods

#### `getRecommendations(leagueId, teamId, snapshotDate, options?): Promise<WaiverRecommendation[]>`

`options`: `{ maxRecommendations?, freeAgentPlayerIds? }`.

**Free-agent resolution (four-tier fallback):**

1. Use caller-provided `freeAgentPlayerIds` if given.
2. Query `league_free_agent_snapshot` for the snapshot date.
3. Parse from latest `league_raw_payload` via `ESPNAdapter.normalizeLeagueData`.
4. Fall back to projection-based inference: all players in `player_projection` not on any team's roster.

**Recommendation loop:**
For each (add candidate, drop candidate) pair:

- Simulate the roster swap using `allocateProjections` to get per-category projected deltas.
- Score with `calculateFinalRate` for rate stat categories.
- Check roster slot legality via `canFillSlot`.
- Rank candidates by `deltaOverallPoints`.

Returns top `maxRecommendations` (default 10) `WaiverRecommendation` objects with `categoryImpacts`, `explanation`, `isLegal`, and detected `rosterGaps`.

### Inputs

- `team_roster_snapshot`, `league_free_agent_snapshot`, `league_raw_payload` (DB)
- `player_projection`, `league_settings_version`, `team_daily_projected_overall` (DB)
- ESPN API (via `ESPNAdapter.normalizeLeagueData`) for free-agent fallback

### Outputs

- In-memory `WaiverRecommendation[]` — not persisted

### Dependencies

- `ESPNAdapter` — free-agent fallback parsing
- `StandingsProjectionAgent` — reserved, not actively called
- `projection/allocator.ts` — `allocateProjections`
- `projection/slot-eligibility.ts` — `canFillSlot`

### Known Gaps

- `StandingsProjectionAgent` is passed in but never called (annotated `@ts-expect-error reserved for future standings-based scoring`).

---

## 9. TradeRecommendationAgent

**File:** `packages/backend/src/agents/trade-recommendation.ts`

### Purpose

Analyzes proposed trades and generates ranked 1-for-1 (and 2-for-2) trade candidates based on projected standings impact, roster legality, and positional context.

### Constructor

```ts
new TradeRecommendationAgent(db: Kysely<Database>, logger?: BaseLogger)
```

### Key Methods

#### `static validateTradeSize(trade: ProposedTrade): { valid, error? }`

Validates 1–3 players per side.

#### `validateRosterSlots(leagueId, teamId, snapshotDate, trade): Promise<RosterValidationResult>`

Simulates the post-trade roster and checks that all required position slots can still be filled.

#### `analyzeTradeImpact(leagueId, teamId, snapshotDate, trade): Promise<TradeImpactAnalysis>`

1. Fetch current roster, league settings, projections run, and current projected overall points.
2. Simulate swapping projections (give players → removed, receive players → added).
3. Run `allocateProjections` on the hypothetical post-trade roster.
4. Compute `CategoryImpact[]` with `currentValue`, `projectedValue`, `deltaRank`, `deltaPoints`.
5. Compute a `fairnessScore` in [−1, 1].
6. Return `recommendation: "accept" | "decline" | "consider"` with an explanation.

#### `getTradeRecommendations(leagueId, teamId, snapshotDate, options?): Promise<TradeCandidate[]>`

1. Get all partner teams.
2. For each partner team, build the candidate player pool.
3. Evaluate 1-for-1 pairs (and optionally 2-for-2) using `analyzeTradeImpact`.
4. Attach positional context (position gained/lost, fill-need flag, positional bonus from `POSITION_SCARCITY` map).
5. Sort by `deltaOverallPoints` descending; return top candidates.

### Inputs

- `team_roster_snapshot`, `player`, `player_projection` (DB)
- `league_settings_version`, `team_daily_projected_overall`, `team_daily_projected_category` (DB)
- `team` — all league teams for partner enumeration

### Outputs

- In-memory `TradeImpactAnalysis` or `TradeCandidate[]` — not persisted

### Dependencies

- `projection/allocator.ts` — `allocateProjections`
- `projection/slot-eligibility.ts` — `canFillSlot`
- `shared/formulas.ts` — `calculateFinalRate`

### Known Gaps

- `POSITION_SCARCITY` multipliers are hardcoded constants, not derived from live league data.

---

## 10. TransactionImpactAgent

**File:** `packages/backend/src/agents/transaction-impact.ts`

### Purpose

Derives roster moves from weekly snapshot diffs (add, drop, trade, draft) and computes the counterfactual roto-points impact for each move.

### Constructor

```ts
new TransactionImpactAgent(db: Kysely<Database>, logger?: BaseLogger)
```

### Key Methods

#### `deriveRosterMoves(leagueId, season): Promise<number>`

1. Fetch all distinct snapshot dates for the season.
2. First date: all players are `"draft"` moves — batch insert.
3. Subsequent dates: diff adjacent snapshots to classify players appearing as `"add"` and disappearing as `"drop"`; if a player moved from team A to team B in the same week, reclassify as `"TRADE_IN"` / `"TRADE_OUT"`.
4. Clears existing `roster_move` rows for the league before re-deriving (idempotent).
5. Returns total move count.

#### `computeMoveImpact(leagueId, moveId): Promise<MoveImpactResult>`

Computes what roto points a team gained or lost as a result of a single roster move, using `assignRanksWithTies` + `computeOverallRotoPoints` against the counterfactual roster.

### Inputs

- `team_roster_snapshot` — diffs between adjacent snapshot dates
- `team_daily_category_totals`, `player_projection` (DB)
- `league_settings_version` — category configs

### Outputs

- `roster_move` table — one row per derived move
- In-memory `MoveImpactResult` — not persisted by default

### Dependencies

- `utils/roto-ranking.ts` — `assignRanksWithTies`, `computeOverallRotoPoints`
- `shared/formulas.ts` — `calculateFinalRate`

### Known Gaps

- Trade detection is heuristic (same player, different team, same week) — multi-team trades and conditional trades may be misclassified.

---

## 11. PlayerPoolSyncAgent

**File:** `packages/backend/src/agents/player-pool-sync.ts`

### Purpose

Syncs the ESPN player universe (top ~1500 players by ownership) to the local `player` table, including current season stats and ownership percentages. Runs daily at 4 AM ET.

### Constructor

```ts
new PlayerPoolSyncAgent(
  db: Kysely<Database>,
  espnAdapter: ESPNAdapter,
  logger?: BaseLogger,
)
```

### Key Methods

#### `syncPlayerPool(season: number): Promise<SyncResult>`

1. Find any connected league for the season (uses the first one ordered by `created_at`).
2. Resolve ESPN auth: env vars first, then decrypt credentials from DB (`espn_swid_encrypted`, `espn_s2_encrypted`) using `ENCRYPTION_KEY`.
3. Fetch via `ESPNAdapter.fetchLeague` with the `kona_player_info` view and `xFantasyFilter` for top players sorted by `pctOwned`.
4. Parse `ESPN_STAT_MAP`-keyed stats and compute `espn_asv` (Average Season Value).
5. Bulk-upsert to `player` table on `espn_player_id` conflict.
6. Returns `{ success, playersUpdated, playersInserted, error? }`.

### Inputs

- `league` table — find a representative league for the season
- ESPN API — `kona_player_info` view

### Outputs

- `player` table — upserted rows with `name`, `mlb_team`, `positions`, `pct_owned`, `espn_asv`

### Dependencies

- `ESPNAdapter`
- `utils/espn-env.ts` — `getEspnAuthFromEnv`
- `utils/encryption.ts` — `decryptToken`, `hasEncryptionKey` (fallback path)

### Known Gaps

- Requires at least one connected league — fails gracefully with `success: false` if none found.
- Stats written to `player` are ESPN season-to-date values, not projections.

---

## 12. HistoricalBackfillAgent

**File:** `packages/backend/src/agents/historical-backfill.ts`

### Purpose

Fetches and processes historical ESPN league data for past scoring periods, enabling retroactive snapshot population and standings history.

### Constructor

```ts
new HistoricalBackfillAgent(db: Kysely<Database>, logger?: BaseLogger)
```

Internally constructs `ESPNAdapter` and `SnapshotOrchestratorAgent`.

### Key Methods

#### `backfillSeason(options): Promise<BackfillResult>`

Options: `{ leagueId, season, startWeek, endWeek, espnAuth?, onProgress? }`.

1. Load the league from DB.
2. Iterate `startWeek` → `endWeek` sequentially (2-second throttle between ESPN calls).
3. For each scoring period: call `ESPNAdapter.fetchHistoricalWeek` with per-period stat filters.
4. Delegate to `SnapshotOrchestratorAgent.executeSnapshot` for persistence.
5. Call `onProgress` callback after each week if provided.
6. Accumulates `weeksProcessed`, `weeksSkipped`, `weeksFailed`, and `errors`.

### Inputs

- `league` table (DB)
- ESPN API (historical) — per-period stat filter (`filterStatsForSplitTypeIds: [5]`)

### Outputs

- All tables written by `SnapshotOrchestratorAgent.executeSnapshot` for each historical week

### Dependencies

- `ESPNAdapter` — `fetchHistoricalWeek`
- `SnapshotOrchestratorAgent` — `executeSnapshot`

### Known Gaps

- Sequential processing — cannot parallelize due to 2-second ESPN throttle.
- No resume capability — re-running `backfillSeason` with the same range will skip existing snapshots (via `forceFresh: false` default) but still makes an ESPN API call per week to check.

---

## 13. GsPacingAgent

**File:** `packages/backend/src/agents/gs-pacing.ts`

### Purpose

Tracks a team's Games Started usage against the season GS cap, projects end-of-season GS total, and recommends SP start/sit decisions to optimize GS pacing.

### Constructor

```ts
new GsPacingAgent(db: Kysely<Database>, logger?: BaseLogger)
```

### Key Methods

#### `getSeasonSummary(leagueId, teamId): Promise<GsSeasonSummary>`

Computes `gsUsed`, `gsCap`, `gsRemaining`, `projectedFinal`, `pacePerWeek`, `targetPacePerWeek`, and `paceStatus` (`"on_track"` | `"burning_fast"` | `"too_slow"`).

GS used is derived from roster snapshots (SP/P slot + active status) rather than ESPN's tracked stat, because ESPN does not expose a real-time GS accumulator.

#### `getWeeklySummary(leagueId, teamId, weekStartDate?): Promise<GsWeeklySummary>`

Uses `MLBStatsAPIAdapter` to fetch probable pitchers for the week, matches to the team's rostered SPs, and returns projected start dates.

#### `getStartPlan(leagueId, teamId): Promise<GsStartPlan>`

Generates a recommended start/sit plan to hit the GS target without burning out early.

### Inputs

- `team_roster_snapshot`, `league_settings_version` (DB)
- MLB StatsAPI (via `MLBStatsAPIAdapter`) for probable pitchers
- `player_period_stat` — for counting actual GS from stats (fallback)

### Outputs

- In-memory `GsSeasonSummary`, `GsWeeklySummary`, `GsStartPlan`, `GsStartRecommendation[]`

### Dependencies

- `MLBStatsAPIAdapter` — probable pitchers

### Known Gaps

- GS counting from roster snapshots is approximate — it treats every day a pitcher is in a SP/P slot as a start, which can over-count if the pitcher was inactive.
- `DEFAULT_GS_CAP = 200` is hardcoded in the module; the DB-stored value takes precedence when available.

---

## 14. FaabTrackerAgent

**File:** `packages/backend/src/agents/faab-tracker.ts`

### Purpose

Tracks FAAB budget usage, computes spend rates, projects runout week, and suggests bid amounts for waiver targets.

### Constructor

```ts
new FaabTrackerAgent(db: Kysely<Database>, logger?: BaseLogger)
```

### Key Methods

#### `getSummary(leagueId, teamId): Promise<FaabSummary>`

1. Get the league's total FAAB budget from `league_settings_version`.
2. Use `team.faab_spent` (populated by `SnapshotOrchestratorAgent` from ESPN's `transactionCounter`) as the primary source.
3. Fall back to summing `league_transaction_event` bid amounts if `faab_spent` is null.
4. Compute `spendRate`, `leagueAvgRemaining`, `projectedRunoutWeek`, and `willRunOut`.

#### `getBidHistory(leagueId, teamId): Promise<FaabBidEntry[]>`

Returns bid entries with ROI scoring from `league_transaction_event`.

#### `getSuggestedBid(leagueId, teamId, addPlayerId, dropPlayerId?): Promise<FaabSuggestedBid>`

Estimates a fair bid based on projected standings impact and remaining budget fraction.

### Inputs

- `team` — `faab_spent` column
- `league_settings_version` — FAAB budget cap
- `league_transaction_event` — bid history (legacy fallback)
- `player_projection` — for suggested bid computation

### Outputs

- In-memory `FaabSummary`, `FaabBidEntry[]`, `FaabSuggestedBid`

### Dependencies

- None (leaf agent)

### Known Gaps

- `faab_spent` is ESPN-reported and may lag real-time processing by up to 24 hours.

---

## 15. DraftRankingsAgent

**File:** `packages/backend/src/agents/draft-rankings.ts`

### Purpose

Produces a VBD-ranked player list using SGP (Standings Gain Points) methodology with position-specific replacement levels.

### Constructor

```ts
new DraftRankingsAgent(db: Kysely<Database>, logger?: BaseLogger)
```

### Key Methods

#### `getRankings(leagueId, options?): Promise<DraftRanking[]>`

Options: `{ projectionsRunId?, limit?, position? }`.

1. Load `league_settings_version` for categories + roster slots.
2. Compute position replacement levels using `getReplacementLevel` from `shared`.
3. For each player with projections: compute rate stats from components, calculate per-category SGP via `calculateVBD`.
4. Aggregate SGP across all categories to `sgpTotal`.
5. Sort by `sgpTotal` descending; filter by position if requested.

### Inputs

- `league_settings_version`, `team` (DB)
- `player_projection`, `player` (DB)

### Outputs

- In-memory `DraftRanking[]` — not persisted

### Dependencies

- `shared/formulas.ts` — `getReplacementLevel`, `calculateVBD`, `calculateFinalRate`

### Known Gaps

- Does not account for positional scarcity beyond replacement level (e.g., no catcher premium baked in beyond the replacement SGP).

---

## 16. AuctionValuationAgent

**File:** `packages/backend/src/agents/auction-valuation.ts`

### Purpose

Converts VBD-based SGP rankings to auction dollar values using proportional budget allocation. Validates that the sum of all valuations approximates the total league budget.

### Constructor

```ts
new AuctionValuationAgent(
  db: Kysely<Database>,
  draftRankingsAgent: DraftRankingsAgent,
  logger?: BaseLogger,
)
```

### Key Methods

#### `getValuations(leagueId, options?): Promise<AuctionValue[]>`

Options: `{ projectionsRunId?, budget? (default 260), minBid? (default 1), limit?, position? }`.

1. Get `DraftRanking[]` from `DraftRankingsAgent.getRankings`.
2. Compute `spendingPool = budget - (numRosteredPlayers * minBid)` via `calculateSpendingPool`.
3. For each player: `dollarValue = (playerVBD / totalVBD) * spendingPool + minBid`.
4. Only rostered players (top N = teams × rosterSize) contribute to `totalVBD` denominator — prevents dilution from fringe free agents.

### Inputs

- All inputs consumed by `DraftRankingsAgent.getRankings` (via delegation)

### Outputs

- In-memory `AuctionValue[]` with `playerId`, `playerName`, `dollarValue`, `sgpTotal`, `positions`

### Dependencies

- `DraftRankingsAgent` — must be constructed externally and injected
- `shared/formulas.ts` — `calculateSpendingPool`, `calculateAuctionDollarValue`

### Known Gaps

- Budget validation checks that rostered-player values sum to within 5% of total league budget — logs a warning if outside this tolerance but does not fail.

---

## 17. MorningReportAgent

**File:** `packages/backend/src/agents/morning-report.ts`

### Purpose

Generates daily morning reports for a user's fantasy team, including current/projected standings, injury alerts (placeholder), top waiver highlights, and actionable items.

### Constructor

```ts
new MorningReportAgent(db: Kysely<Database>, logger?: BaseLogger)
```

Internally constructs `WaiverRecommendationAgent` (which requires `ESPNAdapter` and `StandingsProjectionAgent`).

### Key Methods

#### `generateReport(slackUserLinkId, leagueId, reportDate): Promise<{ reportId, data: MorningReportData }>`

1. Look up `slack_user_link` by UUID to resolve the user's `team_id_fantasy`.
2. Find latest `league_daily_snapshot` for the league.
3. Fetch current standings from `team_daily_overall` and projected from `team_daily_projected_overall`.
4. Call `WaiverRecommendationAgent.getRecommendations` (top 5).
5. Assemble and return `MorningReportData` with standings summary, injury alerts (currently empty placeholder), waiver highlights, and action items.

### Inputs

- `slack_user_link` — maps Slack user to fantasy team ID
- `league_daily_snapshot`, `team_daily_overall`, `team_daily_projected_overall` (DB)
- `WaiverRecommendationAgent` (delegates to)

### Outputs

- In-memory `{ reportId: string, data: MorningReportData }` — caller persists/delivers this

### Dependencies

- `WaiverRecommendationAgent`
- `ESPNAdapter`, `StandingsProjectionAgent` (via `WaiverRecommendationAgent`)

### Known Gaps

- Injury alerts are a placeholder — the `injuries` array is always empty.
- Depends on `slack_user_link` table (Slack integration) — throws if user link is not found.

---

## 18. StandingsSwingAttributionAgent

**File:** `packages/backend/src/agents/standings-swing-attribution.ts`

### Purpose

Decomposes a team's roto-point delta between two snapshot dates into three causal buckets: **actual_performance** (YTD stat accumulation), **projection_change** (new FanGraphs CSV uploaded), and **competitor_movement** (other teams' values shifted relative rank).

### Constructor

```ts
new StandingsSwingAttributionAgent(db: Kysely<Database>, logger?: BaseLogger)
```

### Key Methods

#### `getAttribution(leagueId, teamId, currDate, prevDate?): Promise<SwingAttributionResult>`

1. Load projected category data for both dates.
2. For each category, call the three pure attribution functions in sequence:
   - `computeActualPerformanceDelta` — applies YTD accumulation delta to previous projections and re-ranks.
   - `computeProjectionChangeDelta` — applies projection-run changes to the hypothetical state and re-ranks.
   - Residual = total delta − actual − projection = `competitor_movement`.
3. Identifies `topDriverPlayer` (player whose projection changed most) and `topCompetitorMoved`.
4. Classifies each category into a `bucket` enum (`"actual_performance"` | `"projection_change"` | `"competitor_movement"` | `"mixed"`).

The three helper functions (`computeActualPerformanceDelta`, `computeProjectionChangeDelta`) are exported for unit testing.

### Inputs

- `team_daily_projected_category` — for both snapshot dates
- `team_daily_category_totals` — YTD actuals for both dates
- `league_daily_snapshot` — to detect projections run change (prevRunId vs currRunId)
- `player_projection`, `team_roster_snapshot`, `player` — for per-player projection driver identification
- `team` — team names

### Outputs

- In-memory `SwingAttributionResult` — not persisted

### Dependencies

- `utils/roto-ranking.ts` — `assignRanksWithTies`

### Known Gaps

- Attribution is exact only when categories are independent; correlated categories (e.g., ERA and WHIP sharing pitcher IP) may double-count a driver.

---

## 19. StreamingPitcherAgent

**File:** `packages/backend/src/agents/streaming-pitcher.ts`

### Purpose

Ranks available free-agent starting pitchers by streaming matchup favorability, combining opponent ERA allowed, park factors, projected stats, multi-start bonuses, and optional Rotoballer verdicts.

### Constructor

```ts
new StreamingPitcherAgent(
  db: Kysely<Database>,
  mlbAdapter: MLBStatsAPIAdapter,
  logger?: BaseLogger,
  rotoballerAdapter?: RotoballerAdapter,
)
```

### Key Methods

#### `getRecommendations(leagueId, teamId, snapshotDate, options?): Promise<StreamingResult>`

1. Load free agents with projections.
2. For each candidate: fetch upcoming start data from `MLBStatsAPIAdapter`.
3. Compute `compositeScore = projectionScore + opponentScore + multiStartBonus`.
4. Optionally scrape Rotoballer pitcher rankings via `RotoballerAdapter` and apply `rotoballerVerdict`.
5. Set `pickupDeadline` to the latest Tuesday or Friday before the game date.
6. Return sorted `StreamingCandidate[]` with `scoreBreakdown`.

### Inputs

- `league_free_agent_snapshot`, `player_projection` (DB)
- MLB StatsAPI — probable pitchers, team stats (via `MLBStatsAPIAdapter`)
- Rotoballer — scraped SP rankings (optional, via `RotoballerAdapter`)

### Outputs

- In-memory `StreamingResult` with `candidates`, `dateRange`, `totalCandidates`, `rotoballerSource?`

### Dependencies

- `MLBStatsAPIAdapter`
- `RotoballerAdapter` (optional)
- `agents/sit-start-advisor.ts` — `normalizeName` (diacritic-stripping)

### Known Gaps

- Park factors are approximated, not sourced from a canonical park factor database.
- Rotoballer scraping is fragile — DOM changes will break the adapter silently.

---

## 20. SitStartAdvisorAgent

**File:** `packages/backend/src/agents/sit-start-advisor.ts`

### Purpose

Merges external SP sit/start verdicts from Pitcherlist, Rotoballer, and FanGraphs with the team's rostered SPs to produce unified verdicts with source attribution.

### Constructor

```ts
new SitStartAdvisorAgent(
  db: Kysely<Database>,
  mlbAdapter: MLBStatsAPIAdapter,
  logger?: BaseLogger,
  pitcherlistAdapter?: PitcherlistAdapter,
  rotoballerAdapter?: RotoballerAdapter,
  fangraphsAdapter?: FangraphsAdapter,
)
```

### Key Methods

#### `getRecommendations(leagueId, teamId, snapshotDate): Promise<SitStartRecommendation[]>`

1. Fetch rostered SPs from `team_roster_snapshot`.
2. In parallel: fetch Pitcherlist, Rotoballer, and FanGraphs verdicts for the current week.
3. Match external names to roster players using `normalizeName` (NFD diacritic stripping).
4. Merge verdicts by averaging numeric scores via `mergeVerdicts`.
5. Return `SitStartRecommendation[]` with per-source verdicts and a merged consensus.

**`normalizeName(name: string): string`** (exported utility):
Strips diacritics (`NFD` decomposition → remove combining marks), lowercases, removes non-alpha.

### Inputs

- `team_roster_snapshot`, `player` (DB)
- Pitcherlist, Rotoballer, FanGraphs (external scrapers via adapters)

### Outputs

- In-memory `SitStartRecommendation[]`

### Dependencies

- `PitcherlistAdapter`, `RotoballerAdapter`, `FangraphsAdapter` (all optional)
- `MLBStatsAPIAdapter`

### Known Gaps

- All three external adapters scrape HTML — breakages will silently produce empty verdicts.
- Diacritic stripping handles most cases but doesn't cover all Unicode name edge cases (e.g., CJK characters).

---

## 21. LineupOptimizerAgent

**File:** `packages/backend/src/agents/lineup-optimizer.ts`

### Purpose

Recommends start/sit swaps for today's lineup that maximize projected SGP value, using a greedy slot-filling algorithm that prioritizes restrictive positions (C, 1B) before flexible ones (UTIL).

### Constructor

```ts
new LineupOptimizerAgent(
  db: Kysely<Database>,
  mlbAdapter: MLBStatsAPIAdapter,
  logger?: BaseLogger,
)
```

### Key Methods

#### `getRecommendations(leagueId, teamId, snapshotDate): Promise<LineupOptimizationResult>`

1. Load league settings (roster slot definitions).
2. Load team roster from `team_roster_snapshot`.
3. Query MLB StatsAPI for today's probable starters (to check `hasGameToday`).
4. For each active slot: find the eligible player on the bench with the highest `projectedValue` and a game today.
5. Return `LineupRecommendation[]` with `slotId`, current/recommended player, `projectedValueGain`, and reason.

### Inputs

- `team_roster_snapshot`, `player_projection`, `league_settings_version` (DB)
- MLB StatsAPI — today's probable starters

### Outputs

- In-memory `LineupOptimizationResult` with `recommendations`, `totalProjectedGain`, `isOptimal`

### Dependencies

- `MLBStatsAPIAdapter`

### Known Gaps

- Greedy algorithm may not find the globally optimal assignment (NP-hard bin-packing).
- Only considers `hasGameToday` from probable pitchers — batter game availability is not verified.

---

## 22. DraftNarratorAgent

**File:** `packages/backend/src/agents/draft-narrator.ts`

### Purpose

Experimental stateless narration using OpenAI, translating draft-engine signals (alerts, inflation, budget pacing, scarcity, optimization) into human-readable commentary. Live extension delivery is not implemented.

### Constructor

```ts
new DraftNarratorAgent(logger?: BaseLogger)
```

Internally constructs an `OpenAI` client. Does **not** accept `db` — it is stateless and prompt-driven.

### Key Methods

#### `narrate(payload: NarratorPayload): Promise<string>`

Constructs a GPT-4o system prompt + user message from the structured `NarratorPayload`, calls `openai.chat.completions.create`, and returns the narration text.

`NarratorPayload` contains: `draftPhase` (`"early"` | `"mid"` | `"late"`), `alerts[]`, `inflation`, `budgetSummary`, `topScarcity[]`, `categoryGaps[]`, `currentAuctionPlayer`, and `optimization`.

### Inputs

- `NarratorPayload` — summary signals intended for a deterministic live-draft client (no raw DB tables); the Chrome extension client is not included in this repository

### Outputs

- Plain text narration string (returned to caller; extension overlay delivery is not implemented)

### Dependencies

- `openai` npm package
- `OPENAI_API_KEY` environment variable

### Known Gaps

- No retry logic for OpenAI rate limits or transient errors.
- Prompt is fixed — no mechanism for A/B testing or per-user tone preferences.

---

## Shared Utilities

### `changeLogEmitter` — `utils/change-log-emitter.ts`

A singleton `EventEmitter` used for in-process fan-out of standings change events to SSE clients.

```ts
export const changeLogEmitter = new EventEmitter(); // maxListeners: 100
export const CHANGE_LOG_EVENT = "standings_change"; // payload: ChangeLogSignal
export const LIVE_POLL_EVENT = "live_poll"; // payload: LivePollSignal
```

- **`ChangeLogSignal`**: `{ leagueId, snapshotDate, eventCount }`
- **`LivePollSignal`**: `{ leagueId, polledAt, eventCount }`

Emitted by: `SnapshotOrchestratorAgent.executeSnapshot` and `LivePollAgent.refresh`.
Subscribed by: SSE route in `api/timeseries.ts`.

> **Note:** This is single-process only. For multi-process deployments, swap for Redis pub/sub.

---

### `assignRanksWithTies` — `utils/roto-ranking.ts`

```ts
function assignRanksWithTies(
  sorted: Array<{ teamId: number; value: number }>,
  numTeams: number,
): RankedTeam[]; // { teamId, rank, rotoPoints }
```

Tied teams share the average of the positions they occupy:

- Two teams tied for 1st in a 10-team league: each gets `(10 + 9) / 2 = 9.5` points.

Also exports:

- `computeOverallRotoPoints(categoryRankings): Map<number, number>` — sums roto points across all categories per team.

Used by: `SnapshotOrchestratorAgent`, `StandingsProjectionAgent`, `LivePollAgent`, `StandingsChangeLogAgent`, `StandingsSwingAttributionAgent`, `TransactionImpactAgent`.

---

## BullMQ Workers

### `snapshot-worker.ts`

Runs the `snapshots` BullMQ queue. Each job contains `{ leagueId, snapshotDate, auth? }`. On receipt, constructs `SnapshotOrchestratorAgent` and calls `executeSnapshot`. Failed jobs exceeding their retry limit are moved to the `snapshots-dlq` queue. Concurrency: 3.

Also imports `backfill-worker.ts` and calls `scheduleLivePolls()` from `live-poll-worker.ts` so both run in the same process.

### `live-poll-worker.ts`

Runs the `live-polls` BullMQ queue. Each job is a repeatable every 15 minutes (`*/15 * * * *` cron) per active league. Job logic:

1. Skip if `LIVE_POLL_ENABLED !== "true"`.
2. Skip if `LivePollAgent.isGameWindow()` returns `false`.
3. Otherwise construct `LivePollAgent` and call `refresh(leagueId, today)`.

**`scheduleLivePolls(): Promise<void>`** — registers a repeatable job per league using `league.id`-based `jobId` for deduplication. Called at worker startup.

Concurrency: 2.
