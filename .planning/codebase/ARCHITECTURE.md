# Architecture

**Analysis Date:** 2025-02-23

## Pattern Overview

**Overall:** Three-tier layered architecture with agent-based business logic and adapter pattern for external integrations.

**Key Characteristics:**
- **Monorepo Structure:** Turbo + pnpm with 4 packages sharing types via `packages/shared`
- **Backend:** Fastify REST API, Kysely ORM on PostgreSQL, BullMQ job queue on Redis, Pino logging
- **Frontend:** Next.js 14 App Router, TanStack Query v5, React Context for auth, localStorage for state
- **Extension:** WXT-based Chrome extension with Shadow DOM UI, Zustand store, content script messaging bridge
- **Entrypoints:** Backend server (`index.ts`), snapshot worker (`workers/snapshot-worker.ts`), Next.js pages, Chrome extension content script

## Layers

**Presentation Layer:**
- Purpose: User-facing browser interfaces
- Location: `packages/frontend/src/app/` (Next.js pages), `packages/extension/entrypoints/` (Chrome UI)
- Contains: Page components, layouts, forms (login/signup/connect league), navigation component
- Depends on: API client (`lib/api.ts`), AuthContext, TanStack Query, utility libraries
- Used by: Browser (port 3000), Chrome extension popup/sidebar

**API/Route Layer:**
- Purpose: HTTP request handling, route definitions, authentication, authorization
- Location: `packages/backend/src/api/`, `packages/backend/src/middleware/`
- Contains: Route modules (auth.ts, leagues.ts, projections.ts, recommendations.ts, timeseries.ts, draft.ts, slack.ts, admin.ts, transaction-impact.ts) and auth middleware
- Key endpoints:
  - `/api/auth/*` - Login, register, refresh, OAuth callbacks
  - `/api/leagues/*` - League CRUD, connect ESPN, manual snapshot trigger
  - `/api/projections/*` - CSV upload, list projection runs
  - `/api/leagues/:id/timeseries/*` - Historical snapshots over time
  - `/api/leagues/:id/teams/:teamId/*` - Waivers, trades, lineup, streaming recommendations
  - `/api/slack/*` - Slack events, commands, installation
- Depends on: Agents, database, Fastify server instance, middleware
- Used by: Frontend, extension, Slack integration, other services

**Business Logic Layer (Agents):**
- Purpose: Domain-specific operations with single responsibility principle
- Location: `packages/backend/src/agents/`
- Agent inventory:
  - `snapshot-orchestrator.ts` - Orchestrates daily snapshot: fetch ESPN → archive → normalize → write snapshot tables → compute projections
  - `standings-projection.ts` - Computes projected final standings using component math and Roto points
  - `projections-ingest.ts` - Parses FanGraphs CSV, validates required components, stores player projections
  - `player-identity.ts` - Fuzzy name matching with confidence scoring (currently disconnected from ingest flow)
  - `waiver-recommendation.ts` - Simulates add/drop scenarios, ranks by delta points
  - `trade-recommendation.ts` - Analyzes proposed trades, generates 1-for-1 trade candidates
  - `morning-report.ts` - Generates daily Slack reports with action recommendations
  - `auction-valuation.ts` - Computes auction values for draft using scarcity analysis
  - `draft-rankings.ts` - Generates player rankings for snake draft with value scores
  - `lineup-optimizer.ts` - Optimizes daily lineup for streaming categories
  - `streaming-pitcher.ts` - Identifies streaming pitcher opportunities
  - `historical-backfill.ts` - Backfills snapshots for seasons with historical ESPN data
  - `transaction-impact.ts` - Analyzes WPA impact of trades/moves (Roto points added/lost)
  - `player-pool-sync.ts` - Syncs free agent pool from ESPN (ownership %)
- Depends on: Kysely database, Pino logger (optional), ESPN adapter, shared formulas, utils
- Used by: API routes, worker processes, other agents

**Data Access Layer:**
- Purpose: Database abstraction, schema definition, connection pooling, migrations
- Location: `packages/backend/src/db/`
- Contains:
  - `schema.ts` - TypeScript interfaces for 20+ tables (league, team, player, snapshots, projections, auth, Slack, transactions)
  - `connection.ts` - Singleton Kysely instance with PostgreSQL dialect
  - `migrate.ts` - Migration runner using raw SQL files
  - `migrations/` - SQL migration files (001-006)
- Depends on: PostgreSQL driver, environment config
- Used by: All agents, API routes

