# Phase 99: Worker Runtime Module — Context

**Gathered:** 2026-05-15
**Status:** Ready
**Milestone:** v10.0 Architecture Improvements

<domain>
## Phase Boundary

Extract shared BullMQ bootstrap logic from 6 worker files into a single `worker-runtime.ts` module.

Currently each worker file independently:

1. Creates `new IORedis(...)` with identical config
2. Creates `new Queue("name")` with identical retry policy
3. Creates `new Worker("name", handler, opts)` with identical concurrency settings
4. Registers `process.on("SIGTERM", ...)` / `process.on("SIGINT", ...)` shutdown handlers
5. Implements its own `scheduleDailySnapshots()` or similar scheduler

## Evidence

Workers containing duplicated bootstrap: `snapshot-worker.ts`, `backfill-worker.ts`, `live-poll-worker.ts`, `player-pool-worker.ts`, `morning-report-worker.ts`, `slack-approval-worker.ts`

In `snapshot-worker.ts`: `new IORedis()` (L23), `new Queue("snapshots")` (L31), `new Queue("snapshots-dlq")` (L34), `new Worker(...)` inline, `process.on("SIGTERM")` at L171
</domain>

<decisions>
## Implementation Strategy

1. Create `packages/backend/src/workers/worker-runtime.ts` with:
   - `createRedisConnection(url?: string): IORedis` — shared, optionally memoized
   - `createQueue<T>(name: string, opts?): Queue<T>` — wraps IORedis + retry defaults
   - `createWorker<T>(name, handler, opts?): Worker<T>` — wraps concurrency defaults
   - `registerShutdown(workers: Worker[], queues: Queue[], redis: IORedis): void` — single SIGTERM/SIGINT handler

2. Each worker file becomes: type definition + handler function + `createRuntime()` call passing handler

## Files to Modify

- `packages/backend/src/workers/worker-runtime.ts` — NEW
- `packages/backend/src/workers/snapshot-worker.ts`
- `packages/backend/src/workers/backfill-worker.ts`
- `packages/backend/src/workers/live-poll-worker.ts`
- `packages/backend/src/workers/player-pool-worker.ts`
- `packages/backend/src/workers/morning-report-worker.ts`
- `packages/backend/src/workers/slack-approval-worker.ts`
  </decisions>
