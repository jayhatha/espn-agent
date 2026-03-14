# Architecture

**Analysis Date:** 2026-03-13

## Pattern Overview

**Overall:** Layered monorepo with agent-driven backend business logic, API-centric frontend state management, and isolated Chrome extension for live draft automation.

**Key Characteristics:**
- Agent pattern encapsulates discrete business responsibilities (snapshot, projections, standings, waivers, trades, drafts)
- Database-driven state with daily snapshots and time-series tracking
- Async job queue (BullMQ + Redis) for background work
- Frontend uses TanStack Query for server state and Zustand for local UI state
- Extension uses DOM observation and WebSocket subscription for live draft signals

## Layers

**Data/Persistence Layer:**
- Purpose: Store and retrieve all league, team, player, projection, and transaction data
- Location: `packages/backend/src/db/`
- Contains: Kysely schema (`schema.ts`), migrations, connection management
- Depends on: PostgreSQL (external), environment config
- Used by: All backend agents and API routes

**ESPN Integration Layer:**
- Purpose: Fetch and normalize ESPN league data, handle auth cookies, detect schema drift
- Location: `packages/backend/src/adapters/espn.ts`
- Contains: HTTP client, response validation, rate limiting, in-memory caching
- Depends on: Axios, Pino logging, ESPN API endpoints
- Used by: SnapshotOrchestratorAgent, various manual snapshot triggers

**Agent Layer (Core Business Logic):**
- Purpose: Each agent owns one responsibility (snapshot orchestration, projections, standings, recommendations, draft analysis)
- Location: `packages/backend/src/agents/`
- Contains: Specialized agent classes with single responsibility
- Depends on: Kysely database, Pino logging
- Used by: API routes, background workers

**API Route Layer:**
- Purpose: HTTP endpoints for leagues, projections, timeseries, recommendations, draft, authentication
- Location: `packages/backend/src/api/`
- Contains: Fastify route handlers, validation, auth middleware
- Depends on: Agents, database, authentication utilities
- Used by: Frontend, extension, external clients

**Background Job Layer:**
- Purpose: Async execution of long-running tasks (snapshots, backfill, player pool sync, morning reports)
- Location: `packages/backend/src/workers/`
- Contains: BullMQ queue and worker definitions
- Depends on: Redis, agents, Pino logging
- Used by: Manual triggers, scheduled cron jobs

**Shared Types Layer:**
- Purpose: Central type definitions used across backend, frontend, and extension
- Location: `packages/shared/src/`
- Contains: Core types, stat formulas (AVG, OBP, SLG, OPS, ERA, WHIP), glossary
- Depends on: Nothing (pure types and functions)
- Used by: All packages

**Frontend Page Layer:**
- Purpose: Next.js App Router pages with server and client components
- Location: `packages/frontend/src/app/`
- Contains: Authenticated pages (leagues, standings, trades, waivers, projections, lineup, streaming) and public pages (auth, home)
- Depends on: API client, TanStack Query, Tailwind, Recharts
- Used by: Web browsers

**Frontend Component Layer:**
- Purpose: Reusable UI components (league-specific, motion, generic UI)
- Location: `packages/frontend/src/components/`
- Contains: League components, motion/animation components, generic UI primitives
- Depends on: Tailwind CSS, Lucide icons
- Used by: Pages in the app layer

**Extension Layer:**
- Purpose: Chrome extension for live draft automation and overlay UI
- Location: `packages/extension/`
- Contains: DOM observers, auto-bid controller, draft state management, simulator engine
- Depends on: Zustand for state, WebSockets for live signals
- Used by: Draft participants on ESPN.com

## Data Flow

**Daily League Snapshot:**

1. Cron trigger (03:00 UTC) → calls `POST /api/leagues/:id/snapshot`
2. API route calls `SnapshotOrchestratorAgent.executeSnapshot()`
3. Agent sequence:
   - Fetch ESPN league data via `ESPNAdapter.fetchLeague()`
   - Normalize to canonical models, archive raw response
   - Write `league_daily_snapshot` with settings version
   - Write team rosters to `team_roster_snapshot`
   - Compute category totals → `team_daily_category_totals`
   - Compute category ranks → `team_daily_category_ranks`
   - Compute roto points → `team_daily_overall`
   - Trigger `StandingsProjectionAgent` to compute projected standings
4. Returns snapshot record with degradation status

**Projections Upload & Re-snapshot:**

