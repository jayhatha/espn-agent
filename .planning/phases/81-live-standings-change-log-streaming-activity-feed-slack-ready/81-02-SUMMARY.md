# Summary 81-02: SSE Route + Snapshot Orchestrator Hook

**Status:** Complete
**Commit:** 1cf90d8

## Delivered

### `packages/backend/src/utils/change-log-emitter.ts`

- Singleton `EventEmitter` exported as `changeLogEmitter`
- `setMaxListeners(100)` for up to 100 concurrent SSE clients
- `CHANGE_LOG_EVENT` constant + `ChangeLogSignal` interface

### `packages/backend/src/agents/snapshot-orchestrator.ts` (modified)

- Step 8 added after `computeProjectedStandings()`
- Creates `StandingsChangeLogAgent` + `NotificationBus` per snapshot run
- Calls `generateEvents()`, emits signal to `changeLogEmitter` if `eventCount > 0`
- Wrapped in try/catch — failure is non-fatal (logged as warn)

### `packages/backend/src/api/timeseries.ts` (modified)

- `GET /api/leagues/:leagueId/standings/live-log` — SSE endpoint
  - `reply.hijack()` so Fastify doesn't manage response lifecycle
  - Sends last 50 history events on connect, then `history_end` frame
  - Subscribes to `changeLogEmitter` for league-specific live events
  - 30s heartbeat to keep connection alive
  - Cleans up listener + interval on `request.raw.close`
- `GET /api/leagues/:leagueId/standings/change-log` — REST paginated history
  - `?limit` (max 200), `?before` (cursor by `occurred_at`)
  - Auth: `authenticate` + `requireLeagueAccess`

## Notes

- Used `reply.hijack()` instead of `await new Promise()` — cleaner lifecycle control
