# Phase 1: Foundation & Critical Fixes - Research

**Researched:** 2026-02-19
**Domain:** Security, Data Integrity, API Reliability, Frontend Architecture
**Confidence:** HIGH

## Summary

Phase 1 addresses critical blockers preventing public launch across four domains: secure credential storage, reliable ESPN API integration, accurate projection mathematics, and production-ready frontend architecture. The research reveals that all required technologies are already in the codebase but need proper wiring and configuration.

The codebase has strong foundations: encryption utilities exist (but only used for Slack tokens), component-based rate stat formulas are implemented correctly, authentication middleware is present, and the frontend API client library exists but is unused. The gaps are primarily integration and configuration issues rather than missing capabilities.

**Primary recommendation:** Wire existing utilities into their intended use cases, add missing libraries for retry logic and rate limiting, and enforce authentication at the API layer. All fixes can be implemented with standard, well-documented libraries without custom cryptographic or mathematical implementations.

<phase_requirements>
## Phase Requirements

This phase MUST address the following requirements from ROADMAP.md:

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | ESPN auth cookies encrypted at rest in database | AES-256-GCM encryption pattern, existing encryption.ts utility |
| DATA-02 | PlayerIdentityResolution wired into projections ingest | Existing agent needs connection to ingest workflow |
| DATA-03 | Free agent pool fetched from ESPN and available for recommendations | ESPN API filter parameters documented, fetchFreeAgents method exists |
| DATA-04 | Rate stat component math works correctly in trade simulations | formulas.ts implements correct patterns, needs trade agent integration |
| DATA-05 | ESPN API calls retry with exponential backoff on failure | axios-retry library with exponential backoff configuration |
| DATA-06 | League transactions ingested from ESPN and stored in timeline | Schema exists, orchestrator needs transaction parsing |
| INFR-01 | All API routes enforce authentication and league ownership | @fastify/jwt + middleware patterns, requireLeagueAccess helper exists |
| INFR-02 | API has rate limiting to prevent abuse | @fastify/rate-limit plugin with Redis storage |
| INFR-03 | Snapshot orchestrator has job locking to prevent concurrent runs | BullMQ deduplication with job IDs and TTL |
| DASH-05 | Frontend uses shared component library (no duplicated UI) | Component composition patterns, extract from 4400+ LOC pages |
| DASH-06 | Frontend uses centralized API client (no hardcoded localhost) | lib/api.ts exists with env var support, needs page migration |

</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js crypto | Built-in | AES-256-GCM encryption/decryption | Native, audited, no dependencies; industry standard for authenticated encryption |
| @fastify/jwt | ^8.0.0 | JWT authentication for API routes | Official Fastify plugin, integrates with preHandler/onRequest hooks |
| @fastify/rate-limit | ^10.x | API rate limiting with Redis | Official Fastify plugin, low overhead, Redis-backed for distributed systems |
| axios-retry | ^4.x | HTTP retry with exponential backoff | Most popular retry library (3M+ weekly downloads), flexible configuration |
| BullMQ | ^5.1.5 | Background job queue with Redis | Already in codebase, built-in deduplication and job locking |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| retry-axios | ^3.x | Alternative axios retry interceptor | If axios-retry doesn't meet needs (less popular alternative) |
| ioredis | ^5.3.2 | Redis client for BullMQ/rate limiting | Already in codebase for BullMQ |
| bcryptjs | ^2.4.3 | Password hashing for user auth | Already in codebase for user authentication |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node.js crypto | pgcrypto (PostgreSQL) | Database-level encryption is transparent but requires decryption on every query; application-level gives more control |
| axios-retry | Custom retry logic | axios-retry handles edge cases (idempotent methods, status codes, jitter) that custom logic often misses |
| @fastify/rate-limit | express-rate-limit | Wrong framework; Fastify plugins are optimized for Fastify's lifecycle |

