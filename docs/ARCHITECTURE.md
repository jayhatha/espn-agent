<!-- generated-by: gsd-doc-writer -->

# Architecture Overview

ESPN Fantasy Baseball Assistant is a full-stack web application that pulls live and historical data from the ESPN Fantasy Baseball API, combines it with FanGraphs Rest-of-Season (RoS) projections, and surfaces actionable analysis—projected standings, waiver recommendations, and trade analysis—to a single-user operator.

---

## 1. Monorepo Structure

The repository is a **pnpm + Turborepo** monorepo with three packages under `packages/`.

```
espn-agent/
├── packages/
│   ├── backend/     # Fastify API server + BullMQ workers
│   ├── frontend/    # Next.js 14 App Router UI
│   └── shared/      # TypeScript types + stat formulas
├── turbo.json       # Pipeline: build → test → lint, dev is persistent/uncached
└── pnpm-workspace.yaml
```

### Package roles

| Package    | Runtime             | Responsibility                                                              |
| ---------- | ------------------- | --------------------------------------------------------------------------- |
| `backend`  | Node.js / Fastify 4 | REST API, ESPN adapter, business logic agents, BullMQ workers               |
| `frontend` | Next.js 14          | App Router pages, TanStack Query data fetching, SSE streaming               |
| `shared`   | Isomorphic TS       | Canonical types (`types.ts`), component-based stat formulas (`formulas.ts`) |

Turbo's `build` pipeline enforces `^build` dependency ordering so `shared` compiles before `backend` or `frontend` consume it from `shared/dist/`.

---

## 2. Backend Architecture

### 2.1 Fastify Server (`packages/backend/src/index.ts`)

The server is built with `buildServer()` and listens on `PORT` (default `3001`). Pino is the logger, with `pino-pretty` in development.

**Plugin registration order** (order matters — each plugin depends on the previous):

```
cors          → cookie          → fastify-jwt (reads accessToken cookie)
  → multipart → redis (optional) → rate-limit  → websocket
```

| Plugin                | Purpose                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `@fastify/cors`       | Allows `FRONTEND_URL`, `fantasy.espn.com`, private LAN IPs, and `chrome-extension://` origins            |
| `@fastify/cookie`     | Signed cookie parsing; secret from `COOKIE_SECRET` or `JWT_SECRET`                                       |
| `@fastify/jwt`        | JWT auth; reads from `accessToken` cookie or `Authorization: Bearer` header; tokens expire in 15 minutes |
| `@fastify/multipart`  | CSV upload (10 MB limit) for FanGraphs projections                                                       |
| `@fastify/redis`      | Optional Redis connection; activated when `REDIS_URL` is set                                             |
| `@fastify/rate-limit` | Per-route rate limiting; uses Redis store when available, in-memory otherwise                            |
| `@fastify/websocket`  | WebSocket support for draft-live routes                                                                  |

**Route modules registered:**

```
authRoutes            /api/auth/*
setupOAuth            (Google + GitHub, when env vars present)
leaguesRoutes         /api/leagues/*
projectionsRoutes     /api/projections/*
timeSeriesRoutes      /api/leagues/:id/timeseries/*
recommendationsRoutes /api/leagues/:id/teams/:teamId/...
draftRoutes           /api/leagues/:id/draft/*
draftLiveRoutes       (WebSocket draft companion)
lineupRoutes          /api/leagues/:id/teams/:teamId/lineup/*
streamingRoutes       /api/leagues/:id/stream (SSE)
adminRoutes           /api/admin/*
transactionImpactRoutes
trendsRoutes
faabRoutes
pitchingUsageRoutes
slackRoutes           (feature-flagged: FEATURE_SLACK_ENABLED=true)
internalRoutes
```

### 2.2 Auth Flow

```
Client                     Fastify                      Database
  │── POST /api/auth/login ──►│                              │
  │                           │── verify password hash ──────►│
  │                           │◄─ user row ──────────────────│
  │                           │── sign accessToken (15m) ────│
  │                           │── insert refresh_tokens row ─►│
  │◄── Set-Cookie: accessToken│
  │◄── Set-Cookie: refreshToken
  │
  │── GET /api/... ──────────►│
  │   (accessToken cookie)    │── server.jwt.verify ─────────┤
  │                           │    authenticate() decorator  │
  │◄── 200 data ─────────────│
  │
  │── POST /api/auth/refresh ►│
  │   (refreshToken cookie)   │── hash + compare token_hash ─►│
  │                           │── issue new accessToken (15m) │
  │◄── Set-Cookie: accessToken│
```

