# Phase 13: Clean up tech debt - Research

**Researched:** 2026-02-26
**Domain:** Technical debt remediation - backend agents, API routes, database, frontend, testing
**Confidence:** HIGH

## Summary

Phase 13 addresses systematic technical debt across the entire codebase, prioritized by severity (Critical/High → Medium → Low). The phase encompasses 6 major domains: broken agent code, API security vulnerabilities, database integrity issues, frontend type safety, testing gaps, and infrastructure reliability.

Key challenges include: broken projection field access in TradeRecommendationAgent (silently producing incorrect results), pervasive N+1 query patterns (120+ individual INSERTs per snapshot), missing request validation (crashes on malformed input), unimplemented CSRF validation (OAuth security gap), and placeholder tests masking zero coverage.

The research reveals that TypeScript strict mode is already enabled in both backend and frontend tsconfig.json files, which means the 28 `any` types in frontend code are explicit violations that bypass strict checks. This makes them easier to find and fix systematically.

**Primary recommendation:** Batch similar fixes together (all parseInt validations, all N+1 queries, all request body schemas) and start with critical bugs that have clear correctness criteria before tackling complex refactors.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Priority Tiers:**
- Critical/High — Broken functionality, security vulnerabilities, data corruption risks
- Medium — Performance bottlenecks, maintainability issues, missing validation
- Low — Code quality, consistency, technical debt that doesn't impact current functionality

**Approach:**
- Fix critical issues first — TradeRecommendationAgent broken projection access, N+1 queries, missing request validation
- Batch similar fixes — Group all parseInt validations, all request body validations, all N+1 query fixes
- Progressive refinement — Start with fixes that have clear correctness criteria, defer complex refactors

**Out of Scope:**
- Complete rewrite of any agents or routes
- Migration to different frameworks or libraries
- Adding new features disguised as "improvements"
- Comprehensive test coverage (target critical paths only)

### Claude's Discretion

- Order of fix batches within priority tiers
- Specific validation schema patterns (as long as Zod is used for request validation)
- LRU cache implementation approach (library vs custom)
- Testing framework choices and assertion patterns
- Specific string similarity algorithm selection

### Deferred Ideas (OUT OF SCOPE)

- Complete TypeScript strict mode across entire codebase (already enabled - see research)
- Comprehensive integration test suite
- Performance profiling and optimization
- Migration to newer framework versions
- Refactoring monolithic files into smaller modules
- Accessibility improvements beyond critical issues
</user_constraints>

---

## Standard Stack

### Core Libraries (Already in Use)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Fastify | 4.25.2 | HTTP server | In use, no upgrade needed |
| Kysely | 0.27.2 | Type-safe SQL builder | In use, no upgrade needed |
| Zod | 3.22.4 | Runtime validation | Installed but underutilized |
| BullMQ | 5.1.5 | Job queue | In use, needs DLQ config |
| Vitest | 1.1.1 | Testing framework | In use, has placeholder tests |
| TypeScript | 5.3.3 | Type safety | In use, strict mode enabled |

### Supporting Libraries (To Add)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fastest-levenshtein | ~1.0.x | String distance | PlayerIdentityResolutionAgent fuzzy matching |
| lru-cache | ~10.x | LRU cache | ESPNAdapter unbounded cache replacement |
| fastify-type-provider-zod | ~2.x | Zod + Fastify integration | Request validation schemas |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fastest-levenshtein | Custom character overlap | Custom is faster but misses typos like "Trout"/"Truou" |
| lru-cache | Custom Map with eviction | Custom avoids dependency but lacks TTL, dispose callbacks |
| fastify-type-provider-zod | Manual Zod schemas per route | Manual approach works but loses automatic type inference |

**Installation:**
```bash
# For string matching fix
pnpm add fastest-levenshtein --filter @espn-fantasy/backend

# For cache fix
pnpm add lru-cache --filter @espn-fantasy/backend

# For validation (optional - can use Zod directly)
pnpm add fastify-type-provider-zod --filter @espn-fantasy/backend
```

---

## Architecture Patterns

### 1. Kysely Batch Operations Pattern

**Problem:** Current code uses individual INSERTs/SELECTs in loops (N+1 pattern)

**Solution:** Batch operations using Kysely's array support

