<!-- generated-by: gsd-doc-writer -->

# Development Setup Guide

Everything you need to run the project locally, run tests, and understand the dev tooling.

## Prerequisites

| Tool                    | Version | Notes                                                                            |
| ----------------------- | ------- | -------------------------------------------------------------------------------- |
| Node.js                 | `>= 20` | Use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) |
| pnpm                    | `>= 9`  | `npm install -g pnpm`                                                            |
| PostgreSQL              | `15`    | Via Docker (recommended) or local install                                        |
| Redis                   | `7`     | Via Docker (recommended) or local install                                        |
| Docker + Docker Compose | latest  | Required for the Docker workflow                                                 |

---

## Clone and Install

```bash
git clone <repo-url>
cd espn-agent
pnpm install
```

`pnpm install` installs all workspace packages (`packages/backend`, `packages/frontend`, `packages/shared`, `packages/scraper`) in one shot via the pnpm workspaces config in `pnpm-workspace.yaml`. ESPN draft tooling is work in progress; this repository does not include a Chrome extension.

---

## Environment Variables

The backend reads its config from `packages/backend/.env`. Copy the example file and fill in your values:

```bash
cp packages/backend/.env.example packages/backend/.env
```

All variables defined in `packages/backend/.env.example`:

| Variable         | Required | Default                                    | Description                                       |
| ---------------- | -------- | ------------------------------------------ | ------------------------------------------------- |
| `NODE_ENV`       | No       | `development`                              | Runtime environment                               |
| `PORT`           | No       | `3001`                                     | Backend server port                               |
| `HOST`           | No       | `0.0.0.0`                                  | Backend bind address                              |
| `DATABASE_URL`   | Yes      | `postgresql://localhost:5432/espn_fantasy` | PostgreSQL connection string                      |
| `REDIS_URL`      | Yes      | `redis://localhost:6379`                   | Redis connection URL                              |
| `LOG_LEVEL`      | No       | `info`                                     | Pino log level (`debug`, `info`, `warn`, `error`) |
| `ENCRYPTION_KEY` | No       | _(empty)_                                  | 64-character hex key required to store encrypted ESPN cookies |
| `OPENAI_API_KEY` | No       | _(empty)_                                  | OpenAI key used for draft narrator LLM calls      |

The backend will fail to start if `DATABASE_URL` or `REDIS_URL` are unreachable. `OPENAI_API_KEY` is only required for the draft narrator feature; everything else works without it.

---

## Database Setup

### Option A — Docker (recommended)

Start just the infrastructure services (PostgreSQL + Redis) without running the full app in containers:

```bash
docker-compose -f docker-compose.dev.yml up -d postgres redis
```

Default credentials used by `docker-compose.dev.yml`:

| Setting  | Value            |
| -------- | ---------------- |
| Host     | `localhost:5432` |
| Database | `espn_fantasy`   |
| User     | `espn_user`      |
| Password | `espn_password`  |

These match the default `DATABASE_URL` in `.env.example` — no changes needed for local dev.

### Option B — Native PostgreSQL

Create the database and user manually:

```bash
psql -U postgres -c "CREATE USER espn_user WITH PASSWORD 'espn_password';"
psql -U postgres -c "CREATE DATABASE espn_fantasy OWNER espn_user;"
```

### Run Migrations

After the database is running, apply all pending migrations:

```bash
cd packages/backend
pnpm migrate
```

This runs `tsx src/db/migrate.ts up`, which applies all `.sql` files in `packages/backend/src/db/migrations/` in version order and tracks applied migrations in a `schema_migrations` table.

Check migration status without applying:

```bash
pnpm tsx src/db/migrate.ts status
```

The migration runner also supports a `seed` command used in the Docker dev startup to create a dev admin user:

```bash
pnpm tsx src/db/migrate.ts seed
```

---

## Starting Dev Servers

### Manual (recommended for active development)

Run both servers in parallel using the Turbo dev pipeline from the repo root:

```bash
pnpm dev
```

This runs `turbo run dev`, which starts:

- **Backend** (`packages/backend`): `tsx watch src/index.ts` — hot-reloads on file changes, serves on `http://localhost:3001`
- **Frontend** (`packages/frontend`): `next dev` — Next.js dev server on `http://localhost:3000`

To run a single package instead:

```bash
# Backend only
cd packages/backend && pnpm dev

# Frontend only
cd packages/frontend && pnpm dev
```

> **Note:** The `shared` package must be built before the backend or frontend can import from it. Run `pnpm build` from `packages/shared` once if you hit import errors, or rely on `pnpm dev` from the root which Turbo handles in dependency order.

---

## Docker Compose Option

The `docker-compose.dev.yml` file runs the full stack — PostgreSQL, Redis, backend API, and a background worker — all in containers with live-reload mounts.

### Convenience wrapper (`docker.sh`)

