# Project Structure

```
espn-agent/
├── # DESIGN_DOC.md           # Complete design specification
├── AGENTS.md                  # Agent architecture documentation
├── README.md                  # Project overview
├── GETTING_STARTED.md         # Setup and usage guide
├── ROADMAP.md                 # Development roadmap
├── package.json               # Root package.json for monorepo
├── turbo.json                 # Turbo monorepo configuration
├── .gitignore                 # Git ignore rules
│
├── packages/
│   ├── shared/                # Shared types and utilities
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts       # Exports
│   │       ├── types.ts       # Core type definitions
│   │       └── formulas.ts    # Component-based stat formulas
│   │
│   ├── backend/               # Node.js/TypeScript backend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── .env.example       # Environment variables template
│   │   └── src/
│   │       ├── index.ts       # Main server entry point
│   │       ├── db/
│   │       │   ├── schema.ts           # Database schema types
│   │       │   ├── connection.ts       # Database connection
│   │       │   ├── migrate.ts          # Migration runner
│   │       │   └── migrations/
│   │       │       └── 001_initial_schema.sql
│   │       ├── adapters/
│   │       │   └── espn.ts             # ESPN API adapter
│   │       ├── agents/
│   │       │   ├── projections-ingest.ts      # FanGraphs CSV ingest
│   │       │   ├── player-identity.ts         # Player matching
│   │       │   ├── standings-projection.ts    # Projected standings
│   │       │   ├── waiver-recommendation.ts   # Waiver wire suggestions
│   │       │   └── snapshot-orchestrator.ts   # Daily snapshot job
│   │       ├── api/
│   │       │   ├── leagues.ts          # League endpoints
│   │       │   ├── projections.ts      # Projections endpoints
│   │       │   ├── timeseries.ts       # Time series data
│   │       │   └── recommendations.ts  # Recommendations
│   │       └── workers/
│   │           └── snapshot-worker.ts  # Background job worker
│   │
│   └── frontend/              # Next.js frontend
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.mjs
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       ├── .env.local.example
│       └── src/
│           ├── app/
│           │   ├── layout.tsx      # Root layout
│           │   ├── page.tsx        # Home page
│           │   ├── providers.tsx   # React Query provider
│           │   └── globals.css     # Global styles
│           └── lib/
│               └── api.ts          # API client functions
```

## Key Components

### Backend Services

1. **Fastify API Server** (`packages/backend/src/index.ts`)
   - REST API with CORS support
   - Redis integration for caching
   - Health checks
   - Graceful shutdown

2. **Database Layer** (`packages/backend/src/db/`)
   - Kysely query builder
   - PostgreSQL connection pool
   - Migration system
   - Comprehensive schema

3. **Agents** (`packages/backend/src/agents/`)
   - ESPNAdapter: Fetches and normalizes ESPN data
   - ProjectionsIngestAgent: Ingests FanGraphs CSV projections
   - PlayerIdentityResolutionAgent: Matches players across systems
   - StandingsProjectionAgent: Computes projected standings
   - WaiverRecommendationAgent: Generates waiver recommendations
   - SnapshotOrchestratorAgent: Orchestrates daily snapshots

4. **API Routes** (`packages/backend/src/api/`)
   - `/api/leagues/*` - League management
   - `/api/projections/*` - Projections upload and retrieval
   - `/api/leagues/:id/timeseries/*` - Historical data
   - `/api/leagues/:id/teams/:id/waivers/*` - Recommendations

5. **Background Workers** (`packages/backend/src/workers/`)
   - BullMQ-based job queue
   - Daily snapshot scheduler
   - Retry logic and error handling

### Frontend Application

1. **Next.js App Router** (`packages/frontend/src/app/`)
   - Server components by default
   - Client components where needed
   - File-based routing

2. **State Management**
   - TanStack Query for server state
   - React Context for UI state (providers)

3. **Styling**
   - Tailwind CSS for utility classes
   - Responsive mobile-first design

4. **API Integration** (`packages/frontend/src/lib/api.ts`)
   - Type-safe API client
   - Centralized fetch functions

### Shared Package

1. **Types** (`packages/shared/src/types.ts`)
   - All core domain types
   - Database table interfaces
   - Shared enums

2. **Formulas** (`packages/shared/src/formulas.ts`)
   - AVG, OBP, SLG, OPS calculations
   - ERA, WHIP calculations
   - Component combination logic

## Database Schema

The database follows the design from `# DESIGN_DOC.md §4`:

### Core Tables

- `league` - League metadata
- `league_settings_version` - Versioned league settings
- `team` - Teams in leagues
- `player` - Player records
- `player_identity_map` - Player identity resolution

### Snapshot Tables

- `league_daily_snapshot` - Daily snapshot metadata
- `team_daily_category_totals` - Current category totals
- `team_daily_category_ranks` - Current category ranks
- `team_daily_overall` - Current overall standings
- `team_roster_snapshot` - Roster state per day

### Projection Tables

- `projections_run` - Projection run metadata
- `player_projection` - Player projections per run
- `team_daily_projected_category` - Projected category standings
- `team_daily_projected_overall` - Projected overall standings

### Transaction Tables

- `league_transaction_event` - Transaction history
- `league_raw_payload` - Raw ESPN API responses

## Technology Stack

### Backend

- **Runtime**: Node.js 18+
- **Framework**: Fastify 4.x
- **Database**: PostgreSQL 15+ with Kysely
- **Cache/Queue**: Redis 7+ with IORedis and BullMQ
- **Language**: TypeScript 5.x
- **HTTP Client**: Axios

### Frontend

- **Framework**: Next.js 14.x (App Router)
- **Language**: TypeScript 5.x
- **Styling**: Tailwind CSS 3.x
- **Data Fetching**: TanStack Query v5
- **Charts**: Recharts 2.x

### Shared

- **Validation**: Zod 3.x (planned)
- **Dates**: date-fns 3.x

### DevOps

- **Monorepo**: Turbo
- **Package Manager**: pnpm (recommended)
- **Migrations**: Custom SQL-based system

## Architecture Patterns

1. **Multi-Agent Architecture**: Each agent is an isolated module with a single responsibility
2. **Repository Pattern**: Database access is centralized through agents
3. **Component-Based Calculations**: Rate stats use underlying components for accuracy
4. **Time Series Storage**: Daily snapshots enable historical analysis
5. **Event Sourcing (Lite)**: Raw payloads stored for schema evolution
6. **Job Queue**: Background jobs for long-running tasks
7. **API-First**: Backend exposes REST API, frontend is separate

## Next Steps

See `ROADMAP.md` for planned features and `GETTING_STARTED.md` for setup instructions.
