---
phase: 07-historical-backfill-timeline
plan: 01
subsystem: backend-infrastructure
tags: [historical-data, backfill, rate-limiting, admin-api, background-jobs]

dependency_graph:
  requires: [phase-01-core, phase-05-admin]
  provides: [historical-backfill-agent, backfill-worker, backfill-api]
  affects: [admin-dashboard, timeline-ui]

tech_stack:
  added:
    - BullMQ separate queue for backfills
    - SHA-256 transaction deduplication
    - Instance-level ESPN rate throttle
  patterns:
    - Sequential week processing with per-week error isolation
    - Structured progress tracking via Redis
    - Exponential backoff on 429 errors (axios-retry)

key_files:
  created:
    - packages/backend/src/agents/historical-backfill.ts
    - packages/backend/src/workers/backfill-worker.ts
  modified:
    - packages/backend/src/adapters/espn.ts
    - packages/backend/src/api/admin.ts

decisions:
  - title: "Separate BullMQ queue for backfills"
    rationale: "Prevents historical backfill jobs from starving daily snapshot processing"
    impact: "Concurrency=1 ensures rate limit compliance, separate from snapshot workers"

  - title: "2-second throttle at adapter instance level"
    rationale: "ESPN API has strict rate limits; instance-level enforcement prevents violations across all historical fetches"
    impact: "lastRequestTime tracking ensures minimum 2000ms between requests"

  - title: "Transaction deduplication via SHA-256 hash"
    rationale: "Overlapping backfills would create duplicate transaction records without content-based deduplication"
    impact: "Hash includes transactionId, type, timestamp, sorted items, bidAmount; ON CONFLICT DO NOTHING on unique constraint"

  - title: "Reuse SnapshotOrchestratorAgent for snapshot writes"
    rationale: "Avoid duplicating complex snapshot logic; orchestrator already handles idempotent writes"
    impact: "backfillSeason calls executeSnapshot with forceFresh=true per week"

metrics:
  duration: 6min
  completed_date: 2026-02-21
  tasks_completed: 2
  files_created: 2
  files_modified: 2
  commits: 2
---

# Phase 07 Plan 01: Historical Backfill Backend Infrastructure Summary

**One-liner:** BullMQ backfill worker with ESPN rate-limited historical fetch, SHA-256 transaction deduplication, and admin API endpoints for job triggering and progress tracking

## Completed Tasks

| Task | Name                                                      | Commit  | Files                                                    |
| ---- | --------------------------------------------------------- | ------- | -------------------------------------------------------- |
| 1    | ESPN adapter historical fetch + HistoricalBackfillAgent   | 54dd02b | espn.ts, historical-backfill.ts                          |
| 2    | BullMQ backfill worker + admin API endpoints              | 90c0f96 | backfill-worker.ts, admin.ts                             |

## What Was Built

### Historical Backfill Agent

**HistoricalBackfillAgent** (`packages/backend/src/agents/historical-backfill.ts`):
- `backfillSeason()` method processes weeks sequentially from startWeek to endWeek
- Fetches ESPN historical data per week via `fetchHistoricalWeek()`
- Archives raw payloads to `league_raw_payload` with `scoring_period_id`
- Normalizes data and reuses `SnapshotOrchestratorAgent.executeSnapshot()` for idempotent writes
- Computes snapshot date heuristic: April 1 + (week - 1) * 7 days
- Deduplicates transactions via SHA-256 hash of canonical fields (transactionId, type, timestamp, sorted items, bidAmount)
- Reports structured progress: `{ stage, completedWeeks, totalWeeks, currentWeek, percentage, errors }`
- Per-week error isolation: logs error, increments `weeksFailed`, continues to next week

**ESPN Adapter Enhancement** (`packages/backend/src/adapters/espn.ts`):
- Added `fetchHistoricalWeek()` method for scoring-period-specific fetches
- Instance-level throttle: `lastRequestTime` field enforces minimum 2000ms between requests
- 429 handling: logs Retry-After header, throws error for axios-retry exponential backoff
- Returns standard `ESPNRawResponse` shape (data, schemaFingerprint, fetchedAt)

### BullMQ Backfill Worker