**Installation:**
```bash
# Add missing dependencies
pnpm add axios-retry @fastify/rate-limit --filter @espn-fantasy/backend
```

## Architecture Patterns

### Recommended Project Structure

Current structure is sound; additions needed:
```
packages/backend/src/
├── utils/
│   ├── encryption.ts         # ✅ EXISTS - extend for ESPN cookies
│   └── retry.ts              # ⚠️ ADD - axios retry configuration
├── middleware/
│   ├── auth.ts               # ✅ EXISTS - extend with league ownership
│   └── rate-limit.ts         # ⚠️ ADD - rate limit configuration
packages/frontend/src/
├── components/               # ⚠️ NEEDS EXPANSION - 1 component, need 10+
│   ├── ui/                   # Charts, tables, badges, cards
│   └── league/               # League-specific reusable components
├── lib/
│   └── api.ts                # ✅ EXISTS - pages need migration
```

### Pattern 1: ESPN Cookie Encryption (Application-Level)

**What:** Encrypt sensitive ESPN cookies (SWID, espn_s2) before storing in database using AES-256-GCM
**When to use:** Any time ESPN auth credentials are persisted to database
**Example:**
```typescript
// Source: Existing utils/encryption.ts + Node.js crypto docs
import { encryptToken, decryptToken } from '../utils/encryption.js';

// On league connect (packages/backend/src/api/leagues.ts)
const encryptedSwid = auth?.SWID ? encryptToken(auth.SWID) : null;
const encryptedS2 = auth?.espn_s2 ? encryptToken(auth.espn_s2) : null;

await db.updateTable('league')
  .set({
    espn_swid_encrypted: encryptedSwid,
    espn_s2_encrypted: encryptedS2,
  })
  .where('id', '=', leagueId)
  .execute();

// On snapshot orchestrator fetch
const league = await db.selectFrom('league')
  .select(['espn_swid_encrypted', 'espn_s2_encrypted'])
  .where('id', '=', leagueId)
  .executeTakeFirstOrThrow();

const auth = {
  SWID: league.espn_swid_encrypted ? decryptToken(league.espn_swid_encrypted) : undefined,
  espn_s2: league.espn_s2_encrypted ? decryptToken(league.espn_s2_encrypted) : undefined,
};
```

**Critical:** Environment variable `ESPN_ENCRYPTION_KEY` must be 64 hex characters (32 bytes). Generate with: `openssl rand -hex 32`

### Pattern 2: Axios Retry with Exponential Backoff

**What:** Wrap ESPN API calls with automatic retry logic using exponential backoff
**When to use:** All external ESPN API calls via axios instance
**Example:**
```typescript
// Source: https://www.zenrows.com/blog/axios-retry
// packages/backend/src/utils/retry.ts
import axios from 'axios';
import axiosRetry from 'axios-retry';

export function createRetryableAxios() {
  const instance = axios.create();

  axiosRetry(instance, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay, // 1s, 2s, 4s
    retryCondition: (error) => {
      // Retry on network errors and 5xx responses
      return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
             (error.response?.status >= 500 && error.response?.status < 600);
    },
    onRetry: (retryCount, error, requestConfig) => {
      logger?.warn(
        { retryCount, url: requestConfig.url, status: error.response?.status },
        'Retrying ESPN API call'
      );
    },
  });

  return instance;
}

// Usage in ESPNAdapter constructor
this.axios = createRetryableAxios();
```

### Pattern 3: Fastify Route Protection with League Ownership

