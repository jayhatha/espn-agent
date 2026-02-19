# Architecture

## Overview

ESPN Fantasy Baseball Assistant follows a **monorepo architecture** (Turbo + pnpm) with three packages and a clear separation between backend API, frontend UI, and shared type definitions.

**Pattern:** Layered architecture with agent-based business logic

**Entry Points:**
- `packages/backend/src/index.ts` — Fastify HTTP server (port 3001)
- `packages/backend/src/workers/snapshot.ts` — BullMQ worker process (separate entrypoint)
- `packages/frontend/src/app/layout.tsx` — Next.js App Router root layout (port 3000)

## Layers

### 1. Frontend (Next.js 14 App Router)

- **Routing:** File-based via `packages/frontend/src/app/`
- **State:** TanStack Query v5 for server state, `localStorage` for team selection
- **Providers:** `providers.tsx` wraps app in `QueryClientProvider`
- **Navigation:** Shared `navigation.tsx` component in app root
- **Pages:** Each route is a `page.tsx` under `app/leagues/[id]/...`

### 2. API Layer (Fastify route modules)

Route modules registered in `packages/backend/src/index.ts`:

| Module | Prefix | Purpose |
|--------|--------|---------|
| `api/auth.ts` | `/api/auth` | JWT-based auth (register, login) |
| `api/auth-oauth.ts` | `/api/auth` | OAuth providers (Google, GitHub) |
| `api/leagues.ts` | `/api/leagues` | League CRUD, connect ESPN, snapshots |
| `api/projections.ts` | `/api/projections` | CSV upload, projection runs |
| `api/timeseries.ts` | `/api/leagues/:id/timeseries` | Historical data queries |
| `api/recommendations.ts` | `/api/leagues/:id` | Waivers, trades, draft suggestions |
| `api/slack.ts` | `/api/slack` | Slack integration (feature-flagged) |
| `api/internal.ts` | `/api/internal` | Internal/admin endpoints |

**Plugins:** CORS, JWT (`@fastify/jwt`), multipart upload, Redis (conditional)

### 3. Agent Layer (Business Logic)

Agents are class-based services in `packages/backend/src/agents/`. Each agent:
- Accepts `Kysely<Database>` db instance + optional Pino `Logger`
- Has a single responsibility
- Marks outputs as degraded when data is incomplete

**Agent dependency graph:**
```
SnapshotOrchestratorAgent
  ├── ESPNAdapter (fetch + normalize ESPN data)
  └── StandingsProjectionAgent (compute projected standings)

ProjectionsIngestAgent (standalone — CSV parsing)
PlayerIdentityResolutionAgent (standalone — fuzzy matching, currently disconnected)
WaiverRecommendationAgent (standalone — add/drop simulation)
TradeRecommendationAgent (standalone — trade impact analysis)
MorningReportAgent (standalone — daily report generation)
```

### 4. Data Layer (Kysely + PostgreSQL)

- **ORM:** Kysely (type-safe SQL builder, not a traditional ORM)
- **Schema:** `packages/backend/src/db/schema.ts` — TypeScript interfaces mapping to 20+ tables
- **Migrations:** Raw SQL in `packages/backend/src/db/migrations/` (001-006)
- **Connection:** `packages/backend/src/db/connection.ts` — singleton `getDb()` pattern

### 5. Shared Package

- `packages/shared/src/types.ts` — Canonical type definitions (League, Team, Player, projections, etc.)
- `packages/shared/src/formulas.ts` — Component-based stat formulas (AVG, OBP, SLG, OPS, ERA, WHIP)

## Data Flow

### Daily Snapshot Pipeline
```
ESPN API → ESPNAdapter.fetchLeague()
  → Archive raw payload (league_raw_payload)
  → Normalize to canonical models
  → Write snapshot tables:
      league_daily_snapshot
      team_daily_category_totals
      team_daily_category_ranks
      team_daily_overall
      team_roster_snapshot
  → StandingsProjectionAgent.projectStandings()
      → team_daily_projected_category
      → team_daily_projected_overall
```

### Projections Upload Flow
```
FanGraphs CSV → POST /api/projections/upload
  → ProjectionsIngestAgent.ingest()
      → projections_run (metadata)
      → player_projection (per-player rows)
      → Re-trigger snapshot if leagues are degraded
```

### Frontend Data Flow
```
Next.js page → fetch(`http://localhost:3001/api/...`)
  → Fastify route handler
  → Kysely query → PostgreSQL
  → JSON response → TanStack Query cache → React render
```

## Background Processing

- **BullMQ** workers run as a separate process (`packages/backend/src/workers/snapshot.ts`)
- **Redis** used as BullMQ queue backend
- **Scheduled jobs:** Daily snapshot at 03:00 timezone (configured in worker)
- **Manual triggers:** `POST /api/leagues/:id/snapshot` enqueues immediate snapshot

## Authentication & Authorization

- **JWT-based:** `@fastify/jwt` with configurable secret and expiration
- **OAuth:** Google + GitHub providers (conditional on env vars)
- **Middleware:** `packages/backend/src/middleware/auth.ts` — `authenticate` and `requireAdmin` decorators
- **Feature flags:** `packages/backend/src/utils/feature-flags.ts` controls optional features (Slack, etc.)

## Key Abstractions

| Abstraction | Location | Purpose |
|-------------|----------|---------|
| `Database` interface | `db/schema.ts` | Kysely database type map |
| Agent classes | `agents/*.ts` | Encapsulated business logic |
| `ESPNAdapter` | `adapters/espn.ts` | ESPN API abstraction |
| Shared types | `shared/src/types.ts` | Cross-package type contracts |
| Feature flags | `utils/feature-flags.ts` | Runtime feature toggles |
| Encryption utils | `utils/encryption.ts` | Token encryption (Slack) |