**External Integration Layer:**
- Purpose: Adapter pattern for external APIs
- Location: `packages/backend/src/adapters/espn.ts`
- Contains:
  - ESPN API client with axios + retry logic
  - Authentication via SWID + espn_s2 cookies
  - Response normalization to canonical interfaces (ESPNLeagueData, ESPNTeamData, ESPNFreeAgent)
  - Raw response archiving with schema fingerprints for drift detection
- Depends on: Axios, axios-retry, Pino logger (optional)
- Used by: SnapshotOrchestratorAgent, league connection routes

**Shared/Infrastructure Layer:**
- Purpose: Cross-package utilities, type definitions, formula implementations, Slack integration
- Location: `packages/shared/src/`, `packages/backend/src/utils/`
- Shared types: `types.ts` (League, Team, Player, projections, auth, Slack models)
- Shared formulas: `formulas.ts` (AVG, OBP, SLG, OPS, ERA, WHIP, K/9, component combining)
- Backend utilities:
  - `encryption.ts` - AES encryption/decryption for Slack bot tokens
  - `feature-flags.ts` - Runtime feature toggles (slackEnabled, etc.)
  - `retry.ts` - Axios retry wrapper with exponential backoff
  - `slack-gateway.ts` - Slack Web API client wrapper
  - `slack-verify.ts` - Slack request signature verification
  - `auth-cookies.ts` - ESPN auth cookie management
  - `roto-ranking.ts` - Roto points calculation (numTeams - rank + 1)
- Depends on: None (shared is a leaf)
- Used by: All packages

## Data Flow

**Daily Snapshot Workflow (BullMQ → Agents → Database):**

1. **Trigger:** Scheduled job via `snapshot-worker.ts` (daily at 03:00 league timezone) or manual `POST /api/leagues/:id/snapshot`
2. **Fetch:** `ESPNAdapter.fetchLeague()` calls ESPN API with auth cookies (SWID + espn_s2), uses axios-retry for resilience
3. **Archive:** Raw ESPN response stored in `league_raw_payload` table with schema fingerprint hash
4. **Normalize:** `ESPNAdapter.normalizeLeagueData()` extracts teams, players, rosters, stat categories
5. **Persist (SnapshotOrchestratorAgent):**
   - Write `league_daily_snapshot` (metadata: date, settings_version_id, is_degraded, degraded_reasons)
   - Write `team_daily_category_totals` (per-category stats for each team)
   - Write `team_daily_category_ranks` (rank within league per category)
   - Write `team_daily_overall` (roto points = sum of category rankings converted to points)
   - Write `team_roster_snapshot` (player roster with status: active/bench/IL)
6. **Project (StandingsProjectionAgent):**
   - Query current totals from snapshot tables
   - Join with latest `player_projection` rows (components: AB, H, IP, ER, etc.)
   - For each category: combine current components + projected components using `combineComponents()`
   - Apply rate stat formula (e.g., ERA = 9 * ER / IP) to combined components
   - Rank teams by projected final value per category
   - Compute Roto points: numTeams - rank + 1
   - Write `team_daily_projected_category` and `team_daily_projected_overall`
7. **Degradation:** If projections missing, mark snapshot `is_degraded=true` with reason `["projections_missing"]`; use only current-to-date components

**Recommendation Workflow (API → Agent → Simulation → Response):**

1. **Waiver Request:** Frontend `GET /api/leagues/:id/teams/:teamId/waivers/recommendations`
2. **Load:** WaiverRecommendationAgent fetches projected standings (baseline), free agent pool, team roster
3. **Simulate:** For each free agent:
   - Add to team's roster
   - Drop lowest impact player
   - Recalculate final standings with new projections
   - Compute delta overall Roto points
4. **Rank:** Sort agents by delta (descending); return top N with impact breakdown
5. **Response:** Include agent details, projected final points delta, risk flags (e.g., "rate stat adjustment incomplete")

**Trade Workflow (POST → Agent → Simulation → Impact Analysis):**

1. **Request:** `POST /api/leagues/:id/teams/:teamId/trades/impact` with trade details (player IDs to swap)
2. **Baseline:** Load projected final standings before trade
3. **Simulate:** Swap rest-of-season projections between teams:
   - Team A gets Team B's players' remaining projections
   - Team B gets Team A's players' remaining projections
   - Recompute final standings with swapped projections
4. **Measure:** Calculate delta points for each team (winner/loser/balanced)
5. **Return:** Trade impact breakdown per category, Roto points delta, complexity notes

**Draft Assistant Workflow (Extension ↔ Backend):**