**What:** Protect API routes with JWT auth + league ownership verification
**When to use:** Any route accessing league-specific data (projections, recommendations, snapshots)
**Example:**
```typescript
// Source: https://docs.logto.io/api-protection/nodejs/fastify
// packages/backend/src/api/recommendations.ts
app.get(
  "/api/leagues/:leagueId/teams/:teamId/waivers/recommendations",
  {
    onRequest: [app.authenticate], // JWT verification
    preHandler: async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);

      // Verify team belongs to league
      const team = await db.selectFrom('team')
        .select(['id', 'league_id', 'user_id'])
        .where('id', '=', teamId)
        .executeTakeFirst();

      if (!team) {
        return reply.code(404).send({ error: 'Team not found' });
      }

      if (team.league_id !== leagueId) {
        return reply.code(400).send({ error: 'Team does not belong to league' });
      }

      // Verify user owns team (or is admin)
      if (team.user_id !== request.user.userId && request.user.role !== 'admin') {
        return reply.code(403).send({ error: 'Not your team' });
      }
    },
  },
  async (request, reply) => {
    // Protected route logic
  }
);
```

### Pattern 4: BullMQ Job Deduplication for Snapshots

**What:** Prevent concurrent snapshot jobs for same league+date using BullMQ job IDs
**When to use:** Daily snapshot orchestrator jobs
**Example:**
```typescript
// Source: https://docs.bullmq.io/guide/jobs/deduplication
// packages/backend/src/workers/snapshot.ts
await snapshotQueue.add(
  'daily-snapshot',
  {
    leagueId,
    snapshotDate,
    espnAuth,
  },
  {
    jobId: `snapshot-${leagueId}-${snapshotDate}`, // Unique per league+date
    deduplication: {
      id: `snapshot-${leagueId}-${snapshotDate}`,
      ttl: 86400000, // 24 hours in ms
    },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s
    },
  }
);
```

### Pattern 5: Next.js Shared Component Extraction

**What:** Extract repeated UI patterns into reusable components
**When to use:** Any UI pattern used in 2+ pages (tables, stat cards, player lists)
**Example:**
```typescript
// Source: https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns
// packages/frontend/src/components/league/CategoryStatsTable.tsx
interface CategoryStat {
  categoryName: string;
  value: number;
  rank: number;
  points: number;
}

export function CategoryStatsTable({ stats }: { stats: CategoryStat[] }) {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rank</th>
          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Points</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {stats.map((stat) => (
          <tr key={stat.categoryName}>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{stat.categoryName}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{stat.value.toFixed(3)}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{stat.rank}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{stat.points.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Usage in pages replaces 30+ line table implementations
import { CategoryStatsTable } from '@/components/league/CategoryStatsTable';
<CategoryStatsTable stats={categoryData} />
```

### Pattern 6: Frontend API Client Migration

**What:** Replace hardcoded `http://localhost:3001` with centralized API client using env vars
**When to use:** All pages making API calls
**Example:**
```typescript
// Source: https://nextjs.org/docs/pages/guides/environment-variables
// .env.development
NEXT_PUBLIC_API_URL=http://localhost:3001

// .env.production
NEXT_PUBLIC_API_URL=https://api.yourapp.com

// packages/frontend/src/app/leagues/[id]/waivers/page.tsx
// BEFORE:
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const res = await fetch(`${apiUrl}/api/leagues/${leagueId}/teams/${teamId}/waivers/recommendations`);

// AFTER:
import { api } from '@/lib/api';
const data = await api.getWaiverRecommendations(leagueId, teamId, { snapshotDate, maxRecommendations: 10 });
```

### Anti-Patterns to Avoid

