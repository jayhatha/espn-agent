# Codebase Structure

**Analysis Date:** 2026-03-13

## Directory Layout

```
espn-agent/
├── packages/
│   ├── shared/src/                    # Core types and utilities (used by all packages)
│   │   ├── types.ts                   # League, team, player, snapshot, projection types
│   │   ├── formulas.ts                # Rate stat calculators (AVG, OBP, SLG, ERA, WHIP, etc.)
│   │   ├── glossary.ts                # Stat category definitions + display names
│   │   └── index.ts                   # Barrel export
│   │
│   ├── backend/src/                   # Fastify HTTP server + background jobs
│   │   ├── index.ts                   # Entry point, server bootstrap, route registration
│   │   ├── db/                        # PostgreSQL persistence via Kysely
│   │   │   ├── schema.ts              # Database interface definitions + table schemas
│   │   │   ├── connection.ts          # Kysely instance singleton
│   │   │   └── migrations/            # SQL migration files
│   │   │
│   │   ├── adapters/                  # External API integrations
│   │   │   ├── espn.ts                # ESPN API client, response normalization, caching
│   │   │   └── mlb-statsapi.ts        # MLB StatsAPI for streaming data
│   │   │
│   │   ├── agents/                    # Business logic (agent pattern)
│   │   │   ├── snapshot-orchestrator.ts        # Daily league snapshot workflow
│   │   │   ├── standings-projection.ts        # Compute projected final standings
│   │   │   ├── projections-ingest.ts          # Parse FanGraphs CSV uploads
│   │   │   ├── player-identity.ts             # Fuzzy player name matching
│   │   │   ├── trade-recommendation.ts        # Analyze trade impact on standings
│   │   │   ├── waiver-recommendation.ts       # Suggest adds/drops
│   │   │   ├── draft-rankings.ts              # Generate draft recommendations
│   │   │   ├── draft-narrator.ts              # Live draft signal generation
│   │   │   ├── auction-valuation.ts           # Compute player auction values
│   │   │   ├── lineup-optimizer.ts            # Optimal daily lineup suggestions
│   │   │   ├── streaming-pitcher.ts           # Identify hot pitcher pickups
│   │   │   ├── player-pool-sync.ts            # Sync player ownership + current stats
│   │   │   ├── transaction-impact.ts          # Compute transaction impact (Roto WPA)
│   │   │   ├── morning-report.ts              # Daily summary report generation
│   │   │   ├── historical-backfill.ts         # Fetch historical ESPN data
│   │   │   └── __tests__/                     # Agent unit tests
│   │   │
│   │   ├── api/                       # HTTP route handlers
│   │   │   ├── leagues.ts             # GET/POST /api/leagues/* endpoints
│   │   │   ├── projections.ts         # POST/GET /api/projections/* endpoints
│   │   │   ├── timeseries.ts          # GET /api/leagues/:id/timeseries/* endpoints
│   │   │   ├── recommendations.ts     # GET /api/leagues/:id/teams/:id/waivers|trades/*
│   │   │   ├── draft.ts               # GET /api/leagues/:id/draft/recommendations
│   │   │   ├── draft-live.ts          # WebSocket /api/draft/live/:draftId
│   │   │   ├── auth.ts                # POST /api/auth/login, /logout, /refresh
│   │   │   ├── auth-oauth.ts          # Google/GitHub OAuth flow
│   │   │   ├── lineup.ts              # GET/POST /api/leagues/:id/lineup/* endpoints
│   │   │   ├── streaming.ts           # GET /api/streaming/* endpoints
│   │   │   ├── transaction-impact.ts  # POST /api/transaction/impact
│   │   │   ├── slack.ts               # Slack event handlers
│   │   │   ├── admin.ts               # Admin-only endpoints
│   │   │   ├── internal.ts            # Internal monitoring endpoints
│   │   │   └── __tests__/             # Route tests
│   │   │
│   │   ├── workers/                   # BullMQ background job processors
│   │   │   ├── snapshot-worker.ts     # Daily league snapshots
│   │   │   ├── backfill-worker.ts     # Historical data fetching
│   │   │   ├── player-pool-worker.ts  # Sync player pool ownership
│   │   │   ├── morning-report-worker.ts  # Generate daily reports
│   │   │   └── slack-approval-worker.ts  # Slack approval flow
│   │   │
│   │   ├── middleware/                # Express/Fastify middleware
│   │   │   └── auth.ts                # JWT authentication, role checks
│   │   │
│   │   ├── utils/                     # Helper functions (non-agent)
│   │   │   ├── encryption.ts          # Encrypt/decrypt secrets
│   │   │   ├── auth-cookies.ts        # Parse and store ESPN cookies
│   │   │   ├── validation.ts          # Zod schemas for request validation
│   │   │   ├── espn-schemas.ts        # Zod schemas for ESPN API responses
│   │   │   ├── feature-flags.ts       # Feature flag configuration
│   │   │   ├── retry.ts               # Retry logic with backoff
│   │   │   ├── slack-gateway.ts       # Slack API client
│   │   │   ├── slack-verify.ts        # Slack signature verification
│   │   │   └── roto-ranking.ts        # Roto point calculation
│   │   │
│   │   └── __tests__/                 # Integration tests
│   │       ├── trade-recommendation.test.ts
│   │       └── test-helpers.ts
│   │
│   ├── frontend/src/                  # Next.js 14 App Router web app
│   │   ├── app/                       # App Router pages and layouts
│   │   │   ├── layout.tsx             # Root layout, TanStack Query provider
│   │   │   ├── page.tsx               # Home page (public landing or authenticated redirect)
│   │   │   │
│   │   │   ├── auth/                  # Auth pages
│   │   │   │   ├── callback/page.tsx  # OAuth callback handler
│   │   │   │   └── ...
│   │   │   ├── login/page.tsx         # Login form
│   │   │   ├── signup/page.tsx        # Sign up form
│   │   │   ├── onboarding/page.tsx    # First-time league setup
│   │   │   │
│   │   │   ├── leagues/               # League-authenticated pages
│   │   │   │   ├── page.tsx           # List user leagues
│   │   │   │   ├── connect/page.tsx   # Connect ESPN league
│   │   │   │   ├── [id]/              # League dashboard (dynamic route)
│   │   │   │   │   ├── page.tsx       # League overview with sections
│   │   │   │   │   ├── _sections/     # Reusable page sections
│   │   │   │   │   │   ├── IdentitySection.tsx    # League name, season, settings
│   │   │   │   │   │   ├── ActionsSection.tsx     # Snapshot buttons, auth update
│   │   │   │   │   │   ├── StatsSection.tsx       # League-wide stats summary
│   │   │   │   │   │   ├── CategoryTableSection.tsx # Current standings table
│   │   │   │   │   │   ├── RosterSection.tsx      # Team roster with players
│   │   │   │   │   │   └── NavigationSection.tsx  # Tabs to sub-pages
│   │   │   │   │   ├── standings/page.tsx   # Current & projected standings
│   │   │   │   │   ├── waivers/page.tsx     # Waiver recommendations
│   │   │   │   │   ├── trades/page.tsx      # Trade analysis + candidates
│   │   │   │   │   ├── projections/page.tsx # Projection upload + run history
│   │   │   │   │   ├── trends/page.tsx      # Historical rankings over time
│   │   │   │   │   ├── streaming/page.tsx   # Streaming pitcher recommendations
│   │   │   │   │   ├── lineup/page.tsx      # Optimal daily lineup suggestions
│   │   │   │   │   ├── moves/page.tsx       # Transaction history
│   │   │   │   │   └── draft/              # Draft tools
│   │   │   │   │       ├── rankings/page.tsx       # Snake draft recommendations
│   │   │   │   │       └── auction/
│   │   │   │   │           ├── page.tsx            # Auction draft board
│   │   │   │   │           └── validate/page.tsx   # Validate auction results
│   │   │   │
│   │   │   ├── draft/                 # Global draft pages
│   │   │   │   └── live/page.tsx      # Mobile companion for live draft
│   │   │   │
│   │   │   ├── admin/                 # Admin-only pages
│   │   │   │   ├── page.tsx           # Admin dashboard
│   │   │   │   ├── draft-board/page.tsx   # Auction validation UI
│   │   │   │   └── auction-validation/page.tsx
│   │   │   │
│   │   │   └── providers.tsx           # Client context providers
│   │   │
│   │   ├── components/                # Reusable UI components
│   │   │   ├── league/                # League-specific components
│   │   │   │   ├── LeagueSelector.tsx
│   │   │   │   ├── TeamSelector.tsx
│   │   │   │   └── ...
│   │   │   ├── ui/                    # Generic UI components
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Table.tsx
│   │   │   │   ├── Container.tsx
│   │   │   │   ├── Heading.tsx
│   │   │   │   ├── Text.tsx
│   │   │   │   ├── LoadingSpinner.tsx
│   │   │   │   └── ...
│   │   │   ├── motion/                # Animation components
│   │   │   │   └── FadeIn.tsx
│   │   │   ├── ProtectedRoute.tsx     # Auth guard wrapper
│   │   │   └── ...
│   │   │
│   │   ├── contexts/                  # React context providers
│   │   │   └── AuthContext.tsx        # useAuth hook, login state
│   │   │
│   │   ├── lib/                       # Client-side utilities
│   │   │   ├── api.ts                 # API client with auto-refresh
│   │   │   └── ...
│   │   │
│   │   ├── public/                    # Static assets
│   │   │   └── favicon.ico
│   │   │
│   │   ├── layout.tsx                 # Root layout
│   │   └── tsconfig.json              # TypeScript config
│   │
│   ├── extension/                     # Chrome extension (Manifest V3)
│   │   ├── entrypoints/               # Extension entry points
│   │   │   ├── popup/                 # Popup UI (React component)
│   │   │   │   └── App.tsx
│   │   │   ├── content.ts             # Content script (injected on ESPN.com)
│   │   │   └── styles/                # Popup styles
│   │   │
│   │   ├── components/                # Extension popup components
│   │   │   ├── DraftBoard.tsx
│   │   │   ├── PriceDisplay.tsx
│   │   │   ├── BidController.tsx
│   │   │   ├── NominationPanel.tsx
│   │   │   └── ...
│   │   │
│   │   ├── lib/                       # Extension logic
│   │   │   ├── auto-bid-controller.ts # Auto-bid and auto-nominate logic
│   │   │   ├── draft-state.ts         # Zustand draft store
│   │   │   ├── draft-config-detector.ts # Parse ESPN draft settings from DOM
│   │   │   ├── dom-observers.ts       # Monitor ESPN price/turn changes
│   │   │   ├── value-calculations.ts  # BID, ASV, Undervalued score
│   │   │   ├── value-detection.ts     # Parse ESPN player values from DOM
│   │   │   ├── api-client.ts          # Backend API client (auth, draft signals)
│   │   │   ├── position-scarcity.ts   # Position-based scarcity scoring
│   │   │   ├── use-draft-engine.ts    # Hook for draft recommendation engine
│   │   │   ├── use-narrator.ts        # Hook for live narrative signals
│   │   │   ├── narrator-state.ts      # Narrator UI state
│   │   │   ├── narrator-types.ts      # Narrator payload types
│   │   │   ├── fangraphs-data.ts      # FanGraphs CSV parsing
│   │   │   ├── logger.ts              # Console logging helper
│   │   │   ├── engine/                # Draft recommendation engine
│   │   │   │   ├── types.ts           # DraftEngineSignals, Recommendation types
│   │   │   │   ├── alerts.ts          # Alert/warning generation
│   │   │   │   └── ...
│   │   │   └── __tests__/             # Unit tests
│   │   │
│   │   ├── styles/                    # Extension popup CSS
│   │   ├── assets/                    # Icons, images
│   │   ├── scripts/                   # Build/dev scripts
│   │   ├── manifest.json              # Chrome extension manifest
│   │   └── wxt.config.ts              # WXT bundler config (Manifest V3)
│   │
│   ├── package.json                   # Root pnpm workspace
│   └── tsconfig.json                  # Root TypeScript config
│
├── .planning/                         # GSD planning documents
│   ├── codebase/                      # Codebase analysis (this file)
│   │   ├── ARCHITECTURE.md
│   │   ├── STRUCTURE.md
│   │   └── ...
│   ├── phases/                        # Phase execution tracking
│   └── config.json                    # GSD configuration
│
├── scripts/                           # Root-level scripts
├── turbo.json                         # Turborepo pipeline config
├── pnpm-workspace.yaml                # pnpm workspace definition
└── package.json                       # Root dependencies (scripts, monorepo tools)
```

