# Summary 81-01: DB Migration + NotificationBus + StandingsChangeLogAgent

**Status:** Complete
**Commit:** e6ba70d

## Delivered

### Migration `021_add_standings_change_event.sql`

- New table `standings_change_event` with unique constraint on `(league_id, team_id, snapshot_date, category_id)`
- Indexes on `(league_id, snapshot_date DESC)` and `(team_id, occurred_at DESC)`
- `proximate_cause JSONB` column for player/event attribution

### `packages/backend/src/utils/notification-bus.ts`

- `NotificationBus` interface with `emit(event)` method
- `NoOpNotificationBus` — default, zero cost
- `SlackWebhookNotificationBus` — posts to Slack webhook, errors logged as warn never thrown
- `createNotificationBus(logger)` factory — activates Slack adapter when `SLACK_WEBHOOK_URL` env set

### `packages/backend/src/agents/standings-change-log.ts`

- `StandingsChangeLogAgent(db, logger, bus)`
- `generateEvents(leagueId, snapshotDate): Promise<number>`
- Guards: <2 snapshots → return 0; noise gate `|rotoDelta| < 0.5` → skip
- Idempotent via `ON CONFLICT DO NOTHING` on unique constraint
- Proximate cause: best-effort player lookup from roster snapshot + projections
- Returns count of events inserted

### `packages/backend/src/db/schema.ts`

- Added `StandingsChangeEventRow` interface
- Added `standings_change_event: StandingsChangeEventRow` to `Database`

## Fixes vs Plan

- Plan used wrong join column (`run_id`); fixed to `projections_run_id`
- Plan used wrong stats column (`projected_stats`); used `stat_components_json` instead