- **Storing encryption keys in code or database:** Keys must be environment variables or external key management (AWS KMS, HashiCorp Vault)
- **Encrypting at database level (pgcrypto) for ESPN cookies:** Application-level encryption gives more control over when decryption happens; database-level would decrypt on every query
- **Custom retry logic instead of axios-retry:** axios-retry handles idempotency, status codes, network errors, jitter - custom logic often misses edge cases
- **Global rate limiting instead of per-route:** Different endpoints have different abuse vectors; `/api/projections/upload` needs stricter limits than `/api/health`
- **Averaging rate stats (AVG, OBP, ERA) instead of component math:** `(AVG_current + AVG_projected) / 2` is mathematically incorrect; must combine components (H, AB) then calculate

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP retry with backoff | Custom setTimeout/retry loops | axios-retry | Handles idempotent methods, status codes, network errors, jitter, max retries, per-request config |
| JWT verification | Custom token parsing/validation | @fastify/jwt | Handles signature verification, expiration, claims, token refresh, cookie/header extraction |
| Rate limiting | Custom request counters in memory | @fastify/rate-limit | Distributed (Redis), handles sliding windows, per-IP/per-user, bypass for trusted IPs, 429/503 responses |
| Job deduplication | Custom Redis locks | BullMQ deduplication | Handles TTL, race conditions, lock renewal, cleanup, debounce mode, job IDs |
| AES-256-GCM encryption | Custom crypto wrapper | Node.js crypto.createCipheriv | Audited, handles IV generation, auth tag extraction/verification, prevents timing attacks |

**Key insight:** Security and reliability primitives (encryption, retry, rate limiting, distributed locks) have subtle edge cases that take years to discover. Use battle-tested libraries maintained by security/performance experts.

## Common Pitfalls

### Pitfall 1: Hardcoding Encryption Keys or Storing in Database

**What goes wrong:** Encryption keys stored in code or database leak when code is public or database is compromised, defeating encryption purpose
**Why it happens:** Convenience; easier to hardcode than set up env vars or key management
**How to avoid:**
- Store keys ONLY in environment variables (development: `.env.local`, production: platform secrets)
- Use separate keys per environment (dev key != prod key)
- For production, use external key management (AWS KMS, HashiCorp Vault, GCP Secret Manager)
- Validate key presence and format at startup (64 hex chars for AES-256)
**Warning signs:**
- Code contains strings like `const ENCRYPTION_KEY = "abc123..."`
- Database migration creates `encryption_keys` table
- `.env` file is committed to git

### Pitfall 2: Encrypting ESPN Cookies but Not Slack Tokens (or Vice Versa)

**What goes wrong:** Inconsistent security posture; one credential type protected, another exposed
**Why it happens:** Incremental development; Slack integration added encryption, ESPN integration missed it
**How to avoid:**
- Use SAME encryption utility (`utils/encryption.ts`) for ALL credentials
- Standardize on `_encrypted` suffix for encrypted columns (`espn_swid_encrypted`, `bot_token_encrypted`)
- Add database constraint checks in migration: encrypted columns must be `BYTEA`, plaintext columns removed
**Warning signs:**
- Schema has both `espn_s2` (text) and `bot_token_encrypted` (bytea)
- Some adapters call `encryptToken()`, others store plaintext
- Different env vars for different credentials (`SLACK_ENCRYPTION_KEY` but no `ESPN_ENCRYPTION_KEY`)

### Pitfall 3: Retrying Non-Idempotent ESPN API Calls

**What goes wrong:** Retry POST requests that create resources (e.g., hypothetical "execute trade" endpoint) causes duplicate actions
**Why it happens:** axios-retry defaults retry all failed requests; ESPN API is undocumented so idempotency unclear
**How to avoid:**
- Configure `retryCondition` to retry ONLY GET requests and 5xx errors: `retryCondition: (error) => error.config.method === 'GET' && error.response?.status >= 500`
- For v1 (read-only), all ESPN calls are GET, so safe to retry all
- If ESPN write actions added in future, explicitly mark as `axios-retry: { retries: 0 }` in request config
**Warning signs:**
- Logs show "Retrying ESPN API call" for POST/PUT/DELETE
- ESPN activity feed shows duplicate transactions after network blips
- Test retries show side effects (player added twice)

### Pitfall 4: Rate Limiting by IP When Behind Proxy (Railway/Vercel)

