---
phase: 76-api-hardening
plan: "02"
subsystem: backend/adapters
tags: [api-hardening, validation, espn-adapter, type-guards]
dependency_graph:
  requires: ["76-01"]
  provides: ["espn-adapter-hardened"]
  affects: ["espn.ts", "CLAUDE.md"]
tech_stack:
  added: []
  patterns: ["assertEspnCriticalShape before normalization", "logUnexpectedFields for drift detection", "validateEspnResponse with Zod schemas"]
key_files:
  created: []
  modified:
    - packages/backend/src/adapters/espn.ts
    - CLAUDE.md
decisions:
  - "assertEspnCriticalShape called in both fetchLeague and fetchHistoricalWeek — hard fail on missing teams array before normalization runs"
  - "logUnexpectedFields only in fetchLeague (live path) — drift detection without blocking historical backfill"
  - "fetchGlobalDraftData batch loop casts entry as any[] since ESPNFreeAgentsResponseSchema passthrough types don't include draftRanksByRankType"
metrics:
  duration: "6 min"
  completed_date: "2026-03-26"
  tasks_completed: 2
  files_modified: 2
---

# Phase 76 Plan 02: ESPN Adapter Hardening — Wire Validation Summary

Wire the validation functions built in Plan 01 into all ESPN adapter fetch methods: assertEspnCriticalShape before normalization, Zod-validated fetchGlobalDraftData, drift logging, duplicate 429 handler removed.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Wire assertions and validation into ESPN adapter fetch methods | c180544 | packages/backend/src/adapters/espn.ts |
| 2 | Remove stale Known Issue #8 from CLAUDE.md | d9eb828 | CLAUDE.md |

## What Was Built

### Task 1: ESPN Adapter Hardening

Updated `packages/backend/src/adapters/espn.ts` to:

1. **Import `assertEspnCriticalShape` and `logUnexpectedFields`** from `../utils/espn-schemas.js` (alongside existing imports).

2. **`fetchLeague`**: After `validateEspnResponse`, added `assertEspnCriticalShape` (throws if `teams` array missing) and `logUnexpectedFields` with the 10 known top-level ESPN response fields. Malformed responses now fail fast before `normalizeLeagueData` runs.

3. **`fetchHistoricalWeek`**: Added `assertEspnCriticalShape` after `validateEspnResponse`. Removed the inner `try/catch` that caught 429 and re-threw — `createRetryableAxios` (via `axios-retry`) already handles 429 with Retry-After backoff, making the inner handler redundant and misleading.

4. **`fetchGlobalDraftData`**: Replaced `const data = response.data as any` with `validateEspnResponse(ESPNFreeAgentsResponseSchema, response.data, ...)`. The batch loop casts to `any[]` since `draftRanksByRankType` and `stats` are passthrough fields not in the Zod type signature.

5. **`getFinalScoringPeriod`**: Replaced optional-chaining + cast with explicit `typeof data === "object" && data !== null && typeof (data as any).currentScoringPeriod?.id === "number"` guard.

### Task 2: CLAUDE.md Cleanup

Removed Known Issue #8 ("No retry/backoff on ESPN API calls") — this was fixed in `packages/backend/src/utils/retry.ts` which implements exponential backoff with axios-retry and a circuit breaker. Renumbered items 9-13 to 8-12.

## Verification Results

- `grep -c "assertEspnCriticalShape" espn.ts` → **3** (import + fetchLeague + fetchHistoricalWeek)
- `grep -c "logUnexpectedFields" espn.ts` → **2** (import + fetchLeague)
- `! grep -q "ESPN rate limit hit - backing off" espn.ts` → **PASS** (duplicate 429 handler removed)
- `! grep -q "No retry/backoff" CLAUDE.md` → **PASS**
- `cd packages/backend && pnpm test --run` → 87 passed, 7 pre-existing failures in espn.test.ts (DEBT-09 cache/retry tests — unrelated to this plan, confirmed pre-existing before changes)

## Deviations from Plan

### Auto-fixed Issues

None.

**1. [Rule 2 - Missing] Cast batch loop to `any[]` after Zod validation**
- **Found during:** Task 1
- **Issue:** `ESPNFreeAgentsResponseSchema` typed players with only `fullName`, `proTeamId`, `eligibleSlots`, `ownership` — but the batch loop accesses `player.draftRanksByRankType` and `player.stats`, which are passthrough fields not in the TypeScript type
- **Fix:** Cast `for (const entry of batch as any[])` to avoid TypeScript errors while preserving Zod runtime validation
- **Files modified:** packages/backend/src/adapters/espn.ts

## Known Stubs

None.

## Self-Check: PASSED

- [x] `packages/backend/src/adapters/espn.ts` exists and contains `assertEspnCriticalShape`, `logUnexpectedFields`
- [x] `CLAUDE.md` exists and does not contain "No retry/backoff on ESPN API calls"
- [x] Commits c180544 and d9eb828 exist in git log