1. Frontend: `POST /api/projections/upload` (multipart CSV)
2. API route parses batters/pitchers CSV
3. Calls `ProjectionsIngestAgent.ingestProjections()`
4. Agent uses `PlayerIdentityResolutionAgent` for fuzzy name matching
5. Inserts rows to `projections_run` + `player_projection` tables
6. If projections fresh, re-triggers snapshot jobs for all degraded leagues
7. Returns projection run summary with match statistics

**Trade Impact Analysis:**

1. Frontend: `POST /api/leagues/:id/teams/:teamId/trades/impact`
2. API validates proposed trade (add/drop players)
3. Calls `TradeRecommendationAgent.analyzeTradeImpact()`
4. Agent:
   - Fetches current projected standings for baseline
   - Simulates trade by swapping rest-of-season projections
   - Recomputes roto standings impact
   - Returns delta per category and overall points gain/loss
5. Returns impact data for each team

**Live Draft Auto-Bid:**

1. Chrome extension loads, establishes WebSocket connection to backend
2. Backend subscribes user to WebSocket "draft:{draftId}" channel
3. Extension monitors DOM for price changes and turn detection
4. On user turn: extension calls `GET /api/draft/recommendations` for top nominations
5. Backend `DraftNarratorAgent` generates signals (shouldBid, maxBid, topTargets)
6. Extension `AutoBidController` watches signals, clicks ESPN "+1 bid" button when price < maxBid
7. On nomination trigger: extension auto-selects top queued player from extension Zustand store
8. All state changes broadcast over WebSocket for real-time mobile companion view

**State Management:**

**Backend State:**
- Database tables are source of truth for league/team/player/projection data
- Daily snapshots create immutable historical records
- Redis caches active projections runs and throttles ESPN API calls

**Frontend State:**
- TanStack Query maintains server-synced data (leagues, standings, timeseries)
- Zustand manages UI-only state (selected team, modal open/closed)
- localStorage persists selected team per league across sessions

**Extension State:**
- Zustand `useDraftStore` tracks: auctionPrice, currentBatter, rosterStatus, queuedPlayers, engineSignals
- DOM observers detect ESPN state changes (price, turn, new player)
- Signals subscribe via WebSocket and update Zustand in real-time

## Key Abstractions

**Agent Base Pattern:**
- Purpose: Isolate business logic responsibilities from HTTP/IO details
- Examples: `SnapshotOrchestratorAgent`, `StandingsProjectionAgent`, `TradeRecommendationAgent`
- Pattern: Single class method per responsibility, always mark degraded outputs, never fabricate missing data
- Dependencies: `Kysely` database instance, optional `Pino` logger, no HTTP/IO direct

**Degraded Data Marker:**
- Purpose: Flag incomplete/unreliable data without fabricating estimates
- Location: `league_daily_snapshot.is_degraded` (boolean), `degraded_reasons` (JSONB array)
- Values: `["projections_missing"]`, `["projections_stale"]`, `["espn_fetch_error"]`, etc.
- Used by: Frontend to show warnings, APIs to filter results, workflows to trigger re-snapshots

**Component-Based Rate Stat Calculation:**
- Purpose: Combine current-to-date + remaining-season stats using component math
- Examples: AVG = H / AB, ERA = 9 * ER / IP
- Implementation: `calculateFinalRate(currentComponents, projectedComponents)` in `packages/shared/src/formulas.ts`
- Never average rates directly (always rebuild from totals)

**Time Series Snapshots:**
- Purpose: Track league progression over time for trends and rankings
- Tables: `team_daily_category_totals`, `team_daily_category_ranks`, `team_daily_overall` (one per day per team)
- Indices: (league_id, team_id, snapshot_date) for efficient range queries
- Used by: Timeseries API endpoints, trends visualization, trade impact simulation

**Settings Version Snapshot:**
- Purpose: Capture league category/roster configuration at specific snapshot date
- Location: `league_settings_version` table
- Contains: JSONB column with full `LeagueSettings` (categories, roster_slots, acquisition_rules)
- Enables: Accurate historical replay if league settings changed mid-season

**Extension WebSocket Subscription Model:**
- Purpose: Push live draft signals from backend to extension without polling
- Flow: Extension connects → registers for "draft:{draftId}" → backend broadcasts signals → extension updates UI
- Payloads: `DraftEngineSignals` with shouldBid, maxBid, topTargets, narrativeEvent
- Fallback: If WebSocket drops, extension polls via `GET /api/draft/live/{draftId}`