**What goes wrong:** All requests appear to come from same IP (load balancer), rate limit hits after 100 total requests instead of 100 per user
**Why it happens:** Default @fastify/rate-limit uses `request.ip`, which is proxy IP when behind load balancer
**How to avoid:**
- Configure Fastify to trust proxy headers: `trustProxy: true` in Fastify options
- Configure rate-limit to use `X-Forwarded-For`: `keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip`
- For authenticated routes, use user ID instead of IP: `keyGenerator: (req) => req.user?.userId || req.ip`
**Warning signs:**
- Local development works, Railway deployment blocks all requests after 100
- Different users hit rate limit simultaneously
- Logs show same IP for all requests

### Pitfall 5: BullMQ Job Deduplication with Wrong TTL

**What goes wrong:** TTL too short (< job duration) allows duplicate jobs; TTL too long prevents legitimate retries
**Why it happens:** Misunderstanding TTL semantics; TTL is "how long to prevent duplicates" not "how long job runs"
**How to avoid:**
- Set TTL = expected max job duration + buffer: `ttl: 86400000` (24h) for daily snapshot
- Use job ID = natural unique key: `snapshot-${leagueId}-${snapshotDate}` prevents same date twice
- For debounce (latest job wins), use `extend: true, replace: true` to reset TTL on duplicate add
**Warning signs:**
- Jobs complete in 30s but TTL is 5s; duplicates still occur
- TTL is 7 days; manual snapshot trigger says "already exists" for stale job
- Deduplication ID includes timestamp; every add creates new job

### Pitfall 6: Frontend Hardcoded API URLs Persist After Migration

**What goes wrong:** Some pages migrated to `lib/api.ts`, others still have `http://localhost:3001`; production breaks inconsistently
**Why it happens:** Large codebase, partial migration, no enforcement
**How to avoid:**
- Grep for all occurrences: `grep -r "localhost:3001" packages/frontend/src/app` before closing PR
- Add ESLint rule to ban hardcoded URLs: `no-restricted-syntax` for string literals matching URL patterns
- Make `lib/api.ts` the ONLY place that reads `NEXT_PUBLIC_API_URL`
**Warning signs:**
- Some features work in production, others fail with CORS errors
- Grep shows `packages/frontend/src/app/leagues/[id]/trends/page.tsx:79:  const apiUrl = "http://localhost:3001";`
- Network tab shows mix of `localhost:3001` and `api.yourapp.com`

### Pitfall 7: Component Math Errors in Trade Simulation

**What goes wrong:** Trade simulation calculates projected AVG as `(team_AVG + player1_AVG - player2_AVG)` instead of recomputing from components
**Why it happens:** Averaging rates seems intuitive but is mathematically wrong
**How to avoid:**
- ALWAYS use component addition/subtraction, THEN calculate rate from totals
- Correct: `new_AVG = (team_H + player1_H - player2_H) / (team_AB + player1_AB - player2_AB)`
- Use `combineComponents()` and `calculateFinalRate()` from `packages/shared/src/formulas.ts`
**Warning signs:**
- Trade impact shows 0.300 AVG team trading .250 player for .350 player results in 0.400 AVG (impossible)
- Test: team with 100 AB, 30 H (0.300 AVG) adds player with 10 AB, 5 H (0.500 AVG) should be 110 AB, 35 H (0.318 AVG), not 0.400

## Code Examples

Verified patterns from official sources:

### ESPN Free Agent Fetch with Proper Filters

