# External Integrations

**Analysis Date:** 2026-02-19

## APIs & External Services

**ESPN Fantasy Baseball API:**
- Service: ESPN's fantasy baseball API (read-only public + private league data)
- What it's used for: Fetching league standings, team rosters, scoring categories, transaction history
- SDK/Client: Axios HTTP client
- Base URL: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb`
- Implementation: `packages/backend/src/adapters/espn.ts` (ESPNAdapter class)
- Auth: Cookie-based (SWID + espn_s2 cookies for private leagues)
  - SWID and espn_s2 stored in plaintext in database `league.espn_auth_cookies` (JSONB) — design doc flags this requires encryption
  - Cookies extracted from request and passed via `ESPNAuthCookies` interface
- Known gaps: No retry/backoff on failures, in-memory cache only (not Redis-backed), free agent pool never populated

**Slack API:**
- Service: Slack workspace integration and messaging
- What it's used for: Send daily standings reports, approval workflows for trades/waivers, notifications
- SDK/Client: axios (raw HTTP for OAuth, event routing)
- OAuth Endpoints:
  - Start: `https://slack.com/oauth/v2/authorize` (user redirected here)
  - Callback: Local route `/slack/oauth/callback` exchanges code for token
  - Token exchange: `https://slack.com/api/oauth.v2.access`
- Auth: Slack app credentials (client ID, client secret)
  - Signing secret used for HMAC signature verification of webhook requests
  - Bot tokens and webhook URLs stored encrypted in database `slack_installation` table
- Scopes: `chat:write`, `im:write`, `commands`
- Webhook verification: HMAC-SHA256 signature validation with 5-minute timestamp window (`packages/backend/src/utils/slack-verify.ts`)
- Implementation routes: `packages/backend/src/api/slack.ts`
- Feature flag: `FEATURE_SLACK_ENABLED` (disabled by default)

**Google OAuth 2.0:**
- Service: Google authentication provider
- What it's used for: User login via Google account
- Strategy: passport-google-oauth20
- Implementation: `packages/backend/src/api/auth-oauth.ts`
- Required env vars:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_CALLBACK_URL`
- Callback route: Generates JWT and redirects to frontend with token
- Enabled when both Google and GitHub credentials are configured

**GitHub OAuth 2.0:**
- Service: GitHub authentication provider
- What it's used for: User login via GitHub account
- Strategy: passport-github2
- Implementation: `packages/backend/src/api/auth-oauth.ts`
- Required env vars:
  - `GITHUB_CLIENT_ID`
  - `GITHUB_CLIENT_SECRET`
  - `GITHUB_CALLBACK_URL`
- Callback route: Generates JWT and redirects to frontend with token
- Enabled when both GitHub and Google credentials are configured

## Data Storage

**Databases:**
- PostgreSQL 12+
  - Connection: `DATABASE_URL` env var (required)
  - Client: pg driver wrapped by Kysely ORM
  - Connection pooling: Max 10 connections per pool (`packages/backend/src/db/connection.ts`)
  - Migrations: SQL files in `packages/backend/src/db/migrations/` (001-006 implemented)
  - Tables: 16+ tables for leagues, teams, players, daily snapshots, projections, transactions, users, Slack integrations

**Redis:**
- Purpose: Job queue backend for BullMQ, optional caching
- Connection: `REDIS_URL` env var (optional; Fastify redis plugin only registered if present)
- Client: IORedis (native driver)
- Queues:
  - `snapshots` - Daily league snapshot jobs (`packages/backend/src/workers/snapshot-worker.ts`)
  - `morning-report` - Daily standing reports
  - `slack-approval` - Pending trade/waiver approvals with Slack callbacks
- Usage: Background processing, not real-time caching

**File Storage:**
- Local filesystem only - CSV projections uploaded via multipart form to `POST /api/projections/upload`
- Processed in-memory (csv-parse) and stored to database (`projections_run`, `player_projection` tables)
- No cloud storage integration (S3, GCS, etc.)

**Caching:**
- Redis (when REDIS_URL configured) - primarily for BullMQ job queue
- In-memory ESPN response cache (not Redis-backed, lost on restart)
- Next.js built-in caching for static assets and ISR

## Authentication & Identity

**Auth Provider:**
- Hybrid approach:
  - Local auth: Email + password signup/login with bcrypt hashing (`packages/backend/src/api/auth.ts`)
  - OAuth: Google and GitHub via Passport strategies (`packages/backend/src/api/auth-oauth.ts`)

**JWT Token Management:**
- Token generation: Fastify JWT plugin configured with secret from `JWT_SECRET` env var
- Default expiration: 7 days (configurable via `JWT_EXPIRATION`)
- Signature verification: `server.decorate('authenticate', authenticate)` middleware
- Implementation: `packages/backend/src/middleware/auth.ts`

**User Data:**
- Storage: `users` table (userId, email, passwordHash, oauthProvider, createdAt)
- Credentials: Passwords hashed with bcryptjs (cost factor 10)
- OAuth linking: Same table stores `oauth_provider` field (google/github/local)

**ESPN Auth:**
- ESPN SWID and espn_s2 cookies stored per league (plaintext in `league.espn_auth_cookies`)
- Used for private league API access
- Security gap: Stored plaintext (design doc flags as requiring encryption)

## Monitoring & Observability

**Error Tracking:**
- Not detected - no Sentry, Rollbar, or similar integration

**Logs:**
- Pino structured logging (backend) with optional pretty printing in development
- Log level controlled by `LOG_LEVEL` env var (default: info)
- pino-pretty transport for human-readable output in dev
- Worker and internal services also use Pino

**Health Checks:**
- GET `/health` endpoint returns `{ status: "ok", timestamp: ISO string }`
- Docker HEALTHCHECK: Polls `http://localhost:3001/health` every 30s (backend) and `http://localhost:3000/health` (frontend)