**Example:**
```typescript
// BEFORE (N+1 pattern - 120+ individual INSERTs)
for (const impact of categoryImpacts) {
  await db.insertInto("team_daily_projected_category")
    .values({
      league_id: leagueId,
      snapshot_date: snapshotDate,
      team_id: teamId,
      category_key: impact.key,
      projected_value: impact.value
    })
    .execute();
}

// AFTER (single batch INSERT)
await db.insertInto("team_daily_projected_category")
  .values(categoryImpacts.map(impact => ({
    league_id: leagueId,
    snapshot_date: snapshotDate,
    team_id: teamId,
    category_key: impact.key,
    projected_value: impact.value
  })))
  .execute();
```

**Source:** [Kysely batch insert best practices](https://betterstack.com/community/guides/scaling-nodejs/kysely-query-builder/)

**Critical:** Always check array length before using `.where("col", "in", array)` - Kysely generates invalid SQL for empty arrays.

### 2. Fastify Request Validation with Zod

**Problem:** Request body cast as types without runtime validation

**Solution:** Zod schemas with Fastify type providers

**Example:**
```typescript
// BEFORE (unsafe cast)
const { email, password } = request.body as { email: string; password: string };

// AFTER (validated with Zod)
import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

// In route handler
fastify.post("/auth/login", {
  schema: {
    body: LoginSchema
  },
  handler: async (request, reply) => {
    // request.body is now type-safe and validated
    const { email, password } = request.body;
    // ...
  }
});
```

**Alternative (if not using type provider):**
```typescript
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

// Manual parse in handler
const result = LoginSchema.safeParse(request.body);
if (!result.success) {
  return reply.code(400).send({ error: result.error.errors });
}
const { email, password } = result.data;
```

**Source:** [Fastify Zod validation 2026](https://github.com/turkerdev/fastify-type-provider-zod)

### 3. OAuth CSRF State Validation Pattern

**Problem:** State parameter generated but never validated

**Solution:** Cryptographically secure state with server-side verification

**Example:**
```typescript
// Generate state (already done)
const state = crypto.randomBytes(32).toString("hex");

// Store in session/cookie with short TTL
reply.setCookie("oauth_state", state, {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  maxAge: 600 // 10 minutes
});

// On callback - VALIDATE (currently missing)
const callbackState = request.query.state;
const storedState = request.cookies.oauth_state;

if (!callbackState || !storedState || callbackState !== storedState) {
  return reply.code(400).send({ error: "Invalid state parameter" });
}

// Clear state cookie after validation
reply.clearCookie("oauth_state");
```

**Source:** [OAuth 2.0 CSRF state validation 2026](https://www.authgear.com/post/oauth2-security-best-practices-pkce-state)

**Key requirements:** Cryptographically secure random values, server-side storage with short TTL (5-10 minutes), timing-safe comparison, single-use (remove after validation).

### 4. BullMQ Dead Letter Queue Pattern

**Problem:** Failed jobs after 3 retries are logged and discarded

**Solution:** Move permanently failed jobs to DLQ for inspection

**Example:**
```typescript
// Create DLQ
const dlqQueue = new Queue("snapshots-dlq", { connection });

// In worker - listen for failed event
worker.on("failed", async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
    // Max retries exceeded - move to DLQ
    await dlqQueue.add("failed-snapshot", {
      originalJobId: job.id,
      originalJobName: job.name,
      originalData: job.data,
      error: err.message,
      stackTrace: err.stack,
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString()
    }, {
      removeOnComplete: { age: 86400 * 30 }, // Keep 30 days
    });

    logger.error({ jobId: job.id, error: err }, "Job moved to DLQ");
  }
});
```

**Source:** [BullMQ DLQ implementation 2026](https://dev.to/ronak_navadia/level-up-your-nestjs-app-with-bullmq-queues-dlqs-bull-board-5hnn)

### 5. LRU Cache with Bounded Size

**Problem:** Unbounded Map cache grows indefinitely

**Solution:** LRU cache with max size limit

**Example:**
```typescript
import { LRUCache } from "lru-cache";

// BEFORE (unbounded)
private cache = new Map();

// AFTER (bounded LRU)
private cache = new LRUCache({
  max: 500, // Maximum number of items
  ttl: 1000 * 60 * 60, // 1 hour TTL
  updateAgeOnGet: true, // Update TTL on access
  dispose: (value, key) => {
    // Optional: cleanup callback when evicted
    logger.debug({ key }, "Cache entry evicted");
  }
});
```

**Source:** [LRU cache TypeScript best practices 2026](https://www.npmjs.com/package/lru-cache)

**Configuration notes:** At least one of `max`, `ttl`, or `maxSize` is required. For performance, prefer specifying `max` upfront. Avoid dispose functions unless needed (performance impact).

### 6. parseInt Validation Helper

**Problem:** Dozens of `parseInt(param, 10)` with no NaN check

**Solution:** Validated parser helper function

**Example:**
```typescript
// shared/src/utils.ts (or backend/src/api/helpers.ts)
export function parseIntParam(value: string, paramName: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid ${paramName}: must be a valid integer`);
  }
  return parsed;
}

// Usage in route handlers
const leagueId = parseIntParam(request.params.leagueId, "leagueId");
const teamId = parseIntParam(request.params.teamId, "teamId");
```

**Alternative (Fastify schema-based):**
```typescript
// Define numeric params in schema - Fastify auto-coerces
fastify.get("/leagues/:leagueId", {
  schema: {
    params: z.object({
      leagueId: z.coerce.number().int().positive()
    })
  },
  handler: async (request, reply) => {
    // request.params.leagueId is already a number
  }
});
```

**Source:** [Fastify request validation 2026](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)

### 7. Projection Field Access Pattern (Fix Broken Code)

**Problem:** Code references `projection.ab`, `projection.ip` but data is in `stat_components_json` with uppercase keys

**Solution:** Parse JSON and access uppercase keys

**Example:**
```typescript
// BEFORE (broken - these fields don't exist)
const isBatter = projection.ab != null && Number(projection.ab) > 0;
const isPitcher = projection.ip != null && Number(projection.ip) > 0;

// AFTER (correct - parse JSON and use uppercase keys)
interface StatComponents {
  AB?: number;
  IP?: number;
  H?: number;
  BB?: number;
  // ... other components
}

const components = JSON.parse(projection.stat_components_json) as StatComponents;
const isBatter = components.AB != null && components.AB > 0;
const isPitcher = components.IP != null && components.IP > 0;

// For rate stat calculations
const avg = (components.H || 0) / Math.max(1, components.AB || 1);
const era = (9 * (components.ER || 0)) / Math.max(0.1, components.IP || 0.1);
```

**Critical:** This is a **data correctness bug** that silently produces wrong results. Must be fixed first.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| String similarity | Character overlap counting | `fastest-levenshtein` | Levenshtein handles transpositions, insertions, deletions properly. Custom overlap misses "Mike Trout" vs "Tim Truou" typos. |
| LRU cache | Custom Map + eviction logic | `lru-cache` | Production library handles TTL, dispose callbacks, max size, memory management. Edge cases are hard (race conditions, memory leaks). |
| Request validation | Manual type guards | Zod schemas | Runtime validation + type inference. Manual checks don't compose, miss edge cases, drift from types. |
| CSRF state storage | Custom cookie encryption | Fastify signed cookies | Built-in security, timing-safe comparison, automatic expiry. Rolling crypto is dangerous. |
| SQL escaping | Manual string replacement | Kysely parameterized queries | Kysely handles escaping per-database. Manual escaping misses encoding issues, collation variants. |
| Fuzzy matching | Regex + string methods | Levenshtein distance library | Edit distance catches typos regex can't. Libraries are optimized (Myers algorithm for strings >32 chars). |

**Key insight:** Security, caching, and string matching have subtle edge cases that libraries solve. Custom solutions tend to miss: timing attacks (CSRF), memory leaks (caching), encoding issues (SQL), transposition errors (fuzzy matching).

---

## Common Pitfalls

### Pitfall 1: Empty Array in Kysely WHERE IN Clause

**What goes wrong:** `WHERE team_id IN ()` is invalid SQL, Kysely generates broken query
**Why it happens:** Split on empty string produces `[""]` → `[NaN]`, or filter leaves empty array
**How to avoid:**
```typescript
// Check length before query
const teamIds = request.query.teamIds?.split(",").map(Number).filter(id => !isNaN(id)) || [];

if (teamIds.length === 0) {
  return reply.send({ data: [] }); // Early return
}

const results = await db.selectFrom("team")
  .where("team_id", "in", teamIds) // Safe now
  .execute();
```
**Warning signs:** 500 errors on requests with empty query params, Kysely SQL syntax errors

### Pitfall 2: Projection Field Access Bug (Data Correctness)

**What goes wrong:** TradeRecommendationAgent references `projection.ab`, `projection.ip` but these fields don't exist. All checks return undefined, rate stats produce incorrect values.
**Why it happens:** Schema stores data in `stat_components_json` JSONB with uppercase keys (AB, IP, H, BB). Code assumes direct field access.
**How to avoid:**
```typescript
// Always parse stat_components_json first
const components = JSON.parse(projection.stat_components_json) as StatComponents;

// Use uppercase keys
const isBatter = components.AB != null && components.AB > 0;
const avg = (components.H || 0) / Math.max(1, components.AB || 1);
```
**Warning signs:** Trade recommendations showing all zeros, category impacts missing, isCategoryRelevant always false

### Pitfall 3: parseInt Without NaN Check

**What goes wrong:** `parseInt("abc", 10)` returns `NaN`, math operations produce `NaN`, queries fail with type errors
**Why it happens:** params are always strings, parseInt silently fails on invalid input
**How to avoid:**
```typescript
// Helper function approach
const leagueId = parseIntParam(request.params.leagueId, "leagueId");

// Or schema validation approach
schema: {
  params: z.object({ leagueId: z.coerce.number().int().positive() })
}
```
**Warning signs:** 500 errors on routes with numeric params, NaN appearing in logs, database type errors

### Pitfall 4: Request Body Without Validation

**What goes wrong:** Malformed JSON or missing fields crash handler, no error message, 500 instead of 400
**Why it happens:** Type cast `as { field: string }` doesn't validate runtime data
**How to avoid:**
```typescript
// Define Zod schema
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

// Validate before use
const result = schema.safeParse(request.body);
if (!result.success) {
  return reply.code(400).send({ error: result.error.errors });
}
```
**Warning signs:** 500 errors on POST/PUT endpoints, "Cannot read property X of undefined" errors

### Pitfall 5: CSRF State Not Validated

**What goes wrong:** OAuth flow accepts any state parameter, attacker can trick user into authorizing attacker's account linkage
**Why it happens:** State generation implemented but validation TODO was never completed
**How to avoid:**
```typescript
// On callback, compare with stored state
const callbackState = request.query.state;
const storedState = request.cookies.oauth_state;

if (!callbackState || callbackState !== storedState) {
  return reply.code(400).send({ error: "CSRF check failed" });
}
```
**Warning signs:** Security audit findings, OWASP OAuth checklist failures, no state cookie checks

### Pitfall 6: BullMQ Jobs Failing Silently

**What goes wrong:** Job fails after 3 retries, gets logged, then discarded. No visibility into failure patterns.
**Why it happens:** Worker has `failed` event listener but only logs, doesn't persist to DLQ
**How to avoid:**
```typescript
worker.on("failed", async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
    await dlqQueue.add("failed-job", {
      originalJobId: job.id,
      originalData: job.data,
      error: err.message
    });
  }
});
```
**Warning signs:** Jobs failing repeatedly with no pattern analysis, missing snapshots with no trace

### Pitfall 7: Unbounded In-Memory Cache

**What goes wrong:** ESPNAdapter cache grows without limit, memory leak over time, process OOM crash
**Why it happens:** `new Map()` with no max size or eviction policy
**How to avoid:**
```typescript
// Use LRU cache with max size
private cache = new LRUCache({ max: 500, ttl: 1000 * 60 * 60 });
```
**Warning signs:** Memory usage growing over time, OOM crashes after days/weeks, cache Map size > 10k entries

### Pitfall 8: N+1 Query Pattern

**What goes wrong:** Loop executes 120+ individual SQL queries, snapshot takes minutes instead of seconds
**Why it happens:** Individual INSERT per item instead of batch
**How to avoid:**
```typescript
// Batch all inserts
await db.insertInto("table").values(items.map(item => ({ ... }))).execute();
```
**Warning signs:** Slow snapshot times, high database CPU, hundreds of queries in logs

### Pitfall 9: TypeScript `any` Types Bypassing Strict Mode

**What goes wrong:** Runtime errors from undefined properties, incorrect type assumptions
**Why it happens:** Explicit `: any` annotations bypass strict mode type checking
**How to avoid:**
```typescript
// Define proper interface
interface League { id: number; name: string; /* ... */ }
const leagues: League[] = await fetch("/api/leagues").then(r => r.json());

