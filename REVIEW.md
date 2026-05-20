---
phase: espn-agent-full-codebase
reviewed: 2025-07-24T00:00:00Z
depth: deep
files_reviewed: 42
files_reviewed_list:
  - packages/backend/src/middleware/auth.ts
  - packages/backend/src/db/connection.ts
  - packages/backend/src/db/schema.ts
  - packages/backend/src/db/snapshot-repository.ts
  - packages/backend/src/api/auth.ts
  - packages/backend/src/api/auth-oauth.ts
  - packages/backend/src/api/leagues.ts
  - packages/backend/src/api/recommendations.ts
  - packages/backend/src/api/projections.ts
  - packages/backend/src/api/timeseries.ts
  - packages/backend/src/api/simulation.ts
  - packages/backend/src/api/admin.ts
  - packages/backend/src/api/faab.ts
  - packages/backend/src/api/trends.ts
  - packages/backend/src/api/internal.ts
  - packages/backend/src/agents/snapshot-orchestrator.ts
  - packages/backend/src/agents/standings-projection.ts
  - packages/backend/src/agents/waiver-recommendation.ts
  - packages/backend/src/agents/trade-recommendation.ts
  - packages/backend/src/agents/projections-ingest.ts
  - packages/backend/src/agents/player-identity.ts
  - packages/backend/src/agents/season-simulation.ts
  - packages/backend/src/agents/scenario-evaluation.ts
  - packages/backend/src/agents/roster-simulator.ts
  - packages/backend/src/agents/faab-tracker.ts
  - packages/backend/src/adapters/espn.ts
  - packages/backend/src/adapters/espn/http-client.ts
  - packages/backend/src/simulation/monte-carlo.ts
  - packages/backend/src/simulation/daily-simulator.ts
  - packages/backend/src/simulation/state-builder.ts
  - packages/backend/src/simulation/prng.ts
  - packages/backend/src/projection/allocator.ts
  - packages/backend/src/projection/staleness.ts
  - packages/backend/src/utils/auth-cookies.ts
  - packages/backend/src/utils/encryption.ts
  - packages/backend/src/utils/espn-env.ts
  - packages/backend/src/utils/retry.ts
  - packages/backend/src/utils/validation.ts
  - packages/backend/src/container.ts
  - packages/backend/src/index.ts
  - packages/backend/src/workers/snapshot-worker.ts
  - packages/frontend/src/components/ProtectedRoute.tsx
  - packages/frontend/src/lib/api.ts
  - packages/scraper/src/routes/scrape.ts
  - packages/scraper/src/index.ts
  - packages/shared/src/formulas.ts
findings:
  critical: 6
  warning: 8
  info: 4
  total: 18
status: issues_found
---

# ESPN Fantasy Baseball Assistant: Code Review

**Reviewed:** 2025-07-24
**Depth:** deep (cross-file analysis, import graph, call chains)
**Files Reviewed:** 46
**Status:** issues_found

## Summary

Backend is architecturally sound with good patterns: parameterized queries via Kysely, AES-256-GCM for credential storage, bcrypt for passwords, seeded PRNG for deterministic simulation, and circuit breaker on ESPN API calls. Primary risk is authorization — `recommendations.ts` is the largest route file and most of its endpoints lack `authenticate` middleware. This is latent in single-user mode (SINGLE_USER_MODE bypasses all auth) but becomes an IDOR vulnerability the moment multi-user mode is activated. Admin routes have the inverse problem: `requireAdmin` is registered without `authenticate`, so JWT is never verified and legitimate admins are locked out in production. Two additional security issues: SWID logging and non-timing-safe token comparison.

---

## Critical Issues

### CR-01: Mass missing authentication on recommendations routes

**File:** `packages/backend/src/api/recommendations.ts:134`

**Issue:** Only the `/api/leagues/:leagueId/free-agents` route (line 81) has `onRequest: [authenticate]`. All subsequent routes — including `/roster`, `/waivers/evaluate`, `/waivers/recommendations`, `/trades/validate`, `/trades/impact`, `/trades/recommendations`, `/trades/partners`, and `/trades/partners/:partnerTeamId/rosters` — register with bare `async (request, reply)` handlers and no authentication. In multi-user mode, any caller can read any league's roster, waiver projections, and trade data by iterating IDs.

**Fix:**

