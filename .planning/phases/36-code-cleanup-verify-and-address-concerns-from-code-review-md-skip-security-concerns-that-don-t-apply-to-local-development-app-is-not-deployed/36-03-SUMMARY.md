---
phase: 36-code-cleanup
plan: "03"
subsystem: frontend, backend, infrastructure
tags: [bugfix, robustness, nan-guard, debounce, docker, typescript]
dependency_graph:
  requires: []
  provides:
    - NaN-guarded localStorage team ID reads across 6 pages
    - Debounced auction page inputs (500ms)
    - Symmetric snapshot degradation for transaction failures
    - Consistent @types/node ^22.0.0 across monorepo
    - Frontend Docker production stage resolves pnpm workspace shared package
    - Backend Docker production stage ships only dist (no src)
  affects:
    - packages/frontend/src/components/league/TeamSelector.tsx
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
    - packages/frontend/src/app/leagues/[id]/standings/page.tsx
    - packages/frontend/src/app/leagues/[id]/trades/page.tsx
    - packages/frontend/src/app/leagues/[id]/trends/page.tsx
    - packages/frontend/src/app/leagues/[id]/moves/page.tsx
    - packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx
    - packages/backend/src/agents/snapshot-orchestrator.ts
    - packages/shared/package.json
    - packages/backend/package.json
    - packages/frontend/package.json
    - packages/frontend/Dockerfile
    - packages/backend/Dockerfile
tech_stack:
  added: []
  patterns:
    - isNaN guard pattern for localStorage parseInt
    - useEffect debounce pattern for input-driven queries
    - Promise.allSettled symmetric degradation handling
key_files:
  created: []
  modified:
    - packages/frontend/src/components/league/TeamSelector.tsx
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
    - packages/frontend/src/app/leagues/[id]/standings/page.tsx
    - packages/frontend/src/app/leagues/[id]/trades/page.tsx
    - packages/frontend/src/app/leagues/[id]/trends/page.tsx
    - packages/frontend/src/app/leagues/[id]/moves/page.tsx
    - packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx
    - packages/backend/src/agents/snapshot-orchestrator.ts
    - packages/shared/package.json
    - packages/backend/package.json
    - packages/frontend/package.json
    - packages/frontend/Dockerfile
    - packages/backend/Dockerfile
    - pnpm-lock.yaml
decisions:
  - "@types/node aligned to ^22.0.0 (LTS) across all three packages"
  - "Backend Dockerfile production stage now ships only dist + migration SQL, no source"
  - "Transaction failures produce degraded snapshots symmetric with free agent failures"
metrics:
  duration: "4 minutes"
  completed: "2026-03-09"
  tasks_completed: 2
  files_modified: 14
---

# Phase 36 Plan 03: Frontend/Backend/Infrastructure Bug Fixes Summary

NaN-guarded localStorage reads, debounced auction inputs, symmetric snapshot degradation for transaction failures, @types/node aligned to ^22.0.0, frontend Dockerfile includes shared/package.json in production stage, backend Dockerfile ships only dist (no src).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix frontend bugs (F-01 NaN guard, F-04 stale closure, F-05 debounce) | 82c1c3e | 7 files |
| 2 | Fix backend degradation and infrastructure issues (B-08, I-01, I-02, I-04) | 42bd698 | 7 files |

## Changes Made

### Task 1: Frontend Correctness Fixes

**F-01: parseInt NaN guard (6 call sites)**

All 6 `parseInt(stored, 10)` calls reading from localStorage now guard against NaN:

```typescript
// Before:
setSelectedTeamId(parseInt(stored, 10));

// After:
const parsed = parseInt(stored, 10);
if (!isNaN(parsed)) setSelectedTeamId(parsed);
```

Files fixed:
- `packages/frontend/src/components/league/TeamSelector.tsx` - `onSelect(parsed)` with NaN guard
- `packages/frontend/src/app/leagues/[id]/standings/page.tsx`
- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx`
- `packages/frontend/src/app/leagues/[id]/trades/page.tsx`
- `packages/frontend/src/app/leagues/[id]/trends/page.tsx`
- `packages/frontend/src/app/leagues/[id]/moves/page.tsx`

**F-04: Stale closure in TeamSelector**

Removed `eslint-disable-next-line react-hooks/exhaustive-deps` suppression. Added `onSelect` to the dependency array for the useEffect that reads from localStorage.

**F-05: Debounce auction page inputs**

Added `debouncedBudget` and `debouncedMinBid` state with 500ms debounce via useEffect. The TanStack Query `queryKey` and `queryFn` URL now use the debounced values, preventing per-keystroke API calls. onChange handlers also guard against NaN.

### Task 2: Backend & Infrastructure Fixes

**B-08: Snapshot degradation symmetry**

When `transactionResult.status === "rejected"`, the snapshot is now marked degraded with reason `"transactions_failed"` — symmetric with `freeAgentResult` rejection handling. Previously, transaction failures were only logged as warnings.

**I-01: @types/node version alignment**

All three packages now specify `"@types/node": "^22.0.0"`:
- `packages/shared/package.json`: was `^25.3.0`
- `packages/backend/package.json`: was `^20.10.7`
- `packages/frontend/package.json`: was `^20.11.5`

pnpm-lock.yaml updated to reflect new resolved versions.

**I-02: Frontend Dockerfile shared package.json**

Added `COPY packages/shared/package.json ./packages/shared/` to the production stage, enabling pnpm workspace resolution of the shared package.

**I-04: Backend Dockerfile src cleanup**

Removed two lines that copied `shared/src` and `backend/src` into the production image. Now only dist directories and migration SQL files are copied:

```dockerfile
# Before:
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/src ./packages/shared/src
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/src ./packages/backend/src
RUN cp -r ./packages/backend/src/db/migrations ./packages/backend/dist/db/migrations

# After:
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/src/db/migrations ./packages/backend/dist/db/migrations
```

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `packages/frontend/src/components/league/TeamSelector.tsx` - FOUND, contains `isNaN`
- `packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx` - FOUND, contains `debouncedBudget`
- `packages/backend/src/agents/snapshot-orchestrator.ts` - FOUND, contains `transactions_failed`
- `packages/frontend/Dockerfile` - FOUND, contains `packages/shared/package.json`
- `packages/backend/Dockerfile` - FOUND, no `backend/src` directory copy (only migration path)
- Commits 82c1c3e and 42bd698 - FOUND in git log
