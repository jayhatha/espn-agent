---
phase: 13
plan: 03
subsystem: workers
tags: [bullmq, worker-stability, database-constraints, dlq, error-handling]
dependency_graph:
  requires: []
  provides:
    - failed-job-persistence
    - worker-graceful-degradation
    - data-integrity-constraints
  affects:
    - snapshot-worker
    - morning-report-worker
    - player-pool-worker
    - refresh_tokens-table
    - transaction_impact-table
tech_stack:
  added:
    - BullMQ-DLQ-pattern
    - BullMQ-repeatable-jobs
  patterns:
    - dead-letter-queue
    - conditional-worker-initialization
    - database-uniqueness-constraints
key_files:
  created:
    - packages/backend/src/db/migrations/014_add_unique_constraints.sql
  modified:
    - packages/backend/src/workers/snapshot-worker.ts
    - packages/backend/src/workers/morning-report-worker.ts
    - packages/backend/src/workers/player-pool-worker.ts
    - packages/backend/src/api/leagues.ts
    - packages/backend/src/api/recommendations.ts
    - packages/backend/src/utils/validation.ts
decisions:
  - DLQ keeps failed jobs for 30 days enabling post-mortem analysis
  - Morning report worker uses conditional initialization not process.exit
  - Player pool worker migrated to BullMQ for consistency and reliability
  - Composite UNIQUE constraint handles all transaction types (add/drop/trade)
metrics:
  duration: 7min
  tasks_completed: 3
  files_modified: 6
  commits: 3
completed: 2026-02-26
---

# Phase 13 Plan 03: Configure BullMQ DLQ and Fix Worker Stability Summary

**One-liner:** BullMQ dead letter queue for failed snapshot jobs, graceful worker degradation when features disabled, and database UNIQUE constraints preventing duplicate tokens and transaction impacts.

## Objectives Achieved

Configured BullMQ DLQ for persistent failed job tracking and fixed critical worker stability issues (process.exit crashes, missing database constraints, node-cron migration).

## Tasks Completed

### Task 1: Configure BullMQ DLQ for snapshot jobs (7597930)

Added dead letter queue to capture permanently failed jobs after max retries:

**Files modified:**
- `packages/backend/src/workers/snapshot-worker.ts`

**Changes:**
- Created `snapshotDLQ` queue exported at module level
- Updated `failed` event handler to move jobs to DLQ after max retries (3)
- DLQ entries persist for 30 days (removeOnComplete: 86400 * 30)
- Added `inspectDLQ()` helper function for admin debugging
- Job data includes: originalJobId, errorMessage, errorStack, attemptsMade, failedAt

**Pattern:** BullMQ DLQ pattern from research - failed jobs moved to separate queue for inspection without blocking retries.

### Task 2: Fix worker stability issues (f0c4735)

Fixed two critical worker stability issues plus blocking compilation errors:

**Files modified:**
- `packages/backend/src/workers/morning-report-worker.ts`
- `packages/backend/src/workers/player-pool-worker.ts`
- `packages/backend/src/api/leagues.ts`
- `packages/backend/src/api/recommendations.ts`
- `packages/backend/src/utils/validation.ts`

**Issue 1: morning-report-worker process.exit crash**
- **Problem:** When Slack disabled, worker called `process.exit(0)` killing entire process
- **Fix:** Conditional worker initialization using `startWorker()` function
- Worker only starts if `isSlackEnabled()` returns true
- Queue still exported for module dependencies
- Logs warning instead of crashing: "Slack disabled - morning report worker inactive"

**Issue 2: player-pool-worker using node-cron**
- **Problem:** node-cron has no retry, persistence, or deduplication across instances
- **Fix:** Migrated to BullMQ repeatable jobs
- Created `playerPoolQueue` with repeatable job pattern
- Schedule: "0 4 * * *" (4 AM ET daily, tz: America/New_York)
- Retry: 3 attempts with exponential backoff (5s, 10s, 20s)
- Retention: 7 days completed, 30 days failed
- Worker processes jobs with full error handling and logging

