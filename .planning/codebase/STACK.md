# Technology Stack

**Analysis Date:** 2026-02-19

## Languages

**Primary:**
- TypeScript 5.3.3 - All source code (`packages/backend/src/`, `packages/frontend/src/`, `packages/shared/src/`)

**Secondary:**
- SQL - PostgreSQL database migrations in `packages/backend/src/db/migrations/`
- JavaScript/JSX - Next.js configuration, build scripts

## Runtime

**Environment:**
- Node.js 20 LTS (Alpine) - Specified in `packages/backend/Dockerfile` and `packages/frontend/Dockerfile`

**Package Manager:**
- pnpm 10 - Root `package.json` workspace configuration
- Lockfile: `pnpm-lock.yaml` (frozen lockfile enforced in Docker builds)

## Frameworks

**Core:**
- Fastify 4.25.2 - HTTP server for backend API (`packages/backend/src/index.ts`)
- Next.js 14.1.0 - Frontend framework with App Router (`packages/frontend/src/app/`)
- Kysely 0.27.2 - SQL query builder for PostgreSQL (`packages/backend/src/db/connection.ts`)

**UI & Visualization:**
- React 18.2.0 - Component framework
- Recharts 2.10.4 - Chart visualization library (installed but primarily unused - pages render tables instead)
- Tailwind CSS 3.4.1 - Utility-first CSS framework (frontend)
- PostCSS 8.4.33 - CSS transformation

**State Management & Data:**
- TanStack Query (React Query) 5.17.19 - Server state management (frontend)

**Job Queue & Background Processing:**
- BullMQ 5.1.5 - Job queue management backed by Redis (`packages/backend/src/workers/`)
- IORedis 5.3.2 - Redis client

**Authentication & Security:**
- Fastify JWT 8.0.0 - JWT token generation and verification
- Passport 0.7.0 - Authentication middleware
  - passport-google-oauth20 2.0.0 - Google OAuth 2.0 strategy
  - passport-github2 0.1.12 - GitHub OAuth 2.0 strategy
- bcryptjs 2.4.3 - Password hashing for local auth

**Validation & Type Safety:**
- Zod 3.22.4 - Runtime schema validation (backend and shared)

**Utilities:**
- date-fns 2.30.0 / 3.0.6 - Date manipulation and formatting
- date-fns-tz 2.0.0 - Timezone support
- Axios 1.6.5 - HTTP client for ESPN API calls (`packages/backend/src/adapters/espn.ts`)
- csv-parse 5.5.3 - CSV parsing for FanGraphs projections upload
- Pino 8.17.2 - Structured logging (backend) with pino-pretty 10.3.1 for development
- clsx 2.1.0 - Conditional className utility (frontend)

**Monorepo & Build:**
- Turbo 2.0.0 - Build system orchestration (`turbo run dev`, `turbo run build`)

## Key Dependencies

**Critical:**
- pg 8.11.3 - PostgreSQL driver, used via Kysely for database connectivity
- fastify/cors 9.0.1 - CORS support for cross-origin requests from frontend to backend
- fastify/multipart 8.3.0 - File upload handling (FanGraphs CSV projections)
- fastify/redis 6.1.1 - Redis integration with Fastify

**Infrastructure:**
- @fastify/env 4.3.0 - Environment variable validation
- typescript 5.3.3 - Type compilation
- eslint 8.56.0 - Code linting (backend, frontend, shared)
- tsx 4.7.0 - TypeScript executor for Node.js scripts (migrations, worker startup)
- vitest 1.1.1 - Unit testing framework for backend

## Configuration

**Environment:**
- Environment variables (see INTEGRATIONS.md for required vars)
- `.env.example` - Template for required environment variables (empty file in repo)
- `.env.railway` - Railway deployment-specific variables

**Build:**
- `tsconfig.json` - TypeScript compilation settings per package (ES2022 target, bundler module resolution)
- `turbo.json` - Build task graph and caching configuration (root level)
- `next.config.mjs` - Next.js build and runtime config (`packages/frontend/`)
- `Dockerfile` and `Dockerfile.dev` - Multi-stage Docker builds for backend and frontend
- `docker-compose.dev.yml` - Local development orchestration (PostgreSQL, Redis services)

**Feature Flags:**
- Feature flags defined in `packages/backend/src/utils/feature-flags.ts` (controlled via env vars like `FEATURE_SLACK_ENABLED`)

## Platform Requirements

**Development:**
- Node.js 20+ (Alpine containers for production)
- PostgreSQL 12+ (database)
- Redis 6+ (job queue, caching)
- pnpm 10+ (workspace dependencies)

**Production:**
- Docker containers (specified via Dockerfiles)
- PostgreSQL database server with explicit connection pooling (max 10 connections per `packages/backend/src/db/connection.ts`)
- Redis server for BullMQ job queue
- Railway.app (deployment platform indicated by railway.*.json config files)

## Build & Dev Commands

**From root workspace:**
```bash
pnpm dev          # Start all packages in dev mode (Fastify with tsx watch, Next.js dev server)
pnpm build        # Build all packages (TypeScript compilation, Next.js static export)
pnpm test         # Run vitest across workspace
pnpm lint         # ESLint across all packages
pnpm clean        # Remove build artifacts
```

**Backend-specific:**
```bash
pnpm --filter @espn-fantasy/backend dev       # Start dev server with tsx watch
pnpm --filter @espn-fantasy/backend migrate   # Run database migrations
pnpm --filter @espn-fantasy/backend test      # Run vitest
```

**Frontend-specific:**
```bash
pnpm --filter @espn-fantasy/frontend dev      # Start Next.js dev server on port 3000
pnpm --filter @espn-fantasy/frontend build    # Build static export
```

---

*Stack analysis: 2026-02-19*