- Access tokens live in an `httpOnly` cookie (`accessToken`), 15-minute TTL.
- Refresh tokens are stored as `token_hash` (hashed) in `refresh_tokens` to prevent leakage if the DB is read.
- OAuth (Google, GitHub) is gated on `GOOGLE_CLIENT_ID` + `GITHUB_CLIENT_ID` env vars.

### 2.3 Database Layer (`packages/backend/src/db/`)

**Connection** (`connection.ts`): Kysely with `pg.Pool` (max 25 connections, 5 s connect timeout, 30 s idle timeout). NUMERIC columns are parsed as JS floats via `types.setTypeParser(1700, ...)` to prevent string concatenation bugs.

**Schema** (`schema.ts`): Exports a `Database` interface that maps table names to row types. All tables use Kysely's `Generated<T>` for auto-generated PKs and timestamps.

---

## 3. Database Schema

30+ tables organized into logical groups:

### Core entities

| Table                     | Description                                                                   |
| ------------------------- | ----------------------------------------------------------------------------- |
| `league`                  | ESPN league connection (espn_league_id, season, auth cookies)                 |
| `league_settings_version` | Versioned settings JSONB (`categories`, `roster_slots`, `acquisition_rules`)  |
| `team`                    | Fantasy teams within a league                                                 |
| `player`                  | MLB player registry (ESPN player IDs, positions, pct_owned, espn_asv)         |
| `player_identity_map`     | Fuzzy name-match confidence scores linking FanGraphs names to ESPN player IDs |

### Raw archive

| Table                        | Description                                                          |
| ---------------------------- | -------------------------------------------------------------------- |
| `league_raw_payload`         | Full ESPN API responses with schema fingerprints for drift detection |
| `league_free_agent_snapshot` | Snapshot of available free agents                                    |

### Daily snapshots (append-only time series)

| Table                        | Description                                                          |
| ---------------------------- | -------------------------------------------------------------------- |
| `league_daily_snapshot`      | One row per league per day; `is_degraded` + `degraded_reasons` JSONB |
| `team_daily_category_totals` | Cumulative season stat totals per team per category                  |
| `team_daily_category_ranks`  | Category rank per team per day                                       |
| `team_daily_overall`         | Overall roto point totals and rank per team per day                  |
| `team_roster_snapshot`       | Full roster + lineup slot mapping per team per day                   |

### Projections (global, not league-scoped)

| Table                           | Description                                                               |
| ------------------------------- | ------------------------------------------------------------------------- |
| `projections_run`               | FanGraphs CSV upload metadata; `staleness`: `fresh` / `stale` / `missing` |
| `player_projection`             | Per-player RoS stat projections from a run                                |
| `team_daily_projected_category` | Projected final category value per team per snapshot                      |
| `team_daily_projected_overall`  | Projected final roto points + rank per team per snapshot                  |

### Transactions & impact

| Table                      | Description                                   |
| -------------------------- | --------------------------------------------- |
| `league_transaction_event` | Add/drop/trade/waiver events                  |
| `player_period_stats`      | Per-player stats over a period (for Roto WPA) |
| `roster_move`              | Recorded add/drop moves                       |
| `transaction_impact`       | Computed impact of a roster move on standings |

### Auth

| Table            | Description                                                                |
| ---------------- | -------------------------------------------------------------------------- |
| `users`          | Email + password hash (nullable for OAuth users), role, OAuth provider IDs |
| `refresh_tokens` | Hashed refresh token storage with expiry                                   |

### Change events

| Table                    | Description                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `standings_change_event` | Per-category roto point deltas between snapshots; includes `proximate_cause` JSONB |

### Slack integration

`slack_installation`, `slack_user_link`, `slack_notification_target`, `agent_report`, `agent_action`, `agent_action_decision`, `slack_message_ref` — support the optional Slack bot feature.

### Other

`injury_event`, `season_metadata` (finalization state per season).

---

## 4. Data Pipeline

### 4.1 Full Flow (ASCII Diagram)