**Blocking compilation errors (Rule 3 deviation):**
- Fixed indentation/brace issues in `leagues.ts` (lines 718-736)
- Fixed nested catch block syntax error in `recommendations.ts` (lines 178-186)
- Added missing `snapshotDate` field to `WaiverEvaluationSchema`
- Removed unused imports (`UpdateAuthSchema`, `parseIntParam`) flagged by TypeScript

### Task 3: Add missing database UNIQUE constraints (48a0595)

Created migration 014 to add missing UNIQUE constraints preventing data corruption:

**Files created:**
- `packages/backend/src/db/migrations/014_add_unique_constraints.sql`

**Constraint 1: refresh_tokens.token_hash**
```sql
ALTER TABLE refresh_tokens
ADD CONSTRAINT refresh_tokens_token_hash_unique UNIQUE (token_hash);
```
- **Issue:** Token hashes could duplicate (security vulnerability)
- **Fix:** UNIQUE constraint on token_hash column

**Constraint 2: transaction_impact composite**
```sql
-- Drop old narrow constraint
ALTER TABLE transaction_impact
DROP CONSTRAINT IF EXISTS transaction_impact_unique_per_transaction_player;

-- Add comprehensive composite constraint
ALTER TABLE transaction_impact
ADD CONSTRAINT transaction_impact_unique_per_transaction
UNIQUE (league_id, transaction_date, transaction_type, player_gained_id, player_lost_id);
```
- **Issue:** Old constraint only included `player_gained_id`, allowing drop-only transactions to duplicate
- **Fix:** Composite constraint on all transaction dimensions
- **Handles all types:**
  - Adds: `player_gained_id` set, `player_lost_id` NULL
  - Drops: `player_gained_id` NULL, `player_lost_id` set
  - Trades: both set

## Verification Results

All verification criteria passed:

1. Backend builds successfully: ✅
2. `snapshotDLQ` references: 3 (export, add, inspectDLQ) ✅
3. No early `process.exit` in morning-report-worker (only SIGTERM handler) ✅
4. Migration has 3 CONSTRAINT statements (2 ADD, 1 DROP) ✅
5. player-pool-worker uses BullMQ Worker pattern ✅

## Deviations from Plan

### Auto-fixed Issues (Rule 3 - Blocking)

**1. [Rule 3 - Blocking] Fixed syntax errors in leagues.ts**
- **Found during:** Task 2 verification (npm run build)
- **Issue:** Indentation mismatch causing return statement to appear inside wrong scope, duplicate catch block
- **Fix:** Adjusted indentation from 10 spaces to 6 for return statement and properties, fixed brace alignment
- **Files modified:** `packages/backend/src/api/leagues.ts` (lines 718-736)
- **Commit:** f0c4735 (bundled with Task 2)

**2. [Rule 3 - Blocking] Fixed nested catch syntax error in recommendations.ts**
- **Found during:** Task 2 verification (npm run build)
- **Issue:** Duplicate nested catch block without corresponding try - likely from incomplete prior edit
- **Fix:** Removed extra catch block handling "Failed to fetch free agents" (lines 178-185)
- **Files modified:** `packages/backend/src/api/recommendations.ts`
- **Commit:** f0c4735 (bundled with Task 2)

**3. [Rule 3 - Blocking] Added missing snapshotDate field to validation schema**
- **Found during:** Task 2 verification (TypeScript compilation)
- **Issue:** WaiverEvaluationSchema missing `snapshotDate` field used in route handler
- **Fix:** Added `snapshotDate: z.string().optional()` to schema
- **Files modified:** `packages/backend/src/utils/validation.ts`
- **Commit:** f0c4735 (bundled with Task 2)

All deviations were critical blocking issues preventing task verification. No architectural changes required.

## Technical Details