// Or use unknown + type guard
const data: unknown = await fetch().then(r => r.json());
if (isLeagueArray(data)) { /* safe to use */ }
```
**Warning signs:** TypeScript errors in adjacent code, runtime "Cannot read property" errors

### Pitfall 10: process.exit() in Worker

**What goes wrong:** Worker calls `process.exit(0)` when Slack disabled, kills entire process including co-located workers
**Why it happens:** Misunderstanding of worker process model - multiple workers run in same process
**How to avoid:**
```typescript
// Log warning and continue
if (!isSlackEnabled()) {
  logger.warn("Slack disabled - morning report worker inactive");
  // Don't start this worker, but let process continue
  return;
}
```
**Warning signs:** All workers dying when one feature disabled, "process exited unexpectedly" logs

---

## Code Examples

Verified patterns from official sources and current codebase analysis.

### Kysely Batch Insert (Performance Fix)

```typescript
// Source: packages/backend/src/agents/standings-projection.ts (current N+1 pattern)
// Fixed version using batch insert

// BEFORE (lines 288-320) - N+1 pattern
for (const impact of categoryImpacts) {
  await this.db.insertInto("team_daily_projected_category")
    .values({
      league_id: leagueId,
      snapshot_date: snapshotDate,
      team_id: teamId,
      category_key: impact.key,
      projected_value: impact.value,
      projected_rank: impact.rank
    })
    .execute();
}

