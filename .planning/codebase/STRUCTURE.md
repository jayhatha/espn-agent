# Structure

## Monorepo Layout

```
espn-agent/
├── packages/
│   ├── backend/           # Fastify API + agents + workers
│   ├── frontend/          # Next.js 14 App Router
│   └── shared/            # Types + formulas
├── scripts/               # Deployment/utility scripts
├── .github/               # CI/CD workflows
├── docker-compose.dev.yml # Local dev environment
├── railway.backend.json   # Railway backend config
├── railway.frontend.json  # Railway frontend config
├── railway.workers.json   # Railway worker config
├── turbo.json             # Turborepo configuration
├── pnpm-workspace.yaml    # pnpm workspace definition
└── package.json           # Root package.json
```

## Backend (`packages/backend/src/`)

```
src/
├── index.ts                  # Fastify server entry point (port 3001)
├── adapters/
│   └── espn.ts               # ESPN Fantasy API adapter (fetch, normalize, cache)
├── agents/
│   ├── snapshot-orchestrator.ts   # Daily snapshot pipeline orchestrator
│   ├── standings-projection.ts    # Projected final standings calculator
│   ├── projections-ingest.ts      # FanGraphs CSV parser + DB writer
│   ├── player-identity.ts         # Fuzzy player name matching
│   ├── waiver-recommendation.ts   # Add/drop impact simulation
│   ├── trade-recommendation.ts    # Trade impact analysis + candidate generation
│   └── morning-report.ts          # Daily report generator
├── api/
│   ├── auth.ts               # JWT auth routes (register, login, me)
│   ├── auth-oauth.ts         # OAuth routes (Google, GitHub callback)
│   ├── leagues.ts            # League CRUD + ESPN connect + snapshot trigger
│   ├── projections.ts        # CSV upload + projection run queries
│   ├── timeseries.ts         # Historical standings/category data
│   ├── recommendations.ts    # Waivers, trades, draft endpoints
│   ├── slack.ts              # Slack integration (events, commands, oauth)
│   └── internal.ts           # Internal/admin API endpoints
├── db/
│   ├── schema.ts             # Kysely Database interface (20+ tables)
│   ├── connection.ts         # Singleton DB connection (getDb())
│   ├── migrate.ts            # Migration runner
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_add_performance_indexes.sql
│       ├── 003_add_auth_columns.sql
│       ├── 004_add_user_team_id.sql
│       ├── 005_add_slack_integration.sql
│       └── 006_add_users_and_auth.sql
├── middleware/
│   └── auth.ts               # authenticate + requireAdmin middleware
├── models/                   # (empty — types live in shared package)
├── utils/
│   ├── encryption.ts         # Token encryption for Slack bot tokens
│   ├── feature-flags.ts      # Runtime feature flag system
│   ├── slack-gateway.ts      # Slack Web API gateway
│   └── slack-verify.ts       # Slack request signature verification
├── workers/
│   └── snapshot.ts           # BullMQ worker for scheduled snapshots
└── scripts/
    ├── start-dev.sh          # Dev server startup script
    └── start-worker.sh       # Worker process startup script
```

## Frontend (`packages/frontend/src/`)

```
src/
├── app/
│   ├── layout.tsx            # Root layout (Inter font, Navigation, Providers)
│   ├── page.tsx              # Home/landing page
│   ├── globals.css           # Tailwind CSS imports + global styles
│   ├── providers.tsx         # QueryClientProvider wrapper
│   ├── navigation.tsx        # Shared top navigation bar
│   ├── login/page.tsx        # Login form
│   ├── signup/page.tsx       # Registration form
│   ├── admin/page.tsx        # Admin dashboard
│   ├── auth/callback/page.tsx # OAuth callback handler
│   └── leagues/
│       ├── page.tsx          # League list
│       ├── connect/page.tsx  # Connect ESPN league form
│       └── [id]/
│           ├── page.tsx      # League dashboard (overview)
│           ├── standings/page.tsx  # Current + projected standings
│           ├── trades/page.tsx     # Trade analysis + recommendations
│           ├── trends/page.tsx     # Category trends over time
│           └── waivers/page.tsx    # Waiver recommendations
├── components/               # (exists but currently empty)
├── contexts/                 # React contexts (auth, etc.)
├── lib/
│   └── api.ts                # API client (exists but pages hardcode localhost:3001)
└── public/                   # Static assets
```

## Shared (`packages/shared/src/`)

```
src/
├── types.ts      # All canonical type definitions (League, Team, Player, projections, etc.)
├── formulas.ts   # Rate stat component formulas (AVG, OBP, SLG, OPS, ERA, WHIP)
└── index.ts      # Barrel export
```

## Key Locations

| What | Where |
|------|-------|
| Server entry | `packages/backend/src/index.ts` |
| Worker entry | `packages/backend/src/workers/snapshot.ts` |
| DB schema types | `packages/backend/src/db/schema.ts` |
| DB migrations | `packages/backend/src/db/migrations/` |
| ESPN API client | `packages/backend/src/adapters/espn.ts` |
| All agents | `packages/backend/src/agents/` |
| API routes | `packages/backend/src/api/` |
| Shared types | `packages/shared/src/types.ts` |
| Stat formulas | `packages/shared/src/formulas.ts` |
| Frontend pages | `packages/frontend/src/app/` |
| Frontend API client | `packages/frontend/src/lib/api.ts` |

## Naming Conventions

- **Files:** kebab-case (`snapshot-orchestrator.ts`, `trade-recommendation.ts`)
- **Classes:** PascalCase (`SnapshotOrchestratorAgent`, `ESPNAdapter`)
- **DB tables:** snake_case (`team_daily_category_totals`)
- **API routes:** kebab-case paths (`/api/leagues/:id/free-agents`)
- **Types:** PascalCase (`LeagueSettings`, `TeamDailyOverall`)
- **Frontend routes:** Next.js App Router conventions (`[id]` dynamic segments)

## Configuration Files

| File | Purpose |
|------|---------|
| `turbo.json` | Turborepo build pipeline |
| `pnpm-workspace.yaml` | Workspace package declarations |
| `docker-compose.dev.yml` | Local dev with PostgreSQL + Redis |
| `railway.backend.json` | Railway backend deployment |
| `railway.frontend.json` | Railway frontend deployment |
| `railway.workers.json` | Railway worker deployment |
| `packages/backend/tsconfig.json` | Backend TypeScript config |
| `packages/backend/Dockerfile` | Production backend image |
| `packages/backend/Dockerfile.dev` | Dev backend image |
| `packages/frontend/Dockerfile` | Production frontend image |
| `packages/frontend/Dockerfile.dev` | Dev frontend image |