## Directory Purposes

**`packages/shared/src/`:**
- Purpose: Centralized type definitions and utility functions shared across all packages
- Contains: TypeScript interfaces (League, Team, Player, Snapshot, Projection, etc.), stat calculation formulas, category glossary
- Key files: `types.ts` (core domain types), `formulas.ts` (AVG, OBP, SLG, OPS, ERA, WHIP calculators)

**`packages/backend/src/db/`:**
- Purpose: PostgreSQL persistence layer via Kysely ORM
- Contains: Database schema (16 tables), migrations, connection management
- Key files: `schema.ts` (Kysely table interfaces), `migrations/` (SQL migration scripts)

**`packages/backend/src/adapters/`:**
- Purpose: External API integrations and data normalization
- Contains: ESPN API client, response validation, rate limiting
- Key files: `espn.ts` (fetch + normalize ESPN league data)

**`packages/backend/src/agents/`:**
- Purpose: Isolated business logic using the agent pattern
- Contains: 15+ agents with single responsibilities (snapshot, projections, standings, recommendations, draft)
- Key files: `snapshot-orchestrator.ts`, `standings-projection.ts`, `projections-ingest.ts`, `trade-recommendation.ts`
- Pattern: Each agent class accepts `Kysely db` + optional `Pino logger`, implements one responsibility