```typescript
// Source: https://github.com/cwendt94/espn-api/blob/master/espn_api/baseball/league.py
// packages/backend/src/adapters/espn.ts (enhance existing fetchFreeAgents)
async fetchFreeAgents(options: {
  leagueId: number;
  season: number;
  auth?: ESPNAuthCookies;
  limit?: number;
  positions?: string[]; // ["C", "1B", "OF", "SP", "RP"]
}): Promise<ESPNFreeAgent[]> {
  const { leagueId, season, auth, limit = 300, positions } = options;

  const filterSlotIds = positions?.length > 0
    ? positions.map(pos => ESPN_POSITION_TO_SLOT[pos]).filter(Boolean)
    : [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,23,24]; // All slots

  const xFantasyFilter = {
    filterStatus: {
      value: ["FREEAGENT", "WAIVERS"],
    },
    filterSlotIds: {
      value: filterSlotIds,
    },
    sortPercOwned: {
      sortPriority: 1,
      sortAsc: false,
    },
    limit,
  };

  const response = await this.axios.get(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/${season}/segments/0/leagues/${leagueId}`,
    {
      params: {
        view: "kona_player_info",
        "x-fantasy-filter": JSON.stringify(xFantasyFilter),
      },
      headers: this.buildHeaders(auth),
    }
  );

  return this.parseFreeAgentsFromPlayers(response.data);
}
```

### Fastify Global Rate Limiting with Redis

```typescript
// Source: https://github.com/fastify/fastify-rate-limit
// packages/backend/src/index.ts
import rateLimit from '@fastify/rate-limit';

await server.register(rateLimit, {
  global: false, // Apply per-route, not globally
  redis: server.redis, // Use existing Redis connection
  nameSpace: 'espn-agent-rl:', // Key prefix in Redis
  continueExceeding: true, // Keep counting even after limit
  skipOnError: false, // Don't skip rate limiting if Redis fails
});

// Per-route configuration
app.get('/api/leagues/:id/status', {
  config: {
    rateLimit: {
      max: 100, // 100 requests
      timeWindow: '1 minute',
      keyGenerator: (req) => req.user?.userId || req.ip,
    },
  },
}, async (req, reply) => { /* ... */ });

// Stricter for expensive operations
app.post('/api/projections/upload', {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 hour',
      keyGenerator: (req) => req.user?.userId || req.ip,
    },
  },
}, async (req, reply) => { /* ... */ });
```

### Trade Simulation with Component Math

```typescript
// Source: packages/shared/src/formulas.ts + CLAUDE.md component math section
// packages/backend/src/agents/trade-recommendation.ts
import { combineComponents, calculateFinalRate } from '@espn-fantasy/shared';