// AFTER - Single batch insert
if (categoryImpacts.length > 0) { // Guard against empty array
  await this.db.insertInto("team_daily_projected_category")
    .values(categoryImpacts.map(impact => ({
      league_id: leagueId,
      snapshot_date: snapshotDate,
      team_id: teamId,
      category_key: impact.key,
      projected_value: impact.value,
      projected_rank: impact.rank
    })))
    .execute();
}
```

### Zod Request Validation (Security Fix)

```typescript
// Source: packages/backend/src/api/auth.ts (lines 15-20, 94-98)
// Fixed version with Zod validation

import { z } from "zod";

const SignupSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  username: z.string().min(3).max(50).optional()
});

const LoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password required")
});

// In route handler
fastify.post("/auth/signup", async (request, reply) => {
  const validation = SignupSchema.safeParse(request.body);

  if (!validation.success) {
    return reply.code(400).send({
      error: "Validation failed",
      details: validation.error.errors
    });
  }

  const { email, password, username } = validation.data;
  // ... rest of handler
});
```

### Projection Field Access Fix (Critical Bug)

```typescript
// Source: packages/backend/src/agents/trade-recommendation.ts (lines 988-1075)
// Fixed version accessing stat_components_json correctly

interface StatComponents {
  // Batting
  AB?: number;
  H?: number;
  R?: number;
  HR?: number;
  RBI?: number;
  SB?: number;
  BB?: number;
  HBP?: number;
  SF?: number;
  TB?: number;
  // Pitching
  IP?: number;
  ER?: number;
  H_P?: number; // Hits allowed (pitching)
  BB_P?: number; // Walks allowed (pitching)
  K?: number;
  W?: number;
  SV?: number;
  QS?: number;
  HLD?: number;
}