**`packages/backend/src/api/`:**
- Purpose: HTTP route handlers for all REST endpoints + WebSocket connections
- Contains: Fastify route functions organized by feature (leagues, projections, timeseries, recommendations, draft, auth)
- Key files: `leagues.ts` (league CRUD + snapshot triggers), `recommendations.ts` (waivers + trades), `draft-live.ts` (WebSocket)

**`packages/backend/src/workers/`:**
- Purpose: Background async job processing via BullMQ + Redis
- Contains: Job queue definitions and worker functions
- Key files: `snapshot-worker.ts` (daily league snapshots), `backfill-worker.ts` (historical data)

**`packages/backend/src/utils/`:**
- Purpose: Helper utilities, not agents
- Contains: Validation schemas, encryption, retry logic, feature flags, secrets
- Key files: `validation.ts` (Zod schemas), `encryption.ts` (encrypt ESPN cookies)

**`packages/frontend/src/app/`:**
- Purpose: Next.js App Router pages and page-specific layouts
- Contains: Authenticated pages (leagues, standings, trades, waivers, etc.) and public pages (auth, home)
- Key files: `page.tsx` pages (route handlers), `_sections/` components (reusable page sections)
- Pattern: Each page route is in its own directory with `page.tsx` as the entry point

**`packages/frontend/src/components/`:**
- Purpose: Reusable UI components across pages
- Contains: League-specific components, generic UI primitives (Button, Card, Modal, Table), animation components
- Key files: `ui/` (base components), `league/` (league-specific), `motion/` (animations)

