# ESPN Fantasy Baseball Assistant

## Project Overview

Web app connecting to ESPN Fantasy Baseball leagues, providing daily snapshots, projected standings, waiver recommendations, trade analysis, and draft assistance. Uses FanGraphs Depth Charts RoS projections (CSV upload).

## Tech Stack

- **Monorepo**: Turbo + pnpm
- **Backend**: Fastify 4, TypeScript, Kysely (PostgreSQL), BullMQ (Redis)
- **Frontend**: Next.js 14 (App Router), TanStack Query v5, Tailwind CSS, Recharts
- **Shared**: TypeScript types + component-based stat formulas (AVG, OBP, SLG, OPS, ERA, WHIP)

## Project Structure

```
packages/
  shared/src/          # Types (types.ts), stat formulas (formulas.ts)
  backend/src/
    db/                # schema.ts, connection.ts, migrate.ts, migrations/
    adapters/espn.ts   # ESPN API adapter (fetch + normalize)
    agents/            # Business logic agents (see Agent Architecture below)
    api/               # Fastify route modules (leagues, projections, timeseries, recommendations)
    workers/           # BullMQ snapshot worker
  frontend/src/
    app/               # Next.js App Router pages
    lib/api.ts         # API client (currently unused - pages hardcode localhost:3001)
```

## Database (PostgreSQL via Kysely)

16 tables organized as:

- **Core**: league, league_settings_version, team, player, player_identity_map
- **Raw archive**: league_raw_payload (ESPN responses with schema fingerprints)
- **Daily snapshots**: league_daily_snapshot, team_daily_category_totals, team_daily_category_ranks, team_daily_overall, team_roster_snapshot
- **Projections**: projections_run, player_projection, team_daily_projected_category, team_daily_projected_overall
- **Transactions**: league_transaction_event