1. **Page Load:** Chrome content script (`entrypoints/content.tsx`) initializes DOM observers on ESPN draft page
2. **Config Detect:** `detectLeagueConfig()` parses ESPN page to extract league ID, scoring format, roster slots, total teams
3. **State Init:** Zustand store (`useDraftStore`) hydrates from `chrome.storage.local` with draft state (picks, budget, remaining)
4. **Fetch Rankings:** Extension calls `GET /api/leagues/:id/draft/recommendations` with current draft format (snake/auction)
5. **Refresh Cycle:** After each pick detected on board:
   - Update local state (pick removed from pool, budget decremented)
   - Fetch fresh rankings with updated `draftFormat` and `remainingBudget`
   - Store to chrome.storage.local for persistence
   - Update sidebar UI with ranked players + auction values
6. **Graceful Degradation:** If API call fails after retries, keep stale rankings on display (user sees "last refreshed at X")

**Authentication & Token Refresh:**

1. **Login:** User provides email + password or clicks OAuth provider button
2. **Backend:** Auth route hashes password, generates JWT access token + refresh token
3. **Response:** Access token stored in httpOnly cookie (`accessToken`), refresh token in separate cookie
4. **Protected Route:** Middleware `authenticate` verifies JWT from cookie; if missing/expired, returns 401
5. **Frontend Refresh:** API client (`lib/api.ts`) catches 401, calls `POST /api/auth/refresh` with refresh token
6. **Silent Refresh:** Backend validates refresh token, generates new access token, returns in cookie
7. **Retry:** API client retries original request with new token; if still fails, redirects to `/login`

**State Management Patterns:**

- **Backend:** Stateless request/response with persistent state in PostgreSQL + Redis queues
- **Frontend:** AuthContext (React Context) holds `user` and `loading` state; TanStack Query caches API responses per endpoint; localStorage stores selected team per league (`league_${leagueId}_team`)
- **Extension:** Zustand store with `chrome.storage.local` persistence (draft picks, budget, remaining players); cache invalidation on page reload
- **Job Queue:** BullMQ with Redis backend; jobs stored with deduplication key (`snapshot-{leagueId}-{date}`); retries on failure with exponential backoff

## Key Abstractions

**Agent Pattern:**

Pattern: Encapsulation of domain logic with dependency injection

```typescript
export class {Agent}Agent {
  constructor(
    private db: Kysely<Database>,
    private logger?: Logger,
  ) {}

  async execute(options: Options): Promise<Result> {
    // Single responsibility: do one thing well
    this.logger?.info({ ...context }, "Starting operation");
    try {
      // Execute business logic
    } catch (error) {
      this.logger?.error({ error, ...context }, "Operation failed");
      throw error;
    }
  }
}
```

- Contract: All agents accept Kysely db instance + optional Pino logger
- Never log secrets (ESPN cookies, auth headers, etc.)
- Mark outputs degraded when data incomplete; never fabricate missing data
- Examples: `SnapshotOrchestratorAgent`, `StandingsProjectionAgent`, `TradeRecommendationAgent`, `WaiverRecommendationAgent`

**Adapter Pattern:**

Pattern: External API normalization to internal canonical models

```typescript
interface ESPNLeagueData { settings, teams, standings, transactions }
const espnData = await espnAdapter.fetchLeague({ leagueId, season, auth })
const rawPayload = { data: espnData, schemaFingerprint, fetchedAt }
await db.insert('league_raw_payload').values(rawPayload)
const normalized = espnAdapter.normalizeLeagueData(espnData)
```

- Handles: Auth cookies (SWID + espn_s2), retry logic, response schema drift detection
- Example: `ESPNAdapter` converts ESPN raw response to canonical `ESPNLeagueData`, `ESPNTeamData`, `ESPNFreeAgent`

**Degradation Pattern:**

Pattern: Graceful fallback when dependencies unavailable or incomplete

```typescript
if (projectionsRunId === null) {
  snapshot.is_degraded = true
  snapshot.degraded_reasons.push('projections_missing')
}
// Continue with current-to-date data only
const finalRate = calculateFinalRate(formulaId, currentComponents, {}) // projected={}
```

- Used by: SnapshotOrchestratorAgent, StandingsProjectionAgent
- Frontend shows warning badge; data queryable but with caveat

**Component-Based Formula Pattern:**

Pattern: Rate stats computed from components, not averaged directly

```typescript
const combined = combineComponents(currentComponents, projectedComponents)
const era = calculateERA(combined) // 9 * ER / IP from combined components
```