```ts
app.get(
  "/api/leagues/:leagueId/teams/:teamId/roster",
  {
    onRequest: [authenticate],
    preHandler: [requireLeagueAccess],
  },
  async (request, reply) => { ... }
);
// Repeat for all remaining routes in this file.
```

---

### CR-02: Admin routes verify role without ever verifying JWT

**File:** `packages/backend/src/api/admin.ts:22`

**Issue:** Every admin route uses `onRequest: [requireAdmin]` without `authenticate`. In multi-user production mode, `jwtVerify()` is never called, so `request.user` is always `undefined`. `requireAdmin` correctly returns 403 for unknown users, meaning all admin routes are permanently inaccessible to legitimate admins. The admin panel cannot function when `SINGLE_USER_MODE` is removed.

**Fix:**

```ts
app.get(
  "/api/admin/users",
  {
    onRequest: [authenticate, requireAdmin],  // authenticate FIRST
    ...
  },
```

---

### CR-03: `INTERNAL_JOB_TOKEN` comparison is not timing-safe

**File:** `packages/backend/src/api/internal.ts:33`

**Issue:** `authHeader !== \`Bearer ${INTERNAL_JOB_TOKEN}\`` is a JavaScript string equality check. V8 short-circuits on the first differing byte, leaking information through network timing. An attacker with sub-millisecond timing resolution can brute-force the token byte by byte.

**Fix:**

```ts
import crypto from "crypto";

const provided = Buffer.from(authHeader ?? "");
const expected = Buffer.from(`Bearer ${INTERNAL_JOB_TOKEN}`);
if (
  provided.length !== expected.length ||
  !crypto.timingSafeEqual(provided, expected)
) {
  return reply.code(401).send({ error: "Unauthorized" });
}
```

---

### CR-04: SWID cookie value logged in plaintext

**File:** `packages/backend/src/api/leagues.ts:170`

**Issue:** `request.log.warn({ swid: auth.SWID }, "Could not auto-detect user's team from SWID")` writes the raw SWID value to the application log. SWID is an ESPN session identifier equivalent to a session cookie — leaking it in logs allows session hijacking.

**Fix:**

```ts
request.log.warn(
  { swidPresent: true },
  "Could not auto-detect user's team from SWID",
);
```

---

### CR-05: Empty CSV crashes projections ingest with unchecked `rows[0]`

**File:** `packages/backend/src/agents/projections-ingest.ts:344` (approximately)

**Issue:** In `ingestBatters` and `ingestPitchers`, the code evaluates `!(col in rows[0])` and `"H" in rows[0]` immediately after parsing. If the uploaded CSV has no data rows (only headers, or is completely empty), `rows` is `[]`, `rows[0]` is `undefined`, and the `in` operator throws `TypeError: Cannot use 'in' operator to search for '...' in undefined`. This crashes the request with a 500 rather than a validation error.

**Fix:**

```ts
if (rows.length === 0) {
  return {
    requiredColumnsPresent: false,
    missingColumns: ["(no data rows)"],
    rowsParsed: 0,
    unmatchedPlayers: [],
    mappingCoverage: 0,
    matchStats: { exactMatches: 0, fuzzyMatches: 0, unmatched: 0, total: 0 },
  };
}
const missing = required.filter((col) => !(col in rows[0]));
```

---

### CR-06: Waiver evaluate body bypasses schema validation

**File:** `packages/backend/src/api/recommendations.ts:330`

**Issue:** `WaiverEvaluationSchema` is defined in `validation.ts` (`addPlayerId: z.number().int().positive()`), exported, but never applied in the `/waivers/evaluate` route handler. The body is destructured directly. A caller can send `addPlayerId: -1` or `addPlayerId: "../../etc"` (which coerces to NaN). These propagate as NaN IDs into Kysely `WHERE player_id = NaN` queries, which PostgreSQL evaluates as `WHERE player_id = NULL` (matches nothing), producing silent incorrect results.

**Fix:**

```ts
async (request, reply) => {
  const validation = WaiverEvaluationSchema.safeParse(request.body);
  if (!validation.success) {
    return reply.code(400).send({ error: "Validation failed", details: validation.error.errors });
  }
  const { addPlayerId, dropPlayerId, snapshotDate, projectionsRunId } = validation.data;
  // ... rest of handler unchanged
```

---

## Warnings

### WR-01: Unbounded `limit` parameter on timeseries queries

**File:** `packages/backend/src/api/timeseries.ts:100` (pattern repeated ~8×)