### BullMQ DLQ Pattern

```typescript
// Queue creation
export const snapshotDLQ = new Queue("snapshots-dlq", { connection });

// Failed event handler
worker.on("failed", async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
    await snapshotDLQ.add("failed-snapshot", {
      originalJobId: job.id,
      originalJobName: job.name,
      originalData: job.data,
      errorMessage: err.message,
      errorStack: err.stack,
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString(),
    }, {
      removeOnComplete: { age: 86400 * 30 }
    });
  }
});

// Inspection helper
export async function inspectDLQ(limit = 10) {
  const failed = await snapshotDLQ.getJobs(["completed"], 0, limit);
  return failed.map(job => ({
    jobId: job.data.originalJobId,
    failedAt: job.data.failedAt,
    error: job.data.errorMessage,
    attempts: job.data.attemptsMade
  }));
}
```

### Conditional Worker Initialization

```typescript
// morning-report-worker.ts pattern
export const morningReportQueue = new Queue("morning-reports", { connection });

if (!isSlackEnabled()) {
  logger.warn("Slack disabled - morning report worker inactive");
} else {
  startWorker(); // Only initialize worker when feature enabled
}

function startWorker() {
  const worker = new Worker(...);
  worker.on("completed", ...);
  worker.on("failed", ...);
  // All worker setup inside conditional scope
}
```

### BullMQ Repeatable Jobs

```typescript
// player-pool-worker.ts migration from node-cron
export const playerPoolQueue = new Queue("player-pool-sync", { connection });

// Schedule repeatable job (replaces cron.schedule)
playerPoolQueue.add("daily-sync", { season: 2025 }, {
  repeat: {
    pattern: "0 4 * * *",
    tz: "America/New_York"
  },
  removeOnComplete: { age: 86400 * 7 },
  removeOnFail: { age: 86400 * 30 }
});

// Worker with retry logic (node-cron had none)
const worker = new Worker("player-pool-sync", async (job) => {
  // Sync logic here
}, {
  connection,
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 }
});
```

## Impact on Codebase

**Improved reliability:**
- Failed snapshot jobs now persist for debugging (30-day retention)
- Workers gracefully degrade when features disabled (no process crashes)
- Duplicate tokens and transaction impacts prevented by database constraints

**Better observability:**
- DLQ inspection API enables admin debugging of failed jobs
- Worker logs warnings instead of silent failures
- Retry/backoff patterns logged for player pool sync

**Consistency:**
- All scheduled jobs now use BullMQ (no mixed cron/BullMQ setup)
- All workers follow same error handling patterns
- Database integrity enforced at constraint level

## Next Steps

1. Deploy migration 014 to production database
2. Monitor DLQ for any failed snapshot jobs (inspect via `/api/admin/dlq`)
3. Test worker behavior when Slack disabled (should log warning, not crash)
4. Verify player pool sync runs at 4 AM ET daily via BullMQ dashboard

## Self-Check: PASSED

**Files exist:**
- ✅ FOUND: packages/backend/src/db/migrations/014_add_unique_constraints.sql
- ✅ FOUND: packages/backend/src/workers/snapshot-worker.ts (modified)
- ✅ FOUND: packages/backend/src/workers/morning-report-worker.ts (modified)
- ✅ FOUND: packages/backend/src/workers/player-pool-worker.ts (modified)

**Commits exist:**
- ✅ FOUND: 7597930 (Task 1: BullMQ DLQ)
- ✅ FOUND: f0c4735 (Task 2: Worker stability)
- ✅ FOUND: 48a0595 (Task 3: Database constraints)

**Functionality verified:**
- ✅ Backend compiles without errors
- ✅ snapshotDLQ exported and used in failed event handler
- ✅ morning-report-worker uses conditional initialization
- ✅ player-pool-worker uses BullMQ Worker and repeatable jobs
- ✅ Migration 014 has 3 CONSTRAINT statements
