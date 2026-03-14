# Coding Conventions

**Analysis Date:** 2026-03-13

## Naming Patterns

**Files:**
- Backend agents: `kebab-case` (e.g., `trade-recommendation.ts`, `snapshot-orchestrator.ts`)
- Frontend pages: `kebab-case` with brackets for dynamic routes (e.g., `[id].tsx`, `connect/page.tsx`)
- Test files: `__tests__` directory (separate from source, co-located per feature)
- Test naming: same filename with `.test.ts` suffix (e.g., `trade-recommendation.test.ts`)

**Functions:**
- camelCase for all functions and methods (e.g., `executeSnapshot()`, `normalizeLeagueData()`)
- Private methods use underscore prefix rarely; typically private via TypeScript `private` keyword
- Async functions named normally without `async_` prefix

**Variables:**
- camelCase for all local variables and parameters (e.g., `leagueId`, `espnAuth`, `freeAgents`)
- Constants in UPPER_SNAKE_CASE: `PITCHING_STAT_KEYS`, `POSITION_SCARCITY`
- Destructured parameters: camelCase (e.g., `{ leagueId, season, espnAuth }`)

**Types:**
- PascalCase for all interfaces and type aliases (e.g., `ProposedTrade`, `TradeImpactAnalysis`, `ESPNAuthCookies`)
- Generic type parameters: single capital letter or descriptive PascalCase (e.g., `<T>`, `<Database>`)
- Union types and enums: PascalCase (e.g., `ProjectionStaleness = "fresh" | "stale" | "missing"`)

## Code Style

**Formatting:**
- ESLint configured for backend (`packages/backend/package.json`) with TypeScript support
- Frontend uses Next.js linting (`eslint-config-next`)
- No Prettier config found; ESLint acts as primary formatter
- Target: ES2022 (backend), ES2020 (frontend)
- Tabs/spacing: ESLint enforced, consistent throughout

**Linting:**
- `eslint` with `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser`
- Run: `npm run lint` (per-package)
- Strict TypeScript settings across all packages:
  - `strict: true` in tsconfig.json
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `noImplicitReturns: true`
  - `noFallthroughCasesInSwitch: true`

**Module system:**
- ES modules (type: "module" in package.json)
- Explicit `.js` extensions on relative imports: `import { db } from "../db/connection.js"`
- Path aliases in frontend: `@/*` maps to `./src/*` (configured in `tsconfig.json`)

## Import Organization

**Order:**
1. Type imports: `import type { ... } from "package"`
2. External packages: `import { Logger } from "pino"`
3. Internal relative imports: `import { getDb } from "../db/connection.js"`
4. Unused imports removed (ESLint enforces)

**Path Aliases:**
- Frontend only: `@/lib/api`, `@/components/ui/Button`
- Backend uses relative paths with full `.js` extensions
- Shared package imported as `@espn-fantasy/shared` or with relative path

**Module exports:**
- Named exports preferred: `export function getRecommendations(...)`
- Type exports marked explicitly: `export type ProposedTrade = { ... }`
- Index files (barrel exports) used sparingly in shared: `packages/shared/src/index.ts`
- Default exports avoided (named exports only)

## Error Handling

