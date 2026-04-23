# Phase 82 Context: Live Game Polling

## Problem

Phase 81 built a SSE changelog that fires on daily snapshot events (overnight at 3am).
During the day when MLB games are live, users see stale data — the changelog doesn't move
until tomorrow's snapshot. Users want to watch standings shift as games happen.

## Goal

Poll ESPN's team stats API every 15 minutes during game hours (roughly 1pm–midnight ET),
update `team_daily_category_totals` + ranks + projections for today, and emit change events
through the existing SSE/changelog infrastructure so users see live event cards without
waiting for the overnight snapshot.

## Architectural Decisions (LOCKED)

### Polling mechanism

**BullMQ repeatable job** (`*/15 * * * *`) in a new `live-poll-worker.ts`.

- Same Redis connection as snapshot worker
- Game-window guard inside the job: skip if UTC hour not in 17–04 range (1pm–midnight ET)
- Feature flag: `LIVE_POLL_ENABLED=true` env var — off by default, import is unconditional
  but the job itself checks the flag

### ESPN data source

Same `ESPNAdapter.fetchLeague()` with lightweight views: `["mSettings", "mTeam", "mStandings"]`.
No `kona_player_info`, no roster view. Faster + lighter.
The adapter already rate-limits to 2s between calls.

### Standings update strategy

For each live poll:

1. DELETE + INSERT `team_daily_category_totals` / `_ranks` / `_overall` for today
2. If projections run exists: call `StandingsProjectionAgent.computeProjectedStandings()`
3. Ensure `league_daily_snapshot` row for today (INSERT ON CONFLICT DO NOTHING)
   — required so `StandingsChangeLogAgent.generateEvents()` can find today in its snapshot query
4. Call `StandingsChangeLogAgent.generateEvents(leagueId, today)`
5. Emit `CHANGE_LOG_EVENT` (existing — carries events to SSE clients) +
   `LIVE_POLL_EVENT` (new — carries polledAt timestamp even when eventCount=0)

### New emitter event

`LIVE_POLL_EVENT = "live_poll"` added to `change-log-emitter.ts`.
Frontend uses this to update "Last refreshed" indicator.

### New agent

`LivePollAgent` in `packages/backend/src/agents/live-poll.ts`.
Constructor: `(db: Kysely<Database>, logger?: BaseLogger)`.
Public method: `refresh(leagueId: number, today: string): Promise<number>` (returns eventCount).

### API trigger

`POST /api/leagues/:leagueId/live-refresh` — manual refresh for "Refresh now" button.
Protected by `authenticate + requireLeagueAccess`.
Returns `{ polledAt: string, eventCount: number }`.

### Frontend changes

- Game window indicator ("Games in progress" chip, shows 1pm–midnight ET local time)
- `lastPolledAt` state updated from SSE `live_poll` messages
- "Last refreshed X ago" relative time display
- "Refresh now" button → POST live-refresh
- Empty state text updated to mention live games

### What is NOT in scope

- WebSocket (SSE already works, no need to switch)
- Storing live poll "snapshots" as separate DB records (reuses today's date)
- Minute-by-minute polling (15 min is enough given ESPN API rate limits)
- Scoring period detection (use today's date, ESPN returns current-period cumulative stats)

## File Map

### New files

- `packages/backend/src/agents/live-poll.ts`
- `packages/backend/src/workers/live-poll-worker.ts`

### Modified files

- `packages/backend/src/utils/change-log-emitter.ts` — add LIVE_POLL_EVENT
- `packages/backend/src/workers/snapshot-worker.ts` — import live-poll-worker
- `packages/backend/src/api/timeseries.ts` — POST live-refresh + LIVE_POLL_EVENT in SSE
- `packages/frontend/src/app/leagues/[id]/changelog/page.tsx` — live indicators
- `packages/frontend/src/lib/api.ts` — add triggerLiveRefresh()