**Backfill Worker** (`packages/backend/src/workers/backfill-worker.ts`):
- Separate "backfills" queue (distinct from "snapshots" queue)
- Concurrency: 1 (one backfill at a time to respect rate limits)
- Job data: `{ leagueId, season, startWeek, endWeek, espnAuth }`
- Progress tracking: calls `job.updateProgress(progress)` with structured BackfillProgress
- Error handling: logs error with jobId and leagueId, re-throws for BullMQ retry
- Graceful shutdown on SIGTERM

### Admin API Endpoints

**POST `/api/admin/leagues/:leagueId/backfill`**:
- Triggers historical backfill for a specific league and season
- Request body: `{ season: number, startWeek?: number (default 1), endWeek?: number (default 26) }`
- Validation: season 2017-current, startWeek >= 1, endWeek <= 26, startWeek <= endWeek
- Retrieves ESPN auth (encrypted or plaintext) from league row
- Job deduplication: `jobId = backfill-{leagueId}-{season}`
- Returns 409 if job already exists, 200 with jobId and message if successful
- Rate limit: max 10 requests per minute

**GET `/api/admin/backfill-jobs/:jobId`**:
- Retrieves job status, progress, data, timestamps, and error details
- Returns: `{ id, status, progress, data: { leagueId, season, startWeek, endWeek }, createdAt, finishedAt, failedReason, returnValue }`
- Progress includes structured BackfillProgress from agent
- Returns 404 if job not found

**GET `/api/admin/backfill-jobs`**:
- Lists recent backfill jobs across all states (active, waiting, completed, failed)
- Fetches 10 jobs per state, maps to response format, sorts by createdAt desc
- Returns: `{ jobs: [...] }` with job summaries
- Rate limit: max 60 requests per minute

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

**TypeScript Compilation:**
```bash
npx tsc --noEmit -p packages/backend/tsconfig.json
```
No errors in historical-backfill.ts, backfill-worker.ts, or admin.ts after type fixes.

**Exports Verified:**
- `HistoricalBackfillAgent`, `BackfillProgress`, `BackfillResult` exported from historical-backfill.ts
- `fetchHistoricalWeek` method exists on ESPNAdapter
- `backfillQueue` exported from backfill-worker.ts

**Endpoints Verified:**
- POST `/api/admin/leagues/:leagueId/backfill`
- GET `/api/admin/backfill-jobs/:jobId`
- GET `/api/admin/backfill-jobs`

**Queue Verified:**
- Queue name: "backfills" (separate from "snapshots")
- Worker concurrency: 1

## Self-Check: PASSED

**Created files exist:**
```bash
[ -f "packages/backend/src/agents/historical-backfill.ts" ] && echo "FOUND"
[ -f "packages/backend/src/workers/backfill-worker.ts" ] && echo "FOUND"
```
Both files found.

**Commits exist:**
```bash
git log --oneline | grep -E "54dd02b|90c0f96"
```
Both commits present in git history.

**Modified files contain expected patterns:**
- `fetchHistoricalWeek` in espn.ts: FOUND
- `backfillQueue` in backfill-worker.ts: FOUND
- POST `/api/admin/leagues/:leagueId/backfill` in admin.ts: FOUND

## Notes

**Type assertion workarounds:**
- Used `as any` for BullMQ connection (IORedis type compatibility issue)
- Used `as any` for `league_raw_payload` and `league_transaction_event` inserts (pre-existing schema issue: `id` field not marked as `Generated<number>`)

**Encrypted credentials handling:**
- Admin API prefers `espn_swid_encrypted` / `espn_s2_encrypted` columns
- Falls back to plaintext `espn_swid` / `espn_s2` if encrypted not available
- Uses `hasEncryptionKey()` to determine if decryption is needed

**Progress tracking:**
- Progress object includes `stage`, `completedWeeks`, `totalWeeks`, `currentWeek`, `percentage`, `errors`
- Stored in Redis via `job.updateProgress()` for real-time status queries

**Next Steps:**
- Phase 07 Plan 02 will build the frontend timeline UI to visualize backfilled historical data
- Admin dashboard should add a "Backfill History" section to trigger and monitor jobs