**`packages/frontend/src/contexts/`:**
- Purpose: React context providers and hooks
- Contains: Authentication context, user/league selection state
- Key files: `AuthContext.tsx` (login state, useAuth hook)

**`packages/frontend/src/lib/`:**
- Purpose: Client-side utilities (not components)
- Contains: API client with auto-refresh, URL helpers, data transformers
- Key files: `api.ts` (fetch wrapper with JWT refresh)

**`packages/extension/lib/`:**
- Purpose: Core extension logic and state management
- Contains: DOM observers, auto-bid controller, Zustand store, draft simulation engine
- Key files: `auto-bid-controller.ts` (auto-bid + auto-nominate), `draft-state.ts` (Zustand store), `dom-observers.ts` (ESPN monitoring)

**`packages/extension/entrypoints/`:**
- Purpose: Extension entry points (popup UI, content script)
- Contains: React popup component, content script for DOM injection
- Key files: `popup/App.tsx` (popup React component), `content.ts` (content script entry)

## Key File Locations

**Entry Points:**
- Backend HTTP: `packages/backend/src/index.ts` (Fastify server bootstrap)
- Backend Workers: `packages/backend/src/workers/snapshot-worker.ts` (BullMQ worker)
- Frontend: `packages/frontend/src/app/layout.tsx` + `packages/frontend/src/app/page.tsx` (Next.js root)
- Extension: `packages/extension/entrypoints/popup/App.tsx` (popup UI), `packages/extension/entrypoints/content.ts` (content script)

**Configuration:**
- Turbo: `turbo.json` (build pipeline, caching)
- pnpm: `pnpm-workspace.yaml` (workspace definition)
- TypeScript: `packages/*/tsconfig.json` (per-package configs)
- Backend: `.env.local` (secrets, credentials)
- Extension: `manifest.json` (Chrome extension manifest), `wxt.config.ts` (bundler config)

**Core Logic:**
- Agent pattern: `packages/backend/src/agents/*.ts` (each agent one class, one responsibility)
- API routes: `packages/backend/src/api/*.ts` (route handlers per feature)
- Database: `packages/backend/src/db/schema.ts` (Kysely table definitions)
- Shared types: `packages/shared/src/types.ts` (domain types), `packages/shared/src/formulas.ts` (calculations)

**Testing:**
- Backend agents: `packages/backend/src/agents/__tests__/*.test.ts`
- Backend routes: `packages/backend/src/api/__tests__/*.test.ts`
- Extension: `packages/extension/lib/__tests__/*.test.ts`

## Naming Conventions

