# Coding Conventions

**Analysis Date:** 2026-02-19

## Naming Patterns

**Files:**
- Backend agents: camelCase (e.g., `trade-recommendation.ts`, `snapshot-orchestrator.ts`)
- API routes: camelCase (e.g., `leagues.ts`, `recommendations.ts`)
- Frontend pages: camelCase with bracket notation for dynamic routes (e.g., `[id]/page.tsx`, `connect/page.tsx`)
- Utilities: camelCase (e.g., `feature-flags.ts`, `encryption.ts`)

**Functions:**
- Async methods: camelCase (e.g., `executeSnapshot`, `analyzeTradeImpact`, `fetchLeague`)
- Private methods: camelCase with leading underscore (e.g., `_cleanCsv`, `_getPlayerName`, `_matchPlayer`)
- Agent methods: clear action verbs (e.g., `executeSnapshot`, `ingestBattersprojections`, `findBestMatch`)

**Variables:**
- Camel case throughout (e.g., `leagueId`, `snapshotDate`, `espnTeamId`)
- Database IDs keep underscore suffix in paths: `league_id`, `team_id` (mapped to `leagueId`, `teamId` in code)
- Acronyms: spelled out unless universally recognized (e.g., `snapshotDate` not `snapshotDt`)

**Types & Interfaces:**
- PascalCase for all types and interfaces (e.g., `TradeRecommendationAgent`, `ESPNAuthCookies`, `ProjectionCSVRow`)
- Type names descriptive: `ProposedTrade`, `CategoryImpact`, `ValidationReport` (not abbreviated)
- Response interfaces suffixed with intent: `TradeImpactAnalysis`, `WaiverRecommendation`, `ESPNLeagueData`

**Constants:**
- UPPER_SNAKE_CASE for magic numbers and static strings in adapters (e.g., ESPN stat IDs)
- Environment variables: `UPPER_SNAKE_CASE` (e.g., `PORT`, `REDIS_URL`, `JWT_SECRET`)

## Code Style

**Formatting:**
- No global ESLint/Prettier config detected at root level
- Backend: Linting available via `lint: "eslint src --ext .ts"` (package.json)
- Frontend: ESLint config inherited via `eslint-config-next`
- Indentation: 2 spaces (observed in all source files)
- Line length: No explicit limit, but most lines stay under 120 characters

**Linting:**
- Backend uses: `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`
- Frontend uses: ESLint with Next.js config (`eslint-config-next`)
- Run: `npm run lint` in packages/backend (lints `src` directory only)

**TypeScript:**
- Backend: `strict: false` in tsconfig (line 11 of packages/backend/tsconfig.json) - relaxed type checking
- Frontend: `strict: true` in tsconfig (line 10 of packages/frontend/tsconfig.json) - strict mode enforced
- Backend declares: `"noUnusedLocals": false`, `"noUnusedParameters": false`, `"noImplicitReturns": false`
- All files use `"module": "ESNext"` and `"moduleResolution": "bundler"`

## Import Organization

**Order:**
1. Node.js built-ins (`import crypto from "crypto"`)
2. Third-party packages (`import axios from "axios"`, `import { parse } from "csv-parse/sync"`)
3. Type imports from packages (`import type { Logger } from "pino"`, `import type { Kysely } from "kysely"`)
4. Internal absolute imports (`import { getDb } from "../db/connection.js"`)
5. Relative imports for adjacent modules (`import { ESPNAdapter } from "../adapters/espn.js"`)

**Path Aliases:**
- Frontend: `@/*` → `./src/*` (configured in `packages/frontend/tsconfig.json`)
- Usage: `import { api } from "@/lib/api"`, `import { ProtectedRoute } from "@/components/ProtectedRoute"`
- Backend: No path aliases configured; uses relative paths throughout

**File Extensions:**
- Backend: `.js` extensions in import paths (e.g., `"../db/connection.js"`, `"../adapters/espn.js"`)
- This is for ESM compatibility; actual files are `.ts`
- Frontend: Import paths without extensions (e.g., `import { api } from "@/lib/api"`)

## Error Handling

**Patterns:**
- Agents use Pino logger for structured logging: `this.logger?.info()`, `this.logger?.warn()`, `this.logger?.error()`
- Logger is optional: injected via constructor, checked with optional chaining before use
- Example from `snapshot-orchestrator.ts`:
  ```typescript
  this.logger?.info({ leagueId, snapshotDate }, "Starting snapshot job");
  // ... later ...
  } catch (error) {
    this.logger?.error(
      { error, leagueId, snapshotDate },
      "Snapshot orchestration failed"
    );
    throw error;
  }
  ```
- API endpoints use explicit try/catch with Fastify reply codes:
  ```typescript
  try {
    // operation
  } catch (err) {
    return reply.code(400).send({ error: "message" });
  }
  ```
- No error swallowing: errors are logged with context and re-thrown or sent to client
- Validation errors use descriptive messages: `"No snapshot found for league ${leagueId} on ${snapshotDate}"`

**Data Validation:**
- Request body validation via TypeScript interfaces attached to Fastify request
- Example: `FastifyRequest<{ Body: ConnectLeagueBody }>`
- No runtime validation library detected (no Zod usage in route handlers, though Zod is a dependency)
- Database errors: use `.executeTakeFirstOrThrow()` to fail loudly on missing data

## Logging