private isCategoryRelevant(category: any, projection: any): boolean {
  // Parse the JSON field FIRST
  const components: StatComponents = JSON.parse(projection.stat_components_json);

  const isBatter = components.AB != null && components.AB > 0;
  const isPitcher = components.IP != null && components.IP > 0;

  const batterCategories = ["R", "HR", "RBI", "SB", "AVG", "OBP", "SLG", "OPS"];
  const pitcherCategories = ["W", "SV", "K", "ERA", "WHIP", "QS", "HLD"];

  if (batterCategories.includes(category.statKey)) {
    return isBatter;
  }
  if (pitcherCategories.includes(category.statKey)) {
    return isPitcher;
  }

  return false;
}

private getProjectedCategoryValue(category: any, projection: any): number {
  const components: StatComponents = JSON.parse(projection.stat_components_json);
  const statKey = category.statKey;

  switch (statKey) {
    case "AVG":
      return (components.H || 0) / Math.max(1, components.AB || 1);
    case "OBP":
      return (
        ((components.H || 0) + (components.BB || 0) + (components.HBP || 0)) /
        Math.max(1, (components.AB || 0) + (components.BB || 0) + (components.HBP || 0) + (components.SF || 0))
      );
    case "SLG":
      return (components.TB || 0) / Math.max(1, components.AB || 1);
    case "OPS": {
      const obp = ((components.H || 0) + (components.BB || 0) + (components.HBP || 0)) /
        Math.max(1, (components.AB || 0) + (components.BB || 0) + (components.HBP || 0) + (components.SF || 0));
      const slg = (components.TB || 0) / Math.max(1, components.AB || 1);
      return obp + slg;
    }
    case "ERA":
      return (9 * (components.ER || 0)) / Math.max(0.1, components.IP || 0.1);
    case "WHIP":
      return ((components.H_P || 0) + (components.BB_P || 0)) / Math.max(0.1, components.IP || 0.1);
    // Counting stats
    case "R": return components.R || 0;
    case "HR": return components.HR || 0;
    case "RBI": return components.RBI || 0;
    case "SB": return components.SB || 0;
    case "W": return components.W || 0;
    case "SV": return components.SV || 0;
    case "K": return components.K || 0;
    case "QS": return components.QS || 0;
    case "HLD": return components.HLD || 0;
    default:
      return 0;
  }
}
```

### OAuth CSRF State Validation

```typescript
// Source: packages/backend/src/api/auth-oauth.ts (lines 172-193)
// Fixed version with state validation