**Files:**
- Page components: `page.tsx` (Next.js convention)
- Agents: `{name}-{agent-type}.ts` (e.g., `snapshot-orchestrator.ts`, `standings-projection.ts`)
- API routes: `{feature}.ts` (e.g., `leagues.ts`, `recommendations.ts`)
- Tests: `{name}.test.ts` or `{name}.spec.ts`
- Utilities: `{purpose}.ts` (e.g., `validation.ts`, `encryption.ts`)

**Directories:**
- Feature-based: Pages grouped under `/app/[feature]/` (e.g., `/leagues/`, `/draft/`)
- Type-based: Components grouped as `ui/`, `league/`, `motion/`
- Logical: `agents/`, `api/`, `workers/`, `utils/` organize by responsibility

**Functions:**
- Agent methods: Single main method per agent (e.g., `executeSnapshot()`, `computeProjectedStandings()`)
- API handlers: Named after HTTP method + resource (e.g., `POST /api/leagues/connect` handler)
- Utilities: Verb-noun pattern (e.g., `encryptToken()`, `fuzzyMatchPlayer()`)

**Types:**
- Interfaces: PascalCase suffix `Agent`, `Schema`, `Options`, `Response` (e.g., `SnapshotOrchestratorAgent`, `ConnectLeagueSchema`)
- Enums: UPPER_SNAKE_CASE values (e.g., `"COUNTING"`, `"RATE"`)

**Variables:**
- camelCase for variables, parameters, functions
- UPPER_SNAKE_CASE for constants (e.g., `ESPN_STAT_MAP`, `FUZZY_MATCH_CONFIDENCE_THRESHOLD`)

## Where to Add New Code

**New Feature Endpoint:**

1. **Create API handler:**
   - File: `packages/backend/src/api/{feature}.ts`
   - Export async function `{feature}Routes(app: FastifyInstance)`
   - Register routes: `app.get("/api/path", handler)`, `app.post("/api/path", handler)`
   - Import and register in `packages/backend/src/index.ts`

2. **Create/modify agent if needed:**
   - File: `packages/backend/src/agents/{name}.ts`
   - Export class with single main method
   - Constructor: accepts `db: Kysely<Database>`, optional `logger?: Logger`
   - Return degradation status for failures

3. **Create frontend page if needed:**
   - Directory: `packages/frontend/src/app/[route]/`
   - File: `page.tsx` (default export)
   - Use `useEffect(() => { api.get(...) })` for data fetching
   - No hardcoded API URLs (use `api.ts` client)

4. **Write tests:**
   - Agent tests: `packages/backend/src/agents/__tests__/{name}.test.ts`
   - Route tests: `packages/backend/src/api/__tests__/{name}.test.ts`

**New Component:**

1. **Determine scope:**
   - Reusable across pages? → `packages/frontend/src/components/{category}/{ComponentName}.tsx`
   - Page-specific? → Colocate in `packages/frontend/src/app/[route]/components/` (or inline in page)

2. **File location:**
   - Generic UI primitives: `packages/frontend/src/components/ui/{ComponentName}.tsx`
   - League-specific: `packages/frontend/src/components/league/{ComponentName}.tsx`
   - Motion/animation: `packages/frontend/src/components/motion/{ComponentName}.tsx`

3. **Styling:**
   - Use Tailwind CSS classes only (no CSS files or styled-components)
   - Follow existing component patterns (Button, Card, etc.)

**New Shared Type:**

1. File: `packages/shared/src/types.ts`
2. Export TypeScript interface
3. Use in backend agents (import from `"../../../shared/dist/index.js"`)
4. Use in frontend components (import from same)

**New Database Table:**

1. Define interface in `packages/backend/src/db/schema.ts`
2. Add to `Database` interface
3. Create migration: `packages/backend/src/db/migrations/{timestamp}_{name}.sql`
4. Run: `npm run db:migrate` in backend package

## Special Directories

**`packages/backend/src/db/migrations/`:**
- Purpose: SQL migration scripts (Kysely auto-runs on startup if `AUTO_MIGRATE=1`)
- Generated: No (hand-written SQL)
- Committed: Yes (all migrations in version control)

**`packages/frontend/.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No (in `.gitignore`)

**`packages/extension/.output/`:**
- Purpose: WXT bundled extension output (Manifest V3)
- Generated: Yes (built by `npm run build`)
- Committed: No (in `.gitignore`)

**`.planning/phases/`:**
- Purpose: GSD execution tracking for features
- Generated: Yes (created by `/gsd:plan-phase` and `/gsd:execute-phase`)
- Committed: Yes (phase documentation is version-controlled)

**`node_modules/`, `.wxt/`:**
- Purpose: Dependencies and build caches
- Generated: Yes
- Committed: No (in `.gitignore`)

---

*Structure analysis: 2026-03-13*
