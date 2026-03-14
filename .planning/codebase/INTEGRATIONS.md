# External Integrations

**Analysis Date:** 2026-03-13

## APIs & External Services

**ESPN Fantasy Baseball API:**
- Service: ESPN Fantasy Baseball (lm-api-reads.fantasy.espn.com)
- SDK: Custom ESPNAdapter (`packages/backend/src/adapters/espn.ts`)
- Auth: SWID + espn_s2 cookies (from user's ESPN login session)
- Methods: Read league standings, team rosters, free agents, transaction history, player stats
- Rate limiting: 2-second throttle per CLAUDE.md, single-concurrency queue via p-limit
- Known gaps: Free agent pool never fetched (always empty), no retry/backoff strategy

**MLB Stats API:**
- Service: MLB Official Stats API (statsapi.mlb.com)
- SDK: Custom MLBStatsApiAdapter (`packages/backend/src/adapters/mlb-statsapi.ts`)
- Auth: None (public API)
- Methods: MLB game schedule, player metadata, live game scores
- Used for: Schedule-aware draft timing, injury tracking

**OpenAI API:**
- Service: OpenAI (api.openai.com)
- SDK: openai 6.25.0
- Auth: `OPENAI_API_KEY` environment variable
- Methods: LLM completions for draft narration
- Feature: DraftNarratorAgent generates tactical commentary in extension
- Notes: Per-request instantiation; constructor throws if API key missing

**Slack:**
- OAuth: Slack OAuth v2 (slack.com/oauth/v2/authorize)
- Token exchange: https://slack.com/api/oauth.v2.access
- API calls:
  - https://slack.com/api/chat.postMessage - Send messages to channels/DMs
  - https://slack.com/api/chat.update - Edit messages
  - https://slack.com/api/conversations.open - Open DMs with users
- Auth: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI`
- Verification: HMAC-SHA256 signature verification via `SLACK_SIGNING_SECRET`
- Feature-flagged: `FEATURE_SLACK_ENABLED` environment variable
- Routes: `POST /slack/oauth/start`, `GET /slack/oauth/callback`
- Worker: SlackApprovalWorker processes approval workflows via response_url webhooks
- Use case: League notifications, draft updates, waiver/trade approvals

**GitHub OAuth:**
- Service: GitHub OAuth (github.com)
- SDK: passport-github2 0.1.12
- Auth: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`
- Routes: Handled by setupOAuth in `packages/backend/src/api/auth-oauth.ts`
- Use case: User authentication/signup

**Google OAuth:**
- Service: Google OAuth 2.0
- SDK: passport-google-oauth20 2.0.0
- Auth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- Routes: Handled by setupOAuth in `packages/backend/src/api/auth-oauth.ts`
- Use case: User authentication/signup

## Data Storage

**Databases:**
- **PostgreSQL 15** - Primary relational database
  - Connection: `DATABASE_URL` (required, format: `postgresql://user:pass@host:port/db`)
  - Client: Kysely ORM with pg dialect
  - Schema: 16 tables managed via SQL migrations
  - Connection pooling: pg.Pool (max 25, timeout 5s connect, 30s idle, 7500 max uses)

**File Storage:**
- Local filesystem only - No S3/cloud storage integration
- CSV uploads: Stored transiently via @fastify/multipart for projections ingest
- User data persistence: PostgreSQL only

**Caching:**
- **Redis 7** - Optional distributed cache
  - Connection: `REDIS_URL` (optional, defaults to no Redis)
  - Use cases:
    - Rate limiting storage (via @fastify/redis + @fastify/rate-limit)
    - Job queue (BullMQ for background workers)
    - Session data (if implemented)
  - In-memory fallback: Rate limiting uses in-memory state if Redis unavailable
  - ESPN API responses: Cached in-process via LRU-cache (lru-cache 11.2.6)

## Authentication & Identity

**Primary Auth:**
- Method: JWT (via @fastify/jwt)
- Token storage: Signed httpOnly cookie named `accessToken`
- Token lifetime: 15 minutes (expiresIn: "15m")
- Refresh flow: `/api/auth/refresh` endpoint for token rotation
- CORS: Credentials mode enabled for cookie transmission

**Provider Strategies:**
- GitHub OAuth (passport-github2)
- Google OAuth (passport-google-oauth20)
- Custom login/signup (implementation in `packages/backend/src/api/auth.ts`)

**User Identity:**
- Database: `user` table (inferred from auth routes)
- Team context: `user_team_id` - Maps user to their selected team per league (via `localStorage` key `league_${leagueId}_team` on frontend)

**Secrets Management:**
- OAuth secrets: Environment variables only
- ESPN cookies: Stored in plaintext in database (CLAUDE.md notes this should be encrypted-at-rest)
- Encryption utility: `encryptToken()` function in `packages/backend/src/utils/encryption.ts` (partially implemented)

## Monitoring & Observability

**Error Tracking:**
- Not detected - No Sentry, Rollbar, or similar integration

**Logs:**
- Pino (8.17.2) - Structured JSON logging
  - Pretty printing in development (pino-pretty)
  - JSON output in production
  - Log level: Configurable via `LOG_LEVEL` env var (defaults to `info`)
  - Includes: Request/response logs, database queries (via Kysely), worker events

**Metrics:**
- Not detected - No Prometheus, StatsD, or CloudWatch integration

## CI/CD & Deployment

**Hosting:**
- Docker Compose - Local/staging deployments
  - Production compose: `docker-compose.yml`
  - Dev compose: `docker-compose.dev.yml`
  - All services: PostgreSQL, Redis, Backend, Worker, Frontend

**Container Images:**
- Base: Node.js (via Turbo/Dockerfile logic)
- Frontend: Next.js production build
- Backend/Worker: Node.js runtime executing TypeScript dist

**Database Migrations:**
- Manual SQL via `packages/backend/src/db/migrate.ts`
- Run command: `pnpm migrate` (defined in backend package.json)
- Location: `packages/backend/src/db/migrations/` (numbered SQL files)

**CI Pipeline:**
- Not detected - No GitHub Actions, CircleCI, or similar config

## Environment Configuration

**Required env vars for Core Functionality:**
- `DATABASE_URL` - PostgreSQL connection (blocking)
- `OPENAI_API_KEY` - OpenAI API key (required for draft narration only; throws on per-request instantiation)

**Required for OAuth:**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` - Google OAuth
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL` - GitHub OAuth

**Required for Slack Integration:**
- `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI` - Slack OAuth
- `SLACK_SIGNING_SECRET` - Slack request verification (only if `FEATURE_SLACK_ENABLED=true`)

**Optional Infrastructure:**
- `REDIS_URL` - Redis connection (optional; if missing, rate limiting uses in-memory state)
- `NODE_ENV` - Defaults to `development`
- `LOG_LEVEL` - Defaults to `info`
- `PORT` - Defaults to 3001
- `HOST` - Defaults to 0.0.0.0
- `FRONTEND_URL` - Defaults to http://localhost:3000
- `NEXT_PUBLIC_API_URL` - Defaults to http://localhost:3001

**Secrets Location:**
- Environment files: `.env`, `.env.railway` (Railway.app deployment)
- Do NOT read `.env` in code review (contains secrets)
- Suggested: Move to secret manager (Vault, 1Password, AWS Secrets) for production

## Webhooks & Callbacks

**Incoming Webhooks:**
- Slack Slash Commands: Event handler in `packages/backend/src/api/slack.ts`
  - Verification: HMAC-SHA256 signature (via `slackVerifyPreHandler`)
  - Payload: Form-encoded, requires raw body parsing
  - Use case: Interactive approvals, league commands

**Outgoing Webhooks:**
- Slack response_url: SlackApprovalWorker posts back to response_url (ephemeral interaction responses)
  - Location: `packages/backend/src/workers/slack-approval-worker.ts`
  - Method: POST via axios
- ESPN Event Callbacks: Not implemented (would require ESPN webhook registration)

## WebSocket Connections

**Live Draft Monitoring:**
- WebSocket plugin: @fastify/websocket (registered in `packages/backend/src/index.ts`)
- Route: Likely draft-live routes (`packages/backend/src/api/draft-live.ts`)
- Use case: Real-time updates to Chrome extension during live drafts
- CORS: Allows chrome-extension:// and private LAN IPs for mobile companion

## Data Ingestion

**FanGraphs Projections:**
- Method: Manual CSV upload via multipart form
- Route: `POST /api/projections/upload`
- Parser: csv-parse library
- Storage: Parsed into `projections_run` and `player_projection` tables
- Update flow: Failed ingest re-triggers snapshot for dependent leagues

**ESPN League Data:**
- Method: Polling (snapshot-worker on cron)
- Frequency: Daily (via node-cron in worker)
- Scope: Full league refresh including rosters, standings, transactions

**MLB Game Data:**
- Method: On-demand via MLBStatsApiAdapter
- Used for: Schedule-aware draft timing, injury tracking

---

*Integration audit: 2026-03-13*