- Examples: AVG = H / AB, OBP = (H + BB + HBP) / (AB + BB + HBP + SF), ERA = 9 * ER / IP
- Implementation: `packages/shared/src/formulas.ts` exports calculation functions
- Avoid: Never average rates directly (e.g., don't average ERA values)

## Entry Points

**Backend Server:**
- Location: `packages/backend/src/index.ts`
- Invoked: `npm run dev` (local) or `node dist/index.js` (production)
- Responsibilities:
  - Bootstrap Fastify instance with plugins (CORS, JWT, multipart, rate-limit, Redis)
  - Register all API route modules (auth, leagues, projections, timeseries, recommendations, draft, slack, admin, transaction-impact, internal)
  - Initialize singleton database connection via `getDb()`
  - Set up graceful shutdown handlers (SIGINT, SIGTERM)
- Listens: PORT (default 3001) on HOST (default 0.0.0.0)

**Snapshot Worker:**
- Location: `packages/backend/src/workers/snapshot-worker.ts`
- Invoked: Separate process, typically started alongside main server
- Responsibilities:
  - Consumes BullMQ snapshot jobs from Redis queue (queue name: "snapshots")
  - For each job: instantiate SnapshotOrchestratorAgent, execute snapshot for league + date
  - Retry failed jobs up to 3 times with exponential backoff (5s, 10s, 20s delays)
  - Log job completions and failures
  - Graceful shutdown on SIGTERM
- Schedules: Daily snapshot jobs at 03:00 league timezone (via `scheduleDailySnapshots()`)

**Frontend Entry:**
- Location: `packages/frontend/src/app/layout.tsx` (root layout) and `packages/frontend/src/app/page.tsx` (home page)
- Invoked: Browser navigation to frontend URL (default port 3000)
- Responsibilities:
  - `layout.tsx`: Wraps entire app with providers (AuthContext, QueryClientProvider), applies global CSS
  - `page.tsx`: Home page component that redirects authenticated users to league list, shows landing for guests
  - Navigation: Shared `navigation.tsx` component shows header with logout, league selector

**Chrome Extension Entrypoints:**
- **Content Script:** `packages/extension/entrypoints/content.tsx`
  - Triggered: When ESPN draft page loads
  - Responsibilities:
    - Detect draft board via DOM observers
    - Inject Shadow DOM sidebar for draft assistant UI
    - Listen to board changes, refresh rankings after each pick
    - Store draft state to chrome.storage.local
- **Popup:** `packages/extension/entrypoints/popup/index.tsx`
  - Triggered: User clicks extension icon
  - Responsibilities: Display popup UI for navigation, settings, current draft status

## Error Handling

**Strategy:** Graceful degradation with detailed logging and user-facing error messages

**Patterns:**

- **ESPN Fetch Failure:** SnapshotOrchestratorAgent catches error, marks snapshot `is_degraded=true` with reason `["espn_fetch_failed"]`; logs error context (leagueId, season)
- **Projection Missing:** StandingsProjectionAgent detects empty player_projection table for projections_run_id, marks degraded with reason `["projections_missing"]`, uses only current-to-date components in formulas
- **Database Error:** All agents wrap queries in try-catch, log error with context (leagueId, snapshotDate), re-throw for upstream handling
- **API 401 Unauthorized:** Frontend API client catches, attempts silent refresh via `POST /api/auth/refresh`; if refresh fails, redirects to `/login`
- **Rate Limit (429):** Fastify returns 429; frontend should back off and retry; BullMQ jobs retry automatically
- **Job Failure:** BullMQ job fails after 3 retries → logged to error handler → job persisted in queue for 24 hours for manual inspection
- **Invalid Input:** Zod schemas validate request bodies; if validation fails, route returns 400 with error details

## Cross-Cutting Concerns

**Logging:** Pino logger with contextual fields (leagueId, teamId, jobId); JSON format in production, pretty-printed in development via pino-pretty transport

**Validation:** Zod schema validation on API request bodies; TypeScript type safety throughout; no fabrication of missing data (e.g., no default values for required projections)

**Authentication:** JWT tokens issued on login/OAuth callback; stored in httpOnly cookie (`accessToken`); verified by `authenticate` middleware on protected routes; refresh tokens enable silent token rotation

**Authorization:** Middleware `authenticate` enforces user logged in; middleware `requireLeagueAccess` enforces user owns team in requested league; role-based access for admin routes

**Encryption:** ESPN auth cookies (SWID, espn_s2) optionally encrypted at rest using `encryption.ts` utilities; Slack bot tokens encrypted in database using `slack_installation.bot_token_encrypted` column

**Caching:**
- ESPN responses cached in-memory during snapshot execution (per-request, not Redis)
- Frontend TanStack Query handles client-side data cache with invalidation on mutations
- Extension Zustand store persists draft state to chrome.storage.local

**Rate Limiting:** Fastify rate-limit plugin on sensitive endpoints (e.g., `POST /api/leagues/connect` = 30 req/min); uses Redis if available, falls back to in-memory storage

---

*Architecture analysis: 2025-02-23*
