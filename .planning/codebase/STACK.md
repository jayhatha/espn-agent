# Technology Stack

**Analysis Date:** 2026-03-13

## Languages

**Primary:**
- TypeScript 5.3.3 - All source code across backend, frontend, extension, and shared packages
- JavaScript (via tsx runtime) - Development and worker execution

**Markup/Styling:**
- HTML5 - Next.js/React component templates
- CSS 3 - Tailwind CSS utility-first styling
- PostCSS - CSS processing and Tailwind compilation

## Runtime

**Environment:**
- Node.js 18+ (implied by package compatibility, no .nvmrc found)
- Browser environments (Chrome/Firefox for extension)
- React 18.2.0 runtime (frontend, extension)

**Package Manager:**
- pnpm 10.6.5 (specified in extension package.json)
- Lockfile: `pnpm-lock.yaml` (committed)
- Monorepo workspace: 4 packages (`backend`, `frontend`, `shared`, `extension`)

## Frameworks

**Backend:**
- Fastify 4.25.2 - HTTP server framework
  - Plugins: @fastify/cors, @fastify/cookie, @fastify/jwt, @fastify/redis, @fastify/rate-limit, @fastify/multipart, @fastify/websocket
- Express-like pattern via Fastify route modules

**Frontend:**
- Next.js 14.1.0 (App Router) - React meta-framework
  - ESLint config: eslint-config-next
  - Tailwind CSS 3.4.1 - CSS framework

**Extension:**
- WXT 0.20.18 - Web extension framework
  - Modules: @wxt-dev/module-react
  - Target: Chrome (Manifest v3), Firefox compatible
  - React 18.2.0 for UI components

**State Management:**
- Zustand 5.0.11 (extension only)
- TanStack Query 5.17.19 (React Query) - Frontend data fetching/caching
- Browser localStorage (frontend state persistence)

## Testing

**Framework:**
- Vitest 1.1.1+ (backend and extension)
- No Jest configuration found (migrated to Vitest)

**Build/Dev Tools:**
- tsx 4.7.0 - TypeScript executor for Node.js scripts
- Turbo 2.0.0 - Monorepo task orchestration

## Key Dependencies

**Database & ORM:**
- Kysely 0.27.2 - Type-safe SQL query builder
- pg 8.11.3 - PostgreSQL client
- Connection pooling: pg.Pool (max 25 connections)

**Caching & Job Queue:**
- ioredis 5.3.2 - Redis client (with version override 5.9.3 in root pnpm config)
- @fastify/redis 6.1.1 - Fastify Redis integration
- BullMQ 5.1.5 - Job queue on Redis

**HTTP & Async:**
- axios 1.6.5 - HTTP client
- axios-retry 4.5.0 - Retry middleware for axios
- date-fns 3.0.6 - Date manipulation (frontend), 2.30.0 (backend)
- date-fns-tz 2.0.0 - Timezone support

**AI/LLM:**
- openai 6.25.0 - OpenAI API client (for draft narration)

**Authentication:**
- Passport 0.7.0 - Middleware for authentication
  - passport-github2 0.1.12 - GitHub OAuth strategy
  - passport-google-oauth20 2.0.0 - Google OAuth strategy
- @fastify/jwt 7.2.4 - JWT token handling in Fastify
- bcryptjs 2.4.3 - Password hashing

**Data Validation & Schema:**
- Zod 3.22.4 - TypeScript-first schema validation (shared + backend)
- Shared types: @espn-fantasy/shared - Internal monorepo package

**Utilities:**
- lru-cache 11.2.6 - In-memory LRU cache (ESPN API responses)
- p-limit 7.3.0 - Concurrency limiter (ESPN API rate limiting)
- pino 8.17.2 - Structured logging
  - pino-pretty 10.3.1 - Pretty print for development