```bash
./docker.sh dev-up      # Start the full development stack
./docker.sh dev-down    # Stop all containers
./docker.sh dev-logs    # Tail container logs
```

### Or use Docker Compose directly

```bash
docker-compose -f docker-compose.dev.yml up -d
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml logs -f
```

The dev compose file mounts `packages/backend` and `packages/shared` as volumes and runs `packages/backend/scripts/start-dev.sh` inside the container, which:

1. Reinstalls dependencies to fix symlinks
2. Builds the `shared` package
3. Runs migrations (`pnpm tsx src/db/migrate.ts up`)
4. Seeds a dev admin user (`pnpm tsx src/db/migrate.ts seed`)
5. Starts the backend with `tsx src/index.ts`

The frontend is **not** included in `docker-compose.dev.yml` — run it locally with `pnpm dev` from `packages/frontend`.

### Health check

```bash
./health-check.sh
```

Verifies Docker is running, containers are up, and each service responds correctly.

---

## Running Tests

Tests live in the backend package only. The test framework is **Vitest** with globals enabled.

```bash
# Run all tests (from repo root — uses Turbo)
pnpm test

# Run backend tests directly
cd packages/backend
pnpm test

# Watch mode
cd packages/backend
pnpm vitest --watch
```

Vitest config is at `packages/backend/vitest.config.ts` (globals: true, no coverage threshold configured).

### Test file locations

| Directory                                    | What's tested                 |
| -------------------------------------------- | ----------------------------- |
| `packages/backend/src/__tests__/`            | Integration-level agent tests |
| `packages/backend/src/agents/__tests__/`     | Individual agent unit tests   |
| `packages/backend/src/adapters/__tests__/`   | ESPN + external adapter tests |
| `packages/backend/src/api/__tests__/`        | Route handler tests           |
| `packages/backend/src/projection/__tests__/` | Projection math tests         |
| `packages/backend/src/utils/__tests__/`      | Utility function tests        |

---

## Building for Production

```bash
# Build all packages (respects dependency order via Turbo)
pnpm build
```

Per-package build commands:

| Package             | Command      | Output                     |
| ------------------- | ------------ | -------------------------- |
| `packages/shared`   | `tsc`        | `packages/shared/dist/`    |
| `packages/backend`  | `tsc`        | `packages/backend/dist/`   |
| `packages/frontend` | `next build` | `packages/frontend/.next/` |

The Turbo `build` pipeline has `"dependsOn": ["^build"]`, so `shared` is always built before `backend` and `frontend`.

Start the built backend:

```bash
cd packages/backend
pnpm start        # node dist/index.js
```

---

## Turbo Pipeline

`turbo.json` defines the following tasks:

| Task    | `dependsOn` | Cache           | Description                                                  |
| ------- | ----------- | --------------- | ------------------------------------------------------------ |
| `build` | `^build`    | Yes             | Compile TypeScript; outputs to `dist/`, `.next/`, `.output/` |
| `dev`   | —           | No (persistent) | Run dev servers; never cached, runs until killed             |
| `test`  | `build`     | Yes             | Run test suite; requires a prior build                       |
| `lint`  | `^lint`     | Yes             | ESLint across packages                                       |
| `clean` | —           | No              | Remove build outputs                                         |

Run any task across all packages:

```bash
pnpm turbo run <task>
# e.g.
pnpm turbo run lint
pnpm turbo run clean
```

---

## Common Issues

### `WHERE col IN ()` crashes the backend

Kysely generates invalid SQL for empty `IN` arrays. Always guard array length before building `IN` queries:

```typescript
// WRONG — crashes if array is empty
.where("col", "in", myArray)

// CORRECT
if (myArray.length > 0) {
  query = query.where("col", "in", myArray);
}
```

### Free agent pool is always empty

`ESPNAdapter` does not yet fetch free agents from ESPN. Waiver recommendation results will show an empty candidate pool until this is implemented.

### Frontend pages 404 under `/projections`, `/waivers`, `/trends`

The home page links to these paths, but the actual routes are nested under `/leagues/[id]/`. Use the league-scoped URLs directly.

### `packages/shared` import errors in backend or frontend

The `shared` package must be compiled before other packages can import from it. Run `pnpm build` inside `packages/shared` once, then restart your dev server.

### ESPN auth cookies not working

Private leagues require `SWID` and `espn_s2` cookies from your ESPN session. Set them via the `PATCH /api/leagues/:id/auth` endpoint. The backend stores these credentials in encrypted columns; `ENCRYPTION_KEY` must be configured when using database-stored credentials.

### `PlayerIdentityResolutionAgent` not matching projections

The agent is implemented but not yet wired into the projections ingest flow. Player matching falls back to SQL `ILIKE` on name only — mismatches on players with name variants (e.g., "Mike" vs "Michael") are expected.