Key: `league_settings_version.settings_json` is a single JSONB column containing categories, roster_slots, and acquisition_rules (consolidated from the design doc's separate fields).

## Agent Architecture

Each agent is an isolated class in `packages/backend/src/agents/`. Agents should:

- Accept a Kysely `db` instance and optional Pino `logger`
- Have a single clear responsibility
- Mark outputs as degraded when data is incomplete (never fabricate data)
- Never log secrets (ESPN cookies, auth headers)

### Implemented Agents

**ESPNAdapter** (`adapters/espn.ts`)

- Fetches ESPN league data, normalizes to canonical models, archives raw payloads
- Base URL: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb`
- Auth: SWID + espn_s2 cookies for private leagues
- Known gaps: no retry/backoff, in-memory cache (not Redis), free agents always empty, no activity feed parsing

**ProjectionsIngestAgent** (`agents/projections-ingest.ts`)

- Parses FanGraphs CSV uploads into `projections_run` + `player_projection` rows
- Batters required: AB, H, R, HR, RBI, SB, BB, HBP, SF, TB
- Pitchers required: IP, ER, H, BB, K, W, SV (optional: HLD, QS)
- Marks run `fresh` when both batters + pitchers exist for that date
- Player matching: SQL ILIKE on name (does NOT use PlayerIdentityResolutionAgent yet)

**PlayerIdentityResolutionAgent** (`agents/player-identity.ts`)

- Fuzzy name matching with team/position boosting
- Stores confidence scores in `player_identity_map`
- Currently disconnected from ingest flow

**StandingsProjectionAgent** (`agents/standings-projection.ts`)

- Computes projected final totals using component math for rate stats
- Ranks teams per category, assigns roto points (numTeams - rank + 1)
- Stores to `team_daily_projected_category` and `team_daily_projected_overall`
- Depends on `team_daily_category_totals` for current-state data (populated by snapshot orchestrator)

**WaiverRecommendationAgent** (`agents/waiver-recommendation.ts`)

- Simulates add/drop and ranks by delta overall points
- Known gaps: delta simulation returns hardcoded 0.5, free agent pool defaults to empty

**SnapshotOrchestratorAgent** (`agents/snapshot-orchestrator.ts`)

- Daily snapshot workflow: fetch ESPN -> archive raw -> normalize -> write snapshot -> compute projections
- Writes current totals/ranks/overall/roster tables
- Known gaps: no transaction ingestion, no job lock

**TradeRecommendationAgent** (`agents/trade-recommendation.ts`)

- Analyzes proposed trades using projected final season standings as baseline
- Generates 1-for-1 trade candidates ranked by projected standings impact
- Simulates trades by swapping rest-of-season projections
- Known gaps: rate stat adjustments not fully implemented (counting stats only)

### Unimplemented Agents

**DraftAssistantAgent** - Snake draft recommendations, auction valuations, scarcity analysis

## API Endpoints

### Leagues (`api/leagues.ts`)

- `POST /api/leagues/connect` - Connect ESPN league
- `GET /api/leagues` - List leagues
- `GET /api/leagues/:id/status` - League status + latest snapshot
- `GET /api/leagues/:id/teams` - List teams
- `PATCH /api/leagues/:id/auth` - Update ESPN auth cookies
- `POST /api/leagues/:id/snapshot` - Trigger manual snapshot

### Projections (`api/projections.ts`)

- `POST /api/projections/upload` - Upload CSV (multipart), triggers re-snapshot for degraded leagues
- `GET /api/projections` - List projection runs
- `GET /api/projections/:runId` - Get specific run details

### Time Series (`api/timeseries.ts`)

- `GET /api/leagues/:id/timeseries/overall` - Overall standings over time
- `GET /api/leagues/:id/timeseries/category-rank` - Category rank over time
- `GET /api/leagues/:id/timeseries/projected-overall` - Projected overall over time
- `GET /api/leagues/:id/standings/projected` - Latest projected standings by category
- `GET /api/leagues/:id/timeseries/annotations` - Transaction annotations

Missing: `category-total` and `projected-category` time series endpoints.

### Recommendations (`api/recommendations.ts`)

- `GET /api/leagues/:id/free-agents` - List available free agents with projections
- `GET /api/leagues/:id/teams/:teamId/waivers/recommendations` - AI-generated waiver suggestions
- `POST /api/leagues/:id/teams/:teamId/waivers/evaluate` - Evaluate specific add/drop impact
- `POST /api/leagues/:id/teams/:teamId/trades/impact` - Analyze proposed trade impact
- `GET /api/leagues/:id/teams/:teamId/trades/recommendations` - Generate trade candidates (1-for-1)
- `GET /api/leagues/:id/teams/:teamId/trades/partners` - List potential trade partner teams
- `GET /api/leagues/:id/teams/:teamId/trades/partners/:partnerTeamId/rosters` - Get both teams' rosters with projections for manual trade building
- `GET /api/leagues/:id/draft/recommendations` - Draft suggestions (stub)

## Component Math (Rate Stats)

Rate stats use component-based formulas from `packages/shared/src/formulas.ts`:

- AVG = H / AB
- OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
- SLG = TB / AB
- OPS = OBP + SLG
- ERA = 9 \* ER / IP
- WHIP = (H + BB) / IP

Projected values combine current-to-date components + remaining-season projected components, then compute the rate from totals. Never average rates directly.

## Key Patterns

- **Degraded snapshots**: `league_daily_snapshot.is_degraded` + `degraded_reasons` JSONB array (e.g., `["projections_missing"]`, `["projections_stale"]`)
- **Team selection**: Frontend stores selected team per league in `localStorage` key `league_${leagueId}_team`
- **Projections are global**: Not league-specific. `projections_run` and `player_projection` are shared across all leagues.
- **Empty array guard**: Kysely generates invalid SQL for `WHERE col IN ()`. Always check `array.length > 0` before using `.where("col", "in", array)`.

## Known Issues / Technical Debt

1. Free agent pool never fetched from ESPN
2. PlayerIdentityResolution not wired into projections ingest
3. Frontend `api.ts` client library exists but is never used (all pages hardcode localhost:3001)
4. No shared frontend components - all UI duplicated per-page
5. Recharts installed but not used (trends page renders tables)
6. Home page links to `/projections`, `/waivers`, `/trends` which are 404s (correct routes are under `/leagues/[id]/...`)
7. ESPN auth cookies stored in plaintext (design doc requires encrypted-at-rest)
8. No retry/backoff on ESPN API calls
9. TradeRecommendationAgent doesn't handle rate stat adjustments (counting stats only)
10. DraftAssistantAgent not implemented