- node-cron 4.2.1 - Scheduled jobs (snapshot worker)
- csv-parse 5.5.3 - CSV parsing for projections uploads
- clsx 2.1.0 - Class name utility (frontend)
- class-variance-authority 0.7.1 - Component variants (frontend)
- tailwind-merge 3.5.0 - Merge Tailwind classes (frontend)
- lucide-react 0.576.0 - Icon library (frontend)
- recharts 2.10.4 - Chart library (installed but underutilized per CLAUDE.md)

**Extension-specific:**
- webext-bridge 6.0.1 - Extension message passing (background ↔ content scripts)
- exponential-backoff 3.1.3 - Retry backoff strategy
- @types/chrome 0.1.37 - Chrome API types

**Dev Tools:**
- @typescript-eslint/eslint-plugin 6.18.1, @typescript-eslint/parser 6.18.1 - ESLint + TypeScript
- eslint 8.56.0 - Linting (backend, frontend, shared)
- autoprefixer 10.4.17 - CSS vendor prefixing
- typescript 5.3.3 - TypeScript compiler

## Configuration

**Environment Variables (Required in Production):**
- `DATABASE_URL` - PostgreSQL connection string (required)
- `REDIS_URL` - Redis connection URL (optional, falls back to in-memory for rate limiting)
- `JWT_SECRET` - JWT signing secret (defaults to dev secret)
- `COOKIE_SECRET` - Signed cookie secret
- `OPENAI_API_KEY` - OpenAI API key (required for draft narration feature)
- `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI` - Slack OAuth integration
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` - Google OAuth
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL` - GitHub OAuth
- `SLACK_SIGNING_SECRET` - Slack request verification (feature-flagged via `FEATURE_SLACK_ENABLED`)
- `FRONTEND_URL` - Frontend origin for CORS (defaults to `http://localhost:3000`)
- `NEXT_PUBLIC_API_URL` - Frontend public API URL (defaults to `http://localhost:3001`)
- `NODE_ENV` - Environment (`development` or `production`)
- `LOG_LEVEL` - Pino log level (`info`, `debug`, etc.)
- `PORT` - Backend port (defaults to 3001)
- `HOST` - Backend bind address (defaults to 0.0.0.0)

**Build Configuration:**
- `tsconfig.json` in each workspace package - TypeScript compilation settings
- `.wxt/` - WXT extension build artifacts (generated)
- `next.config.js` - (not present in codebase; using Next.js defaults)

**Package Configuration:**
- `pnpm` overrides in root `package.json` - Lock ioredis to 5.9.3

## Database

**PostgreSQL 15-alpine**
- Connection via Kysely + pg dialect
- Managed by docker-compose with health checks
- Default database name: `espn_fantasy`
- 16 tables per CLAUDE.md: league, team, player, player_identity_map, league_raw_payload, league_daily_snapshot, team_daily_*, player_projection, projections_run, league_transaction_event
- Migrations: Manual SQL migration files in `packages/backend/src/db/migrations/`

**Redis 7-alpine**
- Caching layer (optional in development)
- Job queue via BullMQ for background workers
- Rate limiting storage (if enabled via REDIS_URL)
- Persistence: Volume-backed

## Container Orchestration

**Docker Compose:**
- Services: PostgreSQL, Redis, Backend API, Worker, Frontend
- All services on `espn-network` bridge
- Health checks for database and Redis dependencies
- Backend depends on both before starting
- Worker runs `snapshot-worker.js` for daily jobs

## Platform Requirements

**Development:**
- Node.js 18+
- Docker & Docker Compose (for local services)
- pnpm 10.6.5+
- TypeScript understanding (all source is .ts)

**Production:**
- PostgreSQL 15+
- Redis 7+ (optional for rate limiting/caching)
- Node.js 18+
- Docker/container runtime (docker-compose.yml provided)
- HTTPS/TLS for OAuth flows (secure cookies when NODE_ENV=production)

**Browser (Extension & Frontend):**
- Chrome/Firefox (WXT targets both)
- ES2020+ JavaScript support
- LocalStorage API

---

*Stack analysis: 2026-03-13*