// Authorization flow
fastify.get("/auth/oauth/authorize", async (request, reply) => {
  const state = crypto.randomBytes(32).toString("hex");

  // Store in signed cookie with short TTL
  reply.setCookie("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    signed: true // Use Fastify's cookie signing
  });

  const authUrl = `https://provider.com/oauth/authorize?` +
    `client_id=${CLIENT_ID}&` +
    `state=${state}&` +
    `redirect_uri=${encodeURIComponent(CALLBACK_URL)}`;

  reply.redirect(authUrl);
});

// Callback handler - VALIDATE STATE
fastify.get("/auth/oauth/callback", async (request, reply) => {
  const callbackState = request.query.state as string;
  const storedState = request.cookies.oauth_state;

  // Critical: validate state parameter
  if (!callbackState || !storedState || callbackState !== storedState) {
    this.logger.error({ callbackState, storedState }, "CSRF state mismatch");
    return reply.code(400).send({ error: "Invalid state parameter - possible CSRF attack" });
  }

  // Clear state cookie (single use)
  reply.clearCookie("oauth_state");

  // ... continue with OAuth flow
});
```

### BullMQ Dead Letter Queue

```typescript
// Source: packages/backend/src/workers/snapshot-worker.ts
// Enhanced with DLQ pattern

import { Queue, Worker, type Job } from "bullmq";

// Create main queue and DLQ
export const snapshotQueue = new Queue("snapshots", { connection });
export const snapshotDLQ = new Queue("snapshots-dlq", { connection });

// Worker with DLQ handling
const worker = new Worker<SnapshotJobData>(
  "snapshots",
  async (job: Job<SnapshotJobData>) => {
    // ... job processing
  },
  {
    connection,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 }
  }
);

// Move permanently failed jobs to DLQ
worker.on("failed", async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
    logger.warn({ jobId: job.id }, "Max retries exceeded - moving to DLQ");

    await snapshotDLQ.add("failed-snapshot", {
      originalJobId: job.id,
      originalJobName: job.name,
      originalData: job.data,
      errorMessage: err.message,
      errorStack: err.stack,
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString()
    }, {
      removeOnComplete: { age: 86400 * 30 } // Keep 30 days for analysis
    });
  }
});
```

### LRU Cache Replacement

```typescript
// Source: packages/backend/src/adapters/espn.ts (line 252)
// Fixed version with bounded cache

import { LRUCache } from "lru-cache";

export class ESPNAdapter {
  private logger?: Logger;

  // BEFORE (unbounded)
  // private cache = new Map();