```
FanGraphs CSV Upload
        │
        ▼
  ProjectionsIngestAgent
  (projections_run, player_projection)
        │
        └──────────────────────────────────────┐
                                               │
ESPN API                                       │
  https://lm-api-reads.fantasy.espn.com        │
  /apis/v3/games/flb/:leagueId                 │
        │                                      │
        ▼                                      │
   ESPNAdapter                                 │
   ├─ throttledEspnCall (1 concurrent, 2s gap) │
   ├─ validateEspnResponse (Zod schemas)       │
   ├─ schemaFingerprint (MD5 hash)             │
   └─ normalizeLeagueData()                    │
        │                                      │
        ▼                                      │
  league_raw_payload (archive)                 │
        │                                      │
        ▼                                      │
  SnapshotOrchestratorAgent                    │
  ├─ Write league_daily_snapshot               │
  ├─ Write team_daily_category_totals          │
  ├─ Write team_daily_category_ranks           │
  ├─ Write team_daily_overall                  │
  └─ Write team_roster_snapshot                │
        │                                      │
        ▼                                      │
  StandingsProjectionAgent ◄───────────────────┘
  ├─ allocateProjections() (roster slot math)
  ├─ combineComponents() (current YTD + RoS)
  ├─ calculateFinalRate() (never average rates)
  ├─ assignRanksWithTies()
  ├─ Write team_daily_projected_category
  └─ Write team_daily_projected_overall
        │
        ▼
  StandingsChangeLogAgent
  ├─ Diff prev vs curr projected_category rows
  ├─ Write standings_change_event rows
  └─ Emit changeLogEmitter('standings_change')
        │
        ▼
  SSE clients (streamingRoutes)
  subscribed to changeLogEmitter
```

### 4.2 Triggered Paths

| Trigger                          | Handler                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `POST /api/leagues/:id/snapshot` | Enqueues job on `snapshots` BullMQ queue                   |
| BullMQ cron (03:00 daily)        | snapshot-worker dequeues → SnapshotOrchestratorAgent       |
| `POST /api/projections/upload`   | ProjectionsIngestAgent → re-snapshot degraded leagues      |
| BullMQ repeatable (15 min)       | live-poll-worker → LivePollAgent (during game window only) |

---

## 5. Agent Architecture

Agents are isolated classes in `packages/backend/src/agents/`. Each accepts `db: Kysely<Database>` and `logger?: BaseLogger`. Agents never fabricate data — incomplete output is marked degraded.

### ESPNAdapter (`adapters/espn.ts`)

- Wraps all ESPN API calls through `throttledEspnCall` (p-limit concurrency 1, 2 s inter-call gap)
- Uses `createRetryableAxios` for automatic retry with backoff
- Validates responses against Zod schemas (`ESPNLeagueResponseSchema`, etc.) and logs schema drift via `logUnexpectedFields`
- Computes MD5 `schemaFingerprint` for each response archived to `league_raw_payload`
- Maintains an LRU in-memory cache (not Redis)
- Auth: `SWID` + `espn_s2` cookies passed per-request for private leagues

### SnapshotOrchestratorAgent (`agents/snapshot-orchestrator.ts`)

- Entry point for the daily data pipeline
- Idempotent: skips if a snapshot for `(leagueId, snapshotDate)` already exists unless `forceFresh`
- Writes all daily snapshot tables in a single pass
- Maps ESPN stat IDs to component keys via `ESPN_PERIOD_STAT_MAP` (e.g., stat ID 34 = `OUTS`, converted to IP via ÷3)
- Delegates projection computation to `StandingsProjectionAgent`
- Delegates change event generation to `StandingsChangeLogAgent`
- Emits `CHANGE_LOG_EVENT` on `changeLogEmitter` after change events are written

### StandingsProjectionAgent (`agents/standings-projection.ts`)

- Loads current YTD `team_daily_category_totals` + RoS `player_projection` rows
- Calls `allocateProjections()` to assign projected player stats to roster slots (respects slot eligibility and GS cap, default 200)
- Combines `current + projected` components with `combineComponents()`, then computes final rate via `calculateFinalRate()`
- Uses `assignRanksWithTies()` for ranking — ties share the same rank
- Applies `computeRateConfidence()` for uncertainty intervals
- Writes `team_daily_projected_category` and `team_daily_projected_overall`

### StandingsChangeLogAgent (`agents/standings-change-log.ts`)

- Diffs the two most recent `team_daily_projected_category` snapshots
- Computes per-category roto point deltas and identifies which team a team passed/was passed by
- Stores `direction`, `roto_delta`, `passed_team_id`, and `proximate_cause` JSONB in `standings_change_event`
- Publishes events to the `NotificationBus` (Slack notifications) and `changeLogEmitter` (SSE fan-out)

### LivePollAgent (`agents/live-poll.ts`)