**Issue:** `const queryLimit = limit ? parseInt(limit, 10) : 1000;` has no upper bound. A caller can pass `?limit=10000000` and trigger a multi-million-row result set, exhausting Node.js memory and saturating the DB connection.

**Fix:**

```ts
const queryLimit = Math.min(limit ? parseInt(limit, 10) : 1000, 5000);
```

---

### WR-02: N+1 query pattern in `FaabTrackerAgent.getBidHistory`

**File:** `packages/backend/src/agents/faab-tracker.ts:117`

**Issue:** The loop `for (const txn of transactions) { const player = await this.db.selectFrom("player").where("id", "=", playerId)... }` issues one `SELECT` per transaction row. For a team with 30+ transactions this causes 30+ sequential round-trips.

**Fix:** Collect all player IDs first, batch-fetch, then look up in a Map:

```ts
const playerIds = transactions
  .map((t) => (t.players_added as number[])?.[0])
  .filter((id): id is number => id != null);

const players =
  playerIds.length > 0
    ? await this.db
        .selectFrom("player")
        .select(["id", "name"])
        .where("id", "in", playerIds)
        .execute()
    : [];
const playerNameMap = new Map(players.map((p) => [p.id, p.name]));

for (const txn of transactions) {
  const playerName = playerNameMap.get(playerId) ?? "Unknown";
  // ...
}
```

---

### WR-03: Hardcoded season end date in staleness proration

**File:** `packages/backend/src/projection/staleness.ts:12`

**Issue:** `computeProrateFactor` defaults `seasonEndDate` to `"2026-09-28"`. After September 2026, all projections will prorate to 0 (or negative), silently making all projected standings zero. This will break undetected until someone investigates degraded standings data.

**Fix:** Source the season end date from league settings (`acquisition_rules.season_end_date`) or a per-season config constant, not a hardcoded string literal.

---

### WR-04: Scraper service has no authentication

**File:** `packages/scraper/src/routes/scrape.ts:8`

**Issue:** `POST /scrape/pitcherlist`, `/scrape/rotoballer`, `/scrape/fangraphs`, and `/scrape/all` are registered with no authentication middleware. Anyone who can reach the scraper's port can trigger Playwright browser launches and external HTTP scraping operations at will, both consuming server resources and potentially triggering rate-limiting on external sites.

**Fix:** Add a shared secret check (e.g. matching `INTERNAL_JOB_TOKEN`) to all scrape mutation endpoints, or restrict the scraper to localhost-only binding.

---

### WR-05: Refresh token verification is O(n × bcrypt_cost)

**File:** `packages/backend/src/api/auth.ts:145`

