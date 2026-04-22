# Summary 82-01: LivePollAgent + Worker + API

**Status:** Complete
**Commit:** feat(phase-82-01)

## Delivered

### `packages/backend/src/utils/change-log-emitter.ts` (modified)
- Added `LIVE_POLL_EVENT = "live_poll"` constant
- Added `LivePollSignal` interface: `{ leagueId, polledAt, eventCount }`

### `packages/backend/src/agents/live-poll.ts` (new)
- `LivePollAgent(db, logger?)` — polls ESPN, updates standings, emits events
- `static isGameWindow()` — returns true 17:00–04:00 UTC (1pm–midnight ET)
- `refresh(leagueId, today)` — lightweight fetch (mSettings+mTeam+mStandings),
  deletes+re-inserts `team_daily_category_totals`/`_ranks`/`_overall` for today,
  ensures `league_daily_snapshot` row exists (ON CONFLICT DO NOTHING),
  calls `StandingsProjectionAgent.computeProjectedStandings()` if projections exist,
  calls `StandingsChangeLogAgent.generateEvents()`, emits `CHANGE_LOG_EVENT` + `LIVE_POLL_EVENT`,
  returns eventCount

### `packages/backend/src/workers/live-poll-worker.ts` (new)
- BullMQ `"live-polls"` queue + worker (concurrency 2)
- Repeatable job: `*/15 * * * *` (every 15 minutes)
- Double-guard: checks `LIVE_POLL_ENABLED=true` + `isGameWindow()` before calling agent
- `scheduleLivePolls()` — registers jobs for all active leagues, safe to call multiple times

### `packages/backend/src/workers/snapshot-worker.ts` (modified)
- Imports `scheduleLivePolls` from live-poll-worker
- Calls `scheduleLivePolls()` at startup (after `scheduleDailySnapshots()`)

### `packages/backend/src/api/timeseries.ts` (modified)
- Added `LIVE_POLL_EVENT` + `LivePollSignal` to imports
- SSE handler now subscribes to `LIVE_POLL_EVENT` → sends `{ type: "live_poll", data: { polledAt } }` to clients
- Cleanup removes both listeners on disconnect
- New `POST /api/leagues/:leagueId/live-refresh` — manual trigger, auth-protected, returns `{ polledAt, eventCount }`