## CI/CD & Deployment

**Hosting:**
- Railway.app (deployment platform)
- Config files: `railway.backend.json`, `railway.frontend.json`, `railway.workers.json`
- Docker containers orchestrated via Railway

**CI Pipeline:**
- Not detected - no GitHub Actions, GitLab CI, or similar workflows in `.github/` directory

**Local Development:**
- docker-compose.dev.yml for PostgreSQL + Redis services

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql://user:pass@localhost/db`)
- `REDIS_URL` - Redis connection (optional; Fastify plugin only if present)
- `PORT` - Backend API port (default: 3001)
- `HOST` - Backend bind address (default: 0.0.0.0)
- `NODE_ENV` - development/production (affects logging format)
- `LOG_LEVEL` - Pino log level (default: info)
- `FRONTEND_URL` - Frontend origin for CORS and OAuth redirects (default: http://localhost:3000)
- `JWT_SECRET` - JWT signing secret (development default exists; must override in production)
- `JWT_EXPIRATION` - JWT token expiration (default: 7d)

**OAuth (Google & GitHub):**
- `GOOGLE_CLIENT_ID` - Google OAuth app ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth app secret
- `GOOGLE_CALLBACK_URL` - Google OAuth callback URL (e.g., http://localhost:3001/auth/google/callback)
- `GITHUB_CLIENT_ID` - GitHub OAuth app ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth app secret
- `GITHUB_CALLBACK_URL` - GitHub OAuth callback URL (e.g., http://localhost:3001/auth/github/callback)

**Slack Integration:**
- `SLACK_CLIENT_ID` - Slack app ID
- `SLACK_CLIENT_SECRET` - Slack app secret
- `SLACK_REDIRECT_URI` - Slack OAuth redirect URI (e.g., http://localhost:3001/slack/oauth/callback)
- `SLACK_SIGNING_SECRET` - Slack request signature verification secret
- `SLACK_ENCRYPTION_KEY` - 64 hex characters (32 bytes) for AES-256-GCM encryption
  - Generate: `openssl rand -hex 32`
  - Used to encrypt bot tokens and webhook URLs in `slack_installation` table
- `FEATURE_SLACK_ENABLED` - Enable Slack integration (default: false)

**Frontend:**
- `NEXT_PUBLIC_API_URL` - Public API endpoint for frontend clients (default: http://localhost:3001)
- `NEXT_TELEMETRY_DISABLED` - Disable Next.js telemetry (set to 1 in production)

**Internal/Admin:**
- `INTERNAL_JOB_TOKEN` - Token for internal job trigger endpoints (optional)

**Secrets location:**
- Environment variables via `.env` file (not committed, `.env.example` is empty)
- Docker Compose overrides via `.env.railway`
- Railway.app secrets management (production)

## Webhooks & Callbacks

**Incoming:**
- `POST /slack/events` - Slack Event API subscriptions (app mentions, messages, shortcuts)
  - Signature verification via `slackVerifyPreHandler` middleware
  - Requires `SLACK_SIGNING_SECRET` env var
- `GET /slack/oauth/callback` - Slack OAuth redirect endpoint (from user authorization)
- `GET /auth/google/callback` - Google OAuth callback (from Passport)
- `GET /auth/github/callback` - GitHub OAuth callback (from Passport)
- `POST /api/leagues/:id/snapshot` - Manual snapshot trigger endpoint

**Outgoing:**
- Slack message/DM sends via `axios.post` to Slack API (`chat.postMessage`, `conversations.open`, etc.)
- Job queue callbacks processed by workers (`packages/backend/src/workers/`)
  - morning-report-worker sends daily standings
  - slack-approval-worker handles trade/waiver approval flows

## Worker Architecture

**Background Jobs (BullMQ + Redis):**
- `snapshots` queue: Daily league snapshot capture and processing
  - Worker: `packages/backend/src/workers/snapshot-worker.ts`
  - Schedule: Daily at 03:00 league timezone (manual or scheduled)
  - Retry: 3 attempts with exponential backoff

- `morning-report` queue: Daily standings reports
  - Worker: `packages/backend/src/workers/morning-report-worker.ts`

- `slack-approval` queue: Pending trade/waiver approval workflows
  - Worker: `packages/backend/src/workers/slack-approval-worker.ts`

**Connection Management:**
- Each worker creates its own Redis connection via IORedis
- Graceful shutdown on SIGTERM (closes worker and connection)

---

*Integration audit: 2026-02-19*