**Patterns:**
- Try-catch with `await` for async operations
- Errors propagated up (agents don't swallow errors silently)
- Early returns for validation failures (no exception throwing for invalid input)
- Type-safe error construction: errors include context object

**Example patterns:**
```typescript
// Validation error - early return
const validation = ConnectLeagueSchema.safeParse(request.body);
if (!validation.success) {
  return reply.code(400).send({ error: "Validation failed", details: validation.error.errors });
}

// Async operation - try-catch
try {
  await espnAdapter.fetchLeague({ leagueId, season });
} catch (error) {
  request.log.error({ error }, "Failed to fetch league");
  return reply.code(500).send({ error: "Failed to fetch league" });
}
```

**Error context:**
- Include relevant IDs: `{ leagueId, teamId, snapshotDate }`
- Never log secrets (ESPN cookies, auth tokens)
- Provide user-friendly messages in replies (technical details in server logs only)

## Logging

**Framework:** Pino (structured logging)
- Optional logger passed to agent constructors: `constructor(private db, private logger?: Logger)`
- Logger used via optional chaining: `this.logger?.info(...)`

**Patterns:**
```typescript
// Info: operation start/completion
this.logger?.info({ leagueId, snapshotDate }, "Starting snapshot job");

// Warn: degraded state or minor issues
this.logger?.warn({ swid }, "Could not auto-detect user's team");

// Error: exception or critical failure
this.logger?.error({ error }, "Failed to batch insert players");
```

**Guidelines:**
- Always include context object first: `{ leagueId, teamId }`
- Message is second parameter: descriptive, present tense
- Never log full error objects inline; use `{ error }` in context
- Do NOT log ESPN cookies, `SWID`, `espn_s2`, or JWT tokens

## Comments

**When to Comment:**
- Block comments above non-obvious logic sections (e.g., SQL queries, complex math)
- Line comments for "why", not "what" (code should express intent)
- Disable ESLint rules only with explanation: `// @ts-expect-error reserved for future standings-based scoring`

**JSDoc/TSDoc:**
- Used for public agent class methods (e.g., `executeSnapshot()`)
- Format: `/** Doc comment */` above function
- Include purpose, parameters if not self-documenting, return type
- Not required for simple getters/setters

**Example:**
```typescript
/**
 * Execute daily snapshot job
 *
 * Fetches ESPN data, archives raw payload, normalizes to schema,
 * writes snapshot tables, computes projections, returns status.
 */
async executeSnapshot(options: SnapshotJobOptions): Promise<void> { ... }
```

## Function Design

**Size:**
- Prefer functions under 50 lines (except agents with complex orchestration)
- Break long chains into named intermediate variables
- Extract loops and conditionals into helper functions

**Parameters:**
- Prefer object parameters over 3+ positional args: `{ leagueId, teamId, snapshotDate }`
- Required params first, optional params in object (or make entire param object)
- Use type annotations: no implicit `any`

**Return Values:**
- Return early to reduce nesting: `if (!value) return;`
- Async functions always return Promise: `async fn(): Promise<void>`
- No implicit `undefined` returns; use explicit void or return value

**Example:**
```typescript
async getRecommendations(
  leagueId: number,
  teamId: number,
  options?: { maxRecommendations?: number }
): Promise<WaiverRecommendation[]> {
  const { maxRecommendations = 10 } = options || {};

  // Fetch data
  const roster = await db.selectFrom("team_roster_snapshot")...;
  if (!roster.length) {
    this.logger?.warn({ leagueId, teamId }, "Empty roster");
    return [];
  }

  // Process and return
  return recommendations;
}
```

## Module Design

**Agent Classes:**
- Single responsibility: one agent per file (e.g., `TradeRecommendationAgent`)
- Constructor accepts `Kysely<Database>` and optional `Logger`
- Public methods: primary entry points (e.g., `analyzeProposedTrade()`)
- Private methods: helpers prefixed with underscore if needed, or just `private` keyword

**API Route Handlers:**
- Organized in `packages/backend/src/api/*.ts` per resource (leagues, projections, etc.)
- Function exported from each file: `export async function leaguesRoutes(app: FastifyInstance)`
- Use Zod schemas for validation (`packages/backend/src/utils/validation.ts`)
- Early returns for error cases (no exception flow)

**Type Definitions:**
- Shared types in `packages/shared/src/types.ts` (exported via index)
- Database schema types in `packages/backend/src/db/schema.ts`
- API request/response types co-located in route files
- Interface names reflect purpose: `ProposedTrade`, `TradeImpactAnalysis`

**Barrel Files:**
- Used only in shared: `packages/shared/src/index.ts` exports all public types and functions
- Agents imported directly: `import { TradeRecommendationAgent } from "../agents/trade-recommendation.js"`
- Avoids wildcard imports; explicit imports preferred

---

*Convention analysis: 2026-03-13*