## Entry Points

**Backend HTTP Entry:**
- Location: `packages/backend/src/index.ts`
- Triggers: `npm run dev` or container startup
- Responsibilities:
  - Initialize Fastify with plugins (cors, jwt, websocket, multipart, redis, rate-limit)
  - Register route handlers (auth, leagues, projections, timeseries, recommendations, draft, etc.)
  - Setup graceful shutdown on SIGINT/SIGTERM
  - Port 3001 (default)

**Background Worker Entry:**
- Location: `packages/backend/src/workers/snapshot-worker.ts`
- Triggers: Separate process (distinct from HTTP server)
- Responsibilities:
  - Listen for jobs on BullMQ "snapshots" queue
  - Execute `SnapshotOrchestratorAgent` for each job
  - Move failed jobs to DLQ after max retries
  - Concurrency: 3 parallel snapshot jobs

**Frontend App Entry:**
- Location: `packages/frontend/src/app/layout.tsx` + `packages/frontend/src/app/page.tsx`
- Triggers: `npm run dev` or Next.js build
- Responsibilities:
  - Initialize authentication context (AuthContext, useAuth hook)
  - Set up TanStack Query and Tailwind
  - Route unauthenticated users to login, authenticated to leagues
  - Port 3000 (default)

**Extension Popup Entry:**
- Location: `packages/extension/entrypoints/popup/App.tsx`
- Triggers: User clicks extension icon on ESPN.com during draft
- Responsibilities:
  - Initialize Zustand draft store
  - Connect WebSocket to backend
  - Display live signals (price, bid cap, top targets, narrative)
  - Trigger auto-bid and nomination via `AutoBidController`

**Extension Content Script Entry:**
- Location: `packages/extension/entrypoints/content.ts` (inferred from wxt build)
- Triggers: Content script injected on ESPN.com
- Responsibilities:
  - Initialize DOM observers for ESPN price/turn detection
  - Populate Zustand store with ESPN state
  - Fire mutations and UI updates based on store changes

## Error Handling

**Strategy:** Explicit degradation > silent failure > hard errors

**Patterns:**

**API Validation Errors:**
```typescript
// packages/backend/src/api/leagues.ts (example)
const validation = ConnectLeagueSchema.safeParse(request.body);
if (!validation.success) {
  return reply.code(400).send({
    error: "Validation failed",
    details: validation.error.errors
  });
}
```

**Degraded Snapshot Handling:**
```typescript
// packages/backend/src/agents/snapshot-orchestrator.ts
// If ESPN fetch fails or projections missing, mark snapshot degraded
await db
  .updateTable("league_daily_snapshot")
  .set({
    is_degraded: true,
    degraded_reasons: ["projections_missing"],
  })
  .execute();
```

**Agent Data Validation:**
- Agents check for empty arrays before SQL `WHERE col IN ()` to prevent invalid SQL
- Agents log data gaps but never fabricate values
- Example: WaiverRecommendationAgent defaults free_agent_pool to empty array if fetch fails

**Async Job Failure Handling:**
- BullMQ retries failed jobs up to 3 times with exponential backoff
- Failed jobs moved to DLQ after max retries
- Slack notification sent on DLQ move (if enabled)

**Frontend Auth Retry:**
```typescript
// packages/frontend/src/lib/api.ts
// On 401: attempt silent refresh of JWT token
// If refresh succeeds: retry original request
// If refresh fails: redirect to /login
```

## Cross-Cutting Concerns

**Logging:** Pino logger instance passed to all agents, includes jobId/leagueId for tracing

**Validation:**
- Backend uses Zod schemas (`packages/backend/src/utils/validation.ts`) for request bodies
- ESPN responses validated via Zod schemas (`packages/backend/src/utils/espn-schemas.ts`)
- Frontend uses TypeScript types only (no runtime validation)

**Authentication:**
- Backend: JWT token in cookies or Authorization header, verified via Fastify JWT plugin
- Frontend: Stored in httpOnly cookie, auto-refresh on 401
- Extension: Uses session cookie from browser (local dev only)

**Rate Limiting:** Fastify rate-limit plugin per-route (configured in each route handler)

**Secrets Management:**
- ESPN auth cookies stored encrypted at rest (via `utils/encryption.ts`)
- JWT secret + Cookie secret from environment variables
- OAuth client IDs for Google and GitHub (optional)

---

*Architecture analysis: 2026-03-13*