async simulateTradeImpact(
  teamComponents: StatComponents, // Current team totals with components
  playersOut: Array<{ components: StatComponents }>,
  playersIn: Array<{ components: StatComponents }>,
  categories: ESPNScoringCategory[],
): Promise<Record<string, number>> {
  // 1. Combine current team components
  let projectedComponents = { ...teamComponents };

  // 2. Subtract players going out
  for (const player of playersOut) {
    for (const [key, value] of Object.entries(player.components)) {
      projectedComponents[key] = (projectedComponents[key] || 0) - value;
    }
  }

  // 3. Add players coming in
  for (const player of playersIn) {
    for (const [key, value] of Object.entries(player.components)) {
      projectedComponents[key] = (projectedComponents[key] || 0) + value;
    }
  }

  // 4. Calculate final rates from combined components
  const projectedCategoryValues: Record<string, number> = {};
  for (const category of categories) {
    if (category.type === 'RATE' && category.formulaId) {
      // Use formula to compute rate from components
      projectedCategoryValues[category.statKey] = calculateFinalRate(
        category.formulaId,
        projectedComponents,
        {} // No additional projected components
      );
    } else if (category.type === 'COUNTING') {
      // Counting stat is direct component value
      projectedCategoryValues[category.statKey] = projectedComponents[category.statKey] || 0;
    }
  }

  return projectedCategoryValues;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| fastify-rate-limit@5.x | @fastify/rate-limit@10.x | 2024 | Package renamed to @fastify scope; v10 adds Redis storage, per-route config |
| Manual JWT verification | @fastify/jwt with decorators | 2023 | Built-in token refresh, cookie support, multiple verification strategies |
| axios interceptors for retry | axios-retry plugin | Ongoing | Declarative config vs imperative logic; handles idempotency, jitter automatically |
| BullMQ job locks with Redis SET NX | BullMQ deduplication API | 2023 (v4) | Built-in TTL, debounce, job ID deduplication; no manual lock management |
| pgcrypto for encryption | Application-level AES-GCM | Ongoing | More control over when decryption happens; no query performance penalty |

**Deprecated/outdated:**
- `fastify-jwt` (unscoped): Use `@fastify/jwt` instead
- `retry-axios` over axios-retry: axios-retry has 10x more downloads, better maintained
- Storing plaintext credentials in database: Violates security best practices, fails compliance audits

## Open Questions

1. **Key Rotation Strategy**
   - What we know: Encryption works with single key in env var
   - What's unclear: How to rotate keys without losing access to existing encrypted data
   - Recommendation: v1 can use single key; v2 add key versioning (store key_version with encrypted data, support multiple active keys)

2. **Rate Limiting Thresholds**
   - What we know: @fastify/rate-limit supports per-route limits
   - What's unclear: What limits are appropriate for each endpoint (no usage data yet)
   - Recommendation: Start conservative (100 req/min for reads, 10 req/hour for writes), adjust based on monitoring

3. **Free Agent Data Staleness**
   - What we know: ESPN API returns free agents with % owned
   - What's unclear: How frequently ESPN updates % owned (daily? hourly?); should we cache?
   - Recommendation: Fetch fresh on every waiver recommendations request; add caching in v2 if performance issue

4. **Transaction Ingestion Backfill**
   - What we know: Schema supports transactions, orchestrator can parse activity feed
   - What's unclear: Should initial league connection backfill all historical transactions or just start from connect date?
   - Recommendation: v1 start from connect date (no backfill); reduces initial sync time, simplifies error handling

## Sources

### Primary (HIGH confidence)
- [Node.js Crypto API - AES-256-GCM Example](https://gist.github.com/rjz/15baffeab434b8125ca4d783f4116d81) - Encryption pattern verification
- [Fastify JWT Plugin Official Docs](https://github.com/fastify/fastify-jwt) - Authentication implementation
- [Fastify Rate Limit Plugin](https://github.com/fastify/fastify-rate-limit) - Rate limiting configuration
- [axios-retry NPM Package](https://www.npmjs.com/package/axios-retry) - Retry logic implementation
- [BullMQ Deduplication Docs](https://docs.bullmq.io/guide/jobs/deduplication) - Job locking patterns
- [Next.js Environment Variables Guide](https://nextjs.org/docs/pages/guides/environment-variables) - Frontend configuration
- [PostgreSQL Encryption Options](https://www.postgresql.org/docs/current/encryption-options.html) - Database security patterns
- [ESPN API Community Documentation](https://github.com/cwendt94/espn-api/blob/master/espn_api/baseball/league.py) - Free agent filters

### Secondary (MEDIUM confidence)
- [Axios Retry Best Practices 2026](https://www.zenrows.com/blog/axios-retry) - Exponential backoff configuration
- [Fastify JWT Route Protection Patterns](https://docs.logto.io/api-protection/nodejs/fastify) - Authentication middleware
- [Next.js Composition Patterns](https://nextjs.org/docs/14/app/building-your-application/rendering/composition-patterns) - Component architecture
- [PostgreSQL Field-Level Encryption Best Practices](https://www.crunchydata.com/blog/data-encryption-in-postgres-a-guidebook) - Encryption strategy

### Tertiary (LOW confidence)
- None - All findings verified with official documentation or established community sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are official Fastify plugins or widely-adopted (3M+ downloads/week)
- Architecture: HIGH - Patterns verified against official docs and existing codebase structure
- Pitfalls: MEDIUM-HIGH - Based on common issues in similar projects and library documentation warnings

**Research date:** 2026-02-19
**Valid until:** ~30 days (2026-03-21) - Stack is stable; rate limiting and JWT patterns unlikely to change significantly