- Runs during MLB game window only (`isGameWindow()`: UTC 17:00–04:00, roughly 1 pm–midnight ET)
- Fetches lightweight ESPN views (`mSettings`, `mTeam`, `mStandings`) — no roster/free-agent data
- Refreshes `team_daily_category_totals`, `team_daily_category_ranks`, and `team_daily_overall` for today's date
- Re-runs `StandingsProjectionAgent` and `StandingsChangeLogAgent`
- Emits both `CHANGE_LOG_EVENT` and `LIVE_POLL_EVENT` on `changeLogEmitter`

### ProjectionsIngestAgent (`agents/projections-ingest.ts`)

- Parses FanGraphs Depth Charts CSV uploads (multipart)
- Required batter columns: `AB, H, R, HR, RBI, SB, BB, HBP, SF, TB`
- Required pitcher columns: `IP, ER, H, BB, K, W, SV`; optional: `HLD, QS`
- Player matching: SQL `ILIKE` on name (fuzzy identity resolution via `PlayerIdentityResolutionAgent` is not yet wired in)
- Marks `projections_run.staleness = 'fresh'` when both batters and pitchers are present for the date

### PlayerIdentityResolutionAgent (`agents/player-identity.ts`)

- Fuzzy name matching with team/position boosting
- Stores confidence scores in `player_identity_map`
- **Currently disconnected from the ingest flow** (known gap)

### WaiverRecommendationAgent (`agents/waiver-recommendation.ts`)

- Loads team roster and free agent pool
- Simulates every valid add/drop pair, computing delta roto points
- Uses `allocateProjections()` post-add to detect roster gaps
- Returns ranked `WaiverRecommendation[]` with per-category impact breakdown and legality check
- Known gap: free agent pool defaults to empty (ESPN free agent fetch not implemented)

### TradeRecommendationAgent (`agents/trade-recommendation.ts`)

- Analyzes proposed trades by swapping RoS projections between teams
- Scores proposed trades on `deltaOverallPoints` and `fairnessScore` (−1 to +1)
- Generates 1-for-1 and 2-for-2 trade candidates ranked by projected standings impact
- Applies position scarcity multipliers (e.g., C = 1.5×, RP = 1.3×, OF = 0.8×)
- Known gap: rate stat adjustments not fully implemented (counting stats only for trade simulation)

---

## 6. BullMQ Job Pipeline

Both workers live in `packages/backend/src/workers/` and share a single IORedis connection.

### Queues

| Queue           | Concurrency | Job Type                                         | Schedule                               |
| --------------- | ----------- | ------------------------------------------------ | -------------------------------------- |
| `snapshots`     | 3           | `SnapshotJobData` (leagueId, snapshotDate, auth) | On-demand + daily cron at 03:00        |
| `snapshots-dlq` | —           | Dead-letter queue for failed snapshot jobs       | —                                      |
| `live-polls`    | 2           | `LivePollJobData` (leagueId)                     | Repeatable every 15 minutes per league |

### snapshot-worker (`workers/snapshot-worker.ts`)

- Also co-imports `backfill-worker.ts` and `live-poll-worker.ts` (all run in the same worker process)
- On failure, jobs are moved to `snapshots-dlq`
- `getEspnAuthFromEnv()` provides fallback ESPN cookies from environment

### live-poll-worker (`workers/live-poll-worker.ts`)

- Entire feature gated on `LIVE_POLL_ENABLED=true`
- `scheduleLivePolls()` registers one repeatable BullMQ job per active league (deduplicated by `jobId = live-poll-{leagueId}`)
- Skips execution if outside game window (does not cancel the job — the check is inside the worker)

---

## 7. SSE Streaming

Real-time standings updates flow through an in-process `EventEmitter` rather than a message broker.

```
changeLogEmitter (EventEmitter, max 100 listeners)
├── standings_change  → emitted after daily snapshot or live poll generates change events
└── live_poll         → emitted after every successful live-poll refresh

streamingRoutes (/api/leagues/:id/stream)
  ├── On connect: subscribe to changeLogEmitter for this leagueId
  ├── On event:   write SSE data frame to response
  └── On disconnect: remove listener
```

**Scaling note:** The EventEmitter is single-process. To scale horizontally, replace with Redis Pub/Sub.

---

## 8. Frontend Architecture

### 8.1 Next.js App Router (`packages/frontend/src/app/`)