**Framework:** Pino (HTTP-structured logging with optional pretty-printing)
- Version: `"pino": "^8.17.2"`
- Pretty printer: `pino-pretty` for development
- Server setup in `packages/backend/src/index.ts`:
  ```typescript
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport: process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { ... } }
      : undefined,
  }
  ```

**Patterns:**
- Info level: Workflow entry/exit (e.g., "Starting snapshot job", "Snapshot data written")
- Debug level: Intermediate steps (e.g., "Using cached identity mapping")
- Warn level: Recoverable issues (e.g., "Could not auto-detect user's team")
- Error level: Failures with context (e.g., "Snapshot orchestration failed", error object attached)
- Context objects passed as first argument: `logger.info({ leagueId, playerId }, "message")`
- Avoid logging: ESPN auth cookies, tokens, secrets

## Comments

**When to Comment:**
- JSDoc-style block comments above agent classes and public methods
- Example from `espn.ts`:
  ```typescript
  /**
   * ESPN Adapter Agent
   * Per AGENTS.md §1
   *
   * Fetches and normalizes ESPN league data, handles auth cookies,
   * caches responses, and detects schema drift
   */
  ```
- Inline comments for non-obvious logic (e.g., "Strip UTF-8 BOM and normalize column headers")
- No comments for obvious code (e.g., `const id = parseInt(request.params.id, 10)`)

**JSDoc/TSDoc:**
- Used on agent class constructors and public methods
- Format: Describe behavior, params in separate lines
- Example from `projections-ingest.ts`:
  ```typescript
  /**
   * Match a FanGraphs player to a database player using identity resolution
   * @returns player ID if matched, null otherwise
   */
  private async matchPlayer(
    playerName: string,
    team?: string,
    positions?: string[],
  ): Promise<number | null>
  ```

## Function Design

**Size:**
- Most agent methods 40-100 lines (moderate size, readable)
- Breaking point: Extract to private methods when logic is distinct (e.g., `_cleanCsv`, `_getPlayerName`)

**Parameters:**
- Explicit over implicit: Pass context objects rather than relying on class state
- Options objects for complex workflows (e.g., `SnapshotJobOptions`, `ESPNFetchOptions`)
- Destructure parameters in method signature: `{ leagueId, snapshotDate, espnAuth, forceFresh }`

**Return Values:**
- Async methods return Promises of specific types (e.g., `Promise<TradeImpactAnalysis>`)
- Error handling: throw or return reply with error status (no silent null returns)
- Agents mark degraded state via database flags, not return values

**Visibility:**
- Agent classes: Single public method per responsibility (e.g., `executeSnapshot`, `analyzeTradeImpact`)
- Constructor is public; supporting methods are private
- Database dependency injected: `constructor(private db: Kysely<Database>, private logger?: Logger)`

## Module Design

**Exports:**
- Agent classes: Export the class and its interface types
- Example from `trade-recommendation.ts`:
  ```typescript
  export interface ProposedTrade { ... }
  export interface CategoryImpact { ... }
  export class TradeRecommendationAgent { ... }
  ```
- API routes: Export a single async function (e.g., `export async function leaguesRoutes(app: FastifyInstance)`)
- Adapters: Export class and all request/response interfaces

**Barrel Files:**
- Shared package exports types from `packages/shared/src/index.d.ts`
- No barrel files in backend (each module imports directly)
- Frontend: Uses `@/lib/api` and `@/contexts/AuthContext` as named imports

**Module Boundaries:**
- Clear separation: `adapters/` (external APIs), `agents/` (business logic), `api/` (routes), `db/` (persistence)
- Agents depend on adapters and database; adapters know nothing of agents
- Routes instantiate agents and adapters, orchestrate responses

## Database Conventions

**Column Names:**
- snake_case throughout (e.g., `league_id`, `snapshot_date`, `espn_league_id`)
- Suffix ID fields: `_id` (e.g., `league_id`, `player_id`, `team_id`)
- Dates: `_date` for DATE columns, `_at` for TIMESTAMP columns
- JSONB columns suffix with `_json` (e.g., `settings_json`, `stat_components_json`)

**TypeScript Mapping:**
- Database types defined in `packages/shared/src/types.ts`
- Imported into `packages/backend/src/db/schema.ts`
- Route handlers receive database rows and convert to response objects if needed

## Frontend Conventions

**Component Naming:**
- PascalCase for React components
- Context providers: `AuthProvider`, `AuthContext` (paired)
- Pages follow Next.js App Router: `page.tsx`, `layout.tsx`
- Dynamic segments: `[id]/page.tsx`, `[id]/trades/page.tsx`

**Hook Usage:**
- `useQuery` from TanStack React Query for data fetching
- Queries keyed by resource + params (e.g., `["leagues"]`, `["league", leagueId]`)
- Error boundaries via `error` state from `useQuery`
- Loading state: `isLoading` boolean with skeleton UI

**Context Pattern:**
- Auth stored in context with methods: `login()`, `signup()`, `logout()`, `loginWithGoogle()`, `loginWithGitHub()`
- Token stored in `localStorage` under `auth_token`
- API calls check token and redirect to login on 401

**Styling:**
- Tailwind CSS classes inline (no CSS modules or styled-components)
- Responsive design: `sm:`, `md:`, `lg:` breakpoints
- Spacing via Tailwind scale (e.g., `px-4`, `py-6`, `gap-4`)
