# 85-REVIEW-FIX.md — Code Review Fix Report

Phase: 85 — Waiver Page Advanced Stats Columns
Source: 85-REVIEW.md (17 findings: 3C + 8W + 6I)
Session: Two-session fix run (prior + current)

---

## Applied Fixes

### C1 — Auth middleware dev bypass
- File: `packages/backend/src/middleware/auth.ts`
- Fix: `authenticate` gates on `NODE_ENV !== "development"` — prod runs `jwtVerify()`, dev injects MOCK_USER
- Status: ✅ Applied. No TS errors.

### C2 — JWT_SECRET fail-fast
- File: `packages/backend/src/index.ts`
- Fix: Throws on startup if `JWT_SECRET` unset in non-dev. Cookie/JWT secrets use `??` operator. CORS Chrome extension validates `CHROME_EXTENSION_ID` env var.
- Status: ✅ Applied. No TS errors.

### C3 — INTERNAL_JOB_TOKEN enforcement
- File: `packages/backend/src/api/internal.ts`
- Fix: Module-level startup check throws if `NODE_ENV !== "development"` and `INTERNAL_JOB_TOKEN` unset.
- Status: ✅ Applied. No TS errors.

### W2 — Slack CSRF unsignCookie fix
- File: `packages/backend/src/api/slack.ts`
- Fix: Used `fastify.unsignCookie()` to validate CSRF cookie signature before string comparison.
- Status: ✅ Applied. No TS errors.

### W3 — teamIds NaN filter (5 instances)
- File: `packages/backend/src/api/timeseries.ts`
- Fix: All 5 `teamIds.split(",").map(parseInt)` occurrences now have `.filter(id => !isNaN(id))` and `if (ids.length > 0)` guard (prevents Kysely invalid `WHERE col IN ()` SQL).
- Status: ✅ Applied. No TS errors.

### W5 — Admin pagination upper bound
- File: `packages/backend/src/api/admin.ts`
- Fix: `page = Math.max(parseInt(...) || 1, 1)` and `limit = Math.min(Math.max(parseInt(...) || 50, 1), 100)`.
- Status: ✅ Applied. No TS errors.

### W7 — Draft-rankings staleness ordering
- File: `packages/backend/src/agents/draft-rankings.ts`
- Root cause: Alphabetical sort put "missing" before "stale" — incomplete projection runs ranked above older complete runs.
- Fix: Replaced `.orderBy("staleness", "asc")` with CASE expression: `fresh=0, stale=1, else=2`.
- Status: ✅ Applied. No TS errors.

### W8 — slack-approval-worker module-level process.exit
- File: `packages/backend/src/workers/slack-approval-worker.ts`
- Root cause: `if (!isSlackEnabled()) { process.exit(0); }` at module level killed any process that dynamically imported this module (including the main API server via `api/slack.ts`).
- Fix: Moved Slack disabled check, Worker creation, event listeners, and SIGTERM handler into exported `startWorker()` function. Kept `slackApprovalQueue` at module level (safe producer-only export). Added `isMain` check via `process.argv[1] === fileURLToPath(import.meta.url)` to auto-start only when run as entry point.
- Status: ✅ Applied. No TS errors.

### I3 — TopBar parseInt NaN guard
- File: `packages/frontend/src/components/shell/TopBar.tsx`
- Fix: `const parsed = parseInt(stored, 10); if (!isNaN(parsed)) setTeamId(parsed);` — prevents `setTeamId(NaN)` from corrupted localStorage.
- Status: ✅ Applied.

### I4 — free-agents route missing authenticate
- File: `packages/backend/src/api/recommendations.ts`
- Fix: Added `import { authenticate } from "../middleware/auth.js";` and `{ onRequest: [authenticate] }` to the `/api/leagues/:leagueId/free-agents` route.
- Status: ✅ Applied. No TS errors.

### Rate Stats Bug (out-of-band fix)
- File: `packages/backend/src/agents/standings-projection.ts`
- Root cause: `components_json` in `team_daily_category_totals` is always null → `currentComponents = {}`. When `projectedComponents` also empty (no FanGraphs projections matched), `calculateFinalRate` returns 0 silently (denominator AB=0 or IP=0).
- Fix: Added denominator check before rate stat calculation. When `projectedDenominator <= 0`, falls back to current ESPN value (`currentTotal?.value ?? 0`) and marks `isDegraded: true`.
- Status: ✅ Applied. No TS errors.

---

## Deferred / Pre-existing

| ID | Finding | Disposition |
|----|---------|-------------|
| W1 | JWT_SECRET rotation without restart | Partial — fail-fast applied (C2); hot-reload deferred |
| W4 | BullMQ job retry config missing | Deferred — no retry config on waiver/snapshot queues |
| W6 | ESPN cookie expiry not surfaced to UI | Deferred — UX improvement, not blocking |
| I1 | No rate limiting on recommendations routes | Deferred — requires Fastify rate-limit plugin setup |
| I2 | AdvancedStatsAdapter timeout | Pre-existing fix (20s timeout already present) — no change needed |
| I5 | Trade recommendations no auth | Deferred — affects other routes beyond scope of this phase |
| I6 | Draft endpoint stub returns 501 | By design — DraftAssistantAgent not implemented |

---

## TypeScript Validation

All modified files confirmed error-free via `get_errors`:
- `middleware/auth.ts` ✅
- `index.ts` ✅
- `api/internal.ts` ✅
- `api/slack.ts` ✅
- `api/timeseries.ts` ✅
- `api/admin.ts` ✅
- `agents/draft-rankings.ts` ✅
- `agents/standings-projection.ts` ✅
- `workers/slack-approval-worker.ts` ✅
- `api/recommendations.ts` ✅