  // AFTER (bounded LRU)
  private cache = new LRUCache<string, any>({
    max: 500, // Maximum 500 cached responses
    ttl: 1000 * 60 * 60, // 1 hour TTL
    updateAgeOnGet: true, // Refresh TTL on access
    updateAgeOnHas: false, // Don't refresh on has() checks
    dispose: (value, key, reason) => {
      // Optional: log when entries evicted
      if (reason === "evict" || reason === "delete") {
        this.logger?.debug({ key, reason }, "Cache entry evicted");
      }
    }
  });

  // Cache usage remains the same
  async fetchLeagueData(leagueId: number, season: number) {
    const cacheKey = `league-${leagueId}-${season}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const data = await this.fetchFromESPN(leagueId, season);
    this.cache.set(cacheKey, data);
    return data;
  }
}
```

### Levenshtein Distance for Fuzzy Matching

```typescript
// Source: packages/backend/src/agents/player-identity.ts (lines 180-204)
// Fixed version using proper string distance

import { distance as levenshtein } from "fastest-levenshtein";

private calculateSimilarity(name1: string, name2: string): number {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();

  // Exact match
  if (n1 === n2) return 1.0;

  // Calculate Levenshtein distance
  const dist = levenshtein(n1, n2);
  const maxLen = Math.max(n1.length, n2.length);

  // Normalize to 0-1 similarity score
  const similarity = 1 - (dist / maxLen);

  return similarity;
}

// Enhanced with position/team boosting
async findMatchingPlayer(
  name: string,
  team?: string,
  positions?: string[]
): Promise<{ playerId: number; confidence: number } | null> {
  const candidates = await this.db
    .selectFrom("player")
    .selectAll()
    .execute();

  let bestMatch: { playerId: number; confidence: number } | null = null;

  for (const candidate of candidates) {
    let score = this.calculateSimilarity(name, candidate.name);

    // Boost score if team matches
    if (team && candidate.team === team) {
      score *= 1.2;
    }

    // Boost score if position matches
    if (positions && positions.some(p => candidate.positions?.includes(p))) {
      score *= 1.1;
    }

    // Cap at 1.0 after boosting
    score = Math.min(score, 1.0);

    if (!bestMatch || score > bestMatch.confidence) {
      bestMatch = { playerId: candidate.id, confidence: score };
    }
  }

  // Only return if confidence above threshold
  return (bestMatch && bestMatch.confidence >= 0.8) ? bestMatch : null;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual type guards | Zod runtime validation | ~2022 | Type safety + runtime validation in one, eliminates drift between types and validation |
| Character overlap matching | Levenshtein distance | Industry standard | Catches transpositions and typos that character sets miss |
| Unbounded caches | LRU with max size | Production best practice | Prevents memory leaks, predictable memory footprint |
| Individual SQL operations | Batch operations | Kysely 0.27+ supports arrays | 10-100x performance improvement on bulk operations |
| OAuth state TODOs | CSRF validation required | OWASP BCP 2023 | RFC 9700 (OAuth 2.0 Security BCP) mandates state validation |
| Manual cookie signing | Fastify signed cookies | Fastify 4.x | Built-in timing-safe comparison, automatic expiry |

**Deprecated/outdated:**
- **Character set overlap for fuzzy matching:** Misses common typos (transpositions), produces false positives on short names
- **Unbounded Map for caching:** Memory leak vector, no TTL support, no eviction policy
- **Type casts without validation:** Runtime errors, security vulnerabilities (injection attacks)
- **OAuth without CSRF checks:** Violates RFC 9700, enables account linking attacks

---

## Open Questions

### 1. Migration Rollback Strategy

**What we know:** Database has 13 forward-only migrations, no rollback SQL
**What's unclear:** Production rollback procedure if migration causes issues
**Recommendation:**
- Document that rollbacks are manual (write inverse SQL per-migration)
- For Phase 13 database fixes (migrations 008, 009 constraints), test rollback SQL in staging
- Consider adding rollback SQL as comments in migration files for future reference

**Sources:** [PostgreSQL migration best practices 2026](https://oneuptime.com/blog/post/2026-02-02-postgresql-database-migrations/view) recommends transaction-wrapped migrations and PITR for production rollbacks.

### 2. TypeScript Strict Mode Violations

**What we know:** `strict: true` is enabled in both backend and frontend tsconfig.json
**What's unclear:** Why 28 explicit `: any` types exist despite strict mode
**Recommendation:**
- These are intentional strict mode bypasses (`: any` annotation)
- Create systematic fix: grep for `: any`, define proper interfaces, replace incrementally
- Not a "migration to strict mode" task - it's removing explicit bypasses

**Sources:** Both `packages/backend/tsconfig.json` and `packages/frontend/tsconfig.json` have `"strict": true` enabled.

### 3. Testing Strategy Scope

**What we know:** 8 placeholder tests (`expect(true).toBe(true)`), zero coverage for critical agents
**What's unclear:** Which critical paths need tests vs. which can remain untested
**Recommendation:**
- Focus on: TradeRecommendationAgent (broken code being fixed), ESPNAdapter (rate limiting), auth routes (validation)
- Skip: Snapshot orchestrator (integration test complexity), frontend components (out of scope)
- Delete placeholder tests or replace with real assertions

---

## Sources

### Primary (HIGH confidence)

- **Kysely documentation** - [Getting Started with Kysely](https://betterstack.com/community/guides/scaling-nodejs/kysely-query-builder/)
- **Kysely batch insert patterns** - [Easy way to perform batch insert](https://github.com/kysely-org/kysely/issues/1375)
- **Fastify validation** - [Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- **Zod with Fastify** - [fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod)
- **OAuth 2.0 Security BCP** - [RFC 9700 Best Current Practice](https://datatracker.ietf.org/doc/rfc9700/)
- **OAuth CSRF state validation** - [OAuth2 Security Best Practices](https://www.authgear.com/post/oauth2-security-best-practices-pkce-state)
- **BullMQ DLQ pattern** - [Level Up Your NestJS App with BullMQ DLQs](https://dev.to/ronak_navadia/level-up-your-nestjs-app-with-bullmq-queues-dlqs-bull-board-5hnn)
- **BullMQ DLQ implementation** - [How to Implement Dead Letter Queues in BullMQ](https://oneuptime.com/blog/post/2026-01-21-bullmq-dead-letter-queue/view)
- **LRU cache npm package** - [lru-cache documentation](https://www.npmjs.com/package/lru-cache)
- **Levenshtein distance library** - [fastest-levenshtein](https://github.com/ka-weihe/fastest-levenshtein)
- **Next.js error handling** - [Error Handling in Next.js App Router](https://nextjs.org/docs/app/getting-started/error-handling)

### Secondary (MEDIUM confidence)

- **PostgreSQL migration rollbacks** - [How to Handle Database Migrations in PostgreSQL](https://oneuptime.com/blog/post/2026-02-02-postgresql-database-migrations/view)
- **TypeScript strict mode migration** - [How to Enable TypeScript Strict Mode](https://oneuptime.com/blog/post/2026-02-20-typescript-strict-mode-guide/view)
- **SQL injection prevention** - [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- **PostgreSQL ILIKE security** - [Preventing SQL Injection in PostgreSQL](https://www.crunchydata.com/blog/preventing-sql-injection-attacks-in-postgresql)

### Codebase Analysis (HIGH confidence)

- **Current tsconfig settings:** Both backend and frontend have `"strict": true` enabled
- **Zod already installed:** `packages/backend/package.json` line 41
- **BullMQ version:** 5.1.5 (supports DLQ pattern)
- **Vitest already installed:** Testing framework in place
- **101 parseInt calls:** Across 9 API route files (needs systematic fix)
- **28 explicit any types:** In frontend code (strict mode bypasses)
- **8 placeholder tests:** 5 in `empty-array-guards.test.ts`, 3 in `trade-recommendation.test.ts`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified in package.json, versions confirmed
- Architecture: HIGH - Patterns sourced from official docs and 2026 articles
- Pitfalls: HIGH - Identified from actual codebase analysis (lines cited)
- Testing: MEDIUM - No existing test patterns to analyze, recommendations based on common practices
- Database migrations: MEDIUM - No rollback SQL exists, recommendations based on PostgreSQL best practices

**Research date:** 2026-02-26
**Valid until:** ~30 days (March 26, 2026) - libraries are stable, security practices are current per RFC 9700

**Notes:**
- TypeScript strict mode already enabled - not a migration task, just fixing bypasses
- All recommended libraries already installed or are stable versions
- Critical bug (projection field access) has clear fix with exact line numbers
- OAuth CSRF validation is a security compliance issue (RFC 9700 requirement)