**Issue:** The refresh endpoint fetches all non-expired tokens for a user and calls `bcrypt.compare()` (cost=10, ~100ms) for each stored token. A user with many active sessions (or a DB with many stale tokens that weren't cleaned up) causes O(n × 100ms) response times. An attacker who knows a valid `userId` can trigger repeated refresh calls to saturate CPU.

**Fix:** Store a secure truncated hash prefix (e.g. SHA-256 of the raw token, first 32 bytes) in a separate indexed column to filter candidates before bcrypt, reducing the comparison set to 0–1 rows in practice.

---

### WR-06: `prng.ts` `normal()` generates correlated pairs

**File:** `packages/backend/src/simulation/prng.ts:45`

**Issue:** Standard Box-Muller produces two _independent_ normals from one pair `(u1, u2)`:

- z0 = sqrt(-2·ln(u1))·cos(2π·u2)
- z1 = sqrt(-2·ln(u1))·sin(2π·u2)

The implementation calls `boxMuller(u2, u1)` for z1, which uses a _new_ `sqrt(-2·ln(u2))` term. This means z0 and z1 are computed from different amplitude terms and are no longer independent — they share `u2` in one and `u1` in the other, introducing negative correlation. For a fantasy baseball simulation this has minor effect, but the PRNG does not match its documented contract.

**Fix:**

```ts
// In boxMuller, return both z0 and z1 from the same pair
function boxMullerPair(u1: number, u2: number): [number, number] {
  const r = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10)));
  const theta = 2 * Math.PI * u2;
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

// In normal():
const [z0, z1] = boxMullerPair(raw(), raw());
spareNormal = z1;
return z0;
```

---

### WR-07: OAuth placeholder email breaks account-linking

**File:** `packages/backend/src/api/auth-oauth.ts:54`

**Issue:** When Google/GitHub do not provide an email (possible with restrictive OAuth scopes), the code stores `google_${profile.id}@oauth.local`. Later "link accounts by email" logic performs `WHERE email = normalizedEmail`. This placeholder never matches a real user, silently creating a duplicate orphan account instead of linking to an existing user.

**Fix:** If no email is available, skip the email-linking check entirely and always create a new OAuth-only user, then document that email-less OAuth accounts cannot link to password accounts:

```ts
const email = profile.emails?.[0]?.value;
// Only attempt email linking when a real email is present
if (email) {
  user = await db
    .selectFrom("users")
    .where("email", "=", email)
    .executeTakeFirst();
  // ... link logic
}
if (!user) {
  user = await db
    .insertInto("users")
    .values({
      email: email ?? null, // store null rather than a fake address
      google_id: profile.id,
      // ...
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
```

---

### WR-08: Roster query block copy-pasted three times in recommendations.ts

**File:** `packages/backend/src/api/recommendations.ts:200`

**Issue:** The ~100-line block that loads roster, fetches `player_period_stats` for tenure, fetches season stats, calls `advancedStatsAdapter`, and builds `enrichedRoster` appears verbatim at lines ~200, ~500, and ~700 within the same file. Any bug fix (e.g., CR-06, the empty-playerIds IN guard) must be applied in all three locations; any missed copy causes diverging behavior.

**Fix:** Extract to a shared `buildEnrichedRoster(db, repo, advancedStatsAdapter, leagueId, teamId, date)` function called from all three handlers.

---

## Info

### IN-01: `leagueId`/`teamId` not validated for NaN in several recommendation routes

**File:** `packages/backend/src/api/recommendations.ts:136`

**Issue:** The roster, waiver, and trade routes use `parseInt(request.params.leagueId, 10)` without checking `isNaN`. If a caller sends `/api/leagues/abc/teams/1/roster`, `leagueId` is `NaN` and Kysely generates `WHERE league_id = NaN`, which evaluates to `WHERE league_id IS NULL` (returns nothing but doesn't error). `parseIntParam` from `validation.ts` exists for exactly this purpose and is used consistently in `timeseries.ts`.

**Fix:** Replace `parseInt(request.params.leagueId, 10)` with `parseIntParam(request.params.leagueId, "leagueId")` in all affected routes.

---

### IN-02: Non-null assertion in Monte Carlo `executeRun` can throw at runtime

**File:** `packages/backend/src/simulation/monte-carlo.ts:75`

**Issue:** `const teamInput = state.teams.find((t) => t.teamId === stream.teamId)!` — if `streams` ever contains a `teamId` not present in `state.teams` (possible if `buildSimulationState` and `buildAllOpportunityStreams` diverge), this produces `undefined!` and the next property access throws `TypeError: Cannot read properties of undefined`. The error message gives no indication which teamId was missing.

**Fix:**

```ts
const teamInput = state.teams.find((t) => t.teamId === stream.teamId);
if (!teamInput)
  throw new Error(`SimulationState missing team ${stream.teamId}`);
```

---

### IN-03: `.bak` files committed to source control

**File:** `packages/backend/src/agents/player-identity.ts.bak`, `packages/backend/src/agents/projections-ingest.ts.bak`, `packages/backend/src/agents/waiver-recommendation.ts.bak`

**Issue:** Three `.bak` files are present in the agents directory. These contain old code that may confuse editors, static analysis tools, or developers who accidentally import them. They should be removed from the repository.

**Fix:** `git rm packages/backend/src/agents/*.bak`

---

### IN-04: `cookieSecret` falls back to `JWT_SECRET`, reducing security isolation

**File:** `packages/backend/src/index.ts:95`

**Issue:** `const cookieSecret = process.env.COOKIE_SECRET ?? process.env.JWT_SECRET ?? "development-secret"` means cookie signing and JWT signing use the same secret when `COOKIE_SECRET` is not set. Compromise of the JWT_SECRET value also compromises cookie integrity, and vice versa.

**Fix:** Require `COOKIE_SECRET` as a separate environment variable (distinct from `JWT_SECRET`), add a startup check analogous to the existing JWT_SECRET check, and update deployment documentation.

---

_Reviewed: 2025-07-24_
_Reviewer: GitHub Copilot (gsd-code-reviewer)_
_Depth: deep_