- Next.js 14 with the App Router; all pages are Server Components by default
- Client Components are opt-in via `"use client"` (e.g., `providers.tsx`, interactive pages)
- Font stack: `Inter` (body, `--font-inter`) + `JetBrains Mono` (data/stats, `--font-mono`)

### 8.2 Provider Tree (`app/providers.tsx`)

```
ThemeProvider (next-themes, class-based dark mode, default: dark)
  └── QueryClientProvider (TanStack Query v5)
        staleTime: 5 min | gcTime: 10 min | refetchOnWindowFocus: false
        └── AuthProvider (AuthContext)
              └── {children}
```

### 8.3 TanStack Query

- All server data is fetched via TanStack Query hooks
- `staleTime: 5 * 60_000` — cached data is considered fresh for 5 minutes
- Pages currently hardcode `localhost:3001` as the API base URL (the `lib/api.ts` client exists but is unused — known gap)

### 8.4 SSE Client

Pages that display live standings subscribe to `/api/leagues/:id/stream` using the browser `EventSource` API. On each `standings_change` or `live_poll` event, the relevant TanStack Query cache keys are invalidated to trigger a background refetch.

### 8.5 Team Selection

The user's selected team per league is persisted in `localStorage` under the key `league_${leagueId}_team`. No server-side session is required.

---

## 9. Shared Package (`packages/shared/src/`)

### Types (`types.ts`)

Core domain types consumed by both `backend` and `frontend`:

- `League`, `Team`, `Player` — canonical entity shapes
- `LeagueSettings` — scoring format, categories, roster slots, acquisition rules
- `Category` / `StatComponents` — stat category definition and component stat bag
- `ProjectionStaleness` — `"fresh" | "stale" | "missing"`
- `ScoringFormat` — `"roto" | "h2h_category" | "points"`

### Formulas (`formulas.ts`)

Pure functions for component-based rate stat computation:

| Formula              | Components                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `calculateAVG`       | `H / AB`                                                                                      |
| `calculateOBP`       | `(H + BB + HBP) / (AB + BB + HBP + SF)`                                                       |
| `calculateSLG`       | `TB / AB`                                                                                     |
| `calculateOPS`       | `OBP + SLG`                                                                                   |
| `calculateERA`       | `9 × ER / IP`                                                                                 |
| `calculateWHIP`      | `(HA + BBA) / IP` (falls back to `H / BB` for team-level data)                                |
| `calculateK9`        | `9 × K / IP`                                                                                  |
| `calculateWPCT`      | `W / (W + L)`                                                                                 |
| `combineComponents`  | Adds corresponding component values from two `StatComponents` objects                         |
| `calculateFinalRate` | Dispatches to the correct formula by `formula_id`; called after combining current + projected |

---

## 10. Key Design Patterns

### Degraded Snapshots

Every `league_daily_snapshot` row carries:

- `is_degraded: boolean`
- `degraded_reasons: string[]` (JSONB)

Example values: `["projections_missing"]`, `["projections_stale"]`. Consumers check `is_degraded` before displaying projection data and surface warnings in the UI. Agents never fabricate projections to fill a gap — they mark the output degraded instead.

### Component Math for Rate Stats

Rate stats (AVG, OBP, ERA, WHIP, etc.) are **never averaged directly**. The pattern is:

```
projected_final = calculateRate(combineComponents(ytd_actuals, ros_projected))
```

This ensures a player with 200 AB so far and 300 AB projected contributes correctly weighted component counts to the combined rate, rather than arithmetically averaging two AVG values.

### Empty Array Guard (Kysely)

Kysely generates invalid SQL when `WHERE col IN ()` is called with an empty array. Every query that builds a dynamic `IN` list guards against this:

```typescript
if (playerIds.length > 0) {
  query = query.where("player_id", "in", playerIds);
}
```

### ESPN API Throttling

All ESPN HTTP calls are serialized through a `p-limit(1)` queue with a minimum 2-second inter-call delay, preventing rate-limit errors when multiple leagues are snapshotted in parallel.

### Schema Drift Detection

Each raw ESPN API response is fingerprinted with MD5 and archived to `league_raw_payload`. The adapter uses Zod schemas (`ESPNLeagueResponseSchema`, etc.) to validate responses and calls `logUnexpectedFields` to surface unknown keys — providing an early warning when ESPN changes their API shape.

### Projections Are Global

`projections_run` and `player_projection` are not scoped to a league. A single FanGraphs CSV upload applies to all connected leagues simultaneously. League-specific projection outputs (`team_daily_projected_*`) are derived per-snapshot by joining global player projections against each league's roster.
