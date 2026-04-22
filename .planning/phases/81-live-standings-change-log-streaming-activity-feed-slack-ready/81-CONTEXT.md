# Phase 81: Live Standings Change Log — Context

**Gathered:** 2026-04-22
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous --auto mode)

<domain>
## Phase Boundary

Dashboard gains a "Change Log" page showing a real-time streaming feed of standings events. When total roto points change between snapshots, each entry names which category shifted, who was passed or who passed us, and which player/event was the proximate cause (e.g., "our SP gave up 2 HR → lost 1 pt in ERA"). A notification bus abstraction makes every event deliverable to Slack (or any future channel) without touching feed logic.

Phase 80 already implements StandingsSwingAttributionAgent (snapshot diff → category attribution + driver players). Phase 81 elevates that into a persistent event log with real-time delivery.

</domain>

<decisions>
## Implementation Decisions

### Event Persistence
**Decision: New `standings_change_event` table.**
Events are computed at snapshot time and persisted, so the feed has history on first load (not just future snapshots). Without persistence, a page refresh loses all history. Migration: `021_add_standings_change_event.sql`.

Schema:
```sql
CREATE TABLE standings_change_event (
  id            BIGSERIAL PRIMARY KEY,
  league_id     INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  team_id       INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  occurred_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  category_id   VARCHAR NOT NULL,
  category_name VARCHAR NOT NULL,
  prev_roto_pts NUMERIC NOT NULL,
  curr_roto_pts NUMERIC NOT NULL,
  roto_delta    NUMERIC NOT NULL,
  passed_team_id   INTEGER REFERENCES team(id),
  passed_team_name VARCHAR,
  direction     VARCHAR NOT NULL CHECK (direction IN ('gained','lost')),
  proximate_cause JSONB  -- { playerName, stat, value, description }
);
CREATE INDEX idx_sce_league_date ON standings_change_event (league_id, snapshot_date DESC);
CREATE INDEX idx_sce_team ON standings_change_event (team_id, occurred_at DESC);
```

### Event Generation
**Decision: Hook into SnapshotOrchestratorAgent.executeSnapshot() after snapshot writes.**
Call `StandingsChangeLogAgent.generateEvents(leagueId, snapshotDate)` at the end of executeSnapshot. The agent re-uses Phase 80's diff logic (computes category deltas between the two most recent snapshots) but writes events to `standings_change_event` instead of returning attribution data. Only events where `|roto_delta| >= 0.5` are emitted (noise gate).

### Notification Bus
**Decision: `NotificationBus` interface in `utils/notification-bus.ts` with no-op and Slack adapters.**
```ts
interface NotificationBus {
  emit(event: StandingsChangeEvent): Promise<void>;
}
class NoOpNotificationBus implements NotificationBus { ... }
class SlackWebhookNotificationBus implements NotificationBus { ... } // env-gated
```
Bus is instantiated with env check: if `SLACK_WEBHOOK_URL` is set → SlackWebhookNotificationBus, else NoOpNotificationBus. The StandingsChangeLogAgent receives the bus via constructor injection. This decouples event generation from delivery — zero Slack code touches the agent or the SSE endpoint.

Slack message format (future): "📉 We dropped 1pt in ERA — Martinez gave up 2 HR. Now 8th (was 7th). Passed by The Destroyers."

### Streaming Transport
**Decision: SSE (Server-Sent Events).**
No existing WebSocket infra in this codebase. SSE is simpler for one-way server→client push. Fastify supports SSE via raw `reply.raw` + `Content-Type: text/event-stream`. New route: `GET /api/leagues/:leagueId/standings/live-log`. The endpoint returns:
1. Historical events (last 50) as `data:` frames immediately on connect
2. Subscribes to an in-process EventEmitter for new events as they arrive (snapshot worker emits to same EventEmitter after writing to DB)
3. Heartbeat `data: {"type":"heartbeat"}` every 30s to keep connection alive

**No Redis pub/sub for now** — single process, in-process EventEmitter is sufficient. If multi-process needed later, swap emitter for a Redis channel.

### Frontend Location
**Decision: New dedicated page `/leagues/[id]/changelog/` with LeagueNav entry.**
Not a tab on standings (standings is already complex). New nav item "Change Log" between Standings and Categories. Page uses SSE via `EventSource` in a `useChangeLog` hook. Events displayed as a reverse-chronological feed (newest at top) with category badge, delta indicator, passer/passee label, and proximate cause line.

### My Team Context
**Decision: Highlight events for the user's own team using `selectedTeamId` from localStorage (existing pattern).**
Events for other teams are shown at reduced opacity. The feed shows ALL teams' events (gives context about who is moving) but visually emphasizes our team's events.

### Feed Capacity
**Decision: Last 200 events in DB, last 50 loaded on initial SSE connect, then live updates.**
No infinite scroll needed for MVP. Events older than 90 days are pruned by a future cleanup job (note deferred).

### Proximate Cause Attribution
**Decision: Re-use Phase 80's `topDriverPlayer` and `projectionDrivers` from category breakdown.**
The change log agent calls the same attribution math as Phase 80 but formats output into a human-readable `proximate_cause` JSONB blob:
```json
{ "playerName": "L. Martinez", "stat": "HR", "value": 2, "description": "gave up 2 HR (SP)" }
```
When bucket is `competitor_movement`, proximate cause is the competitor team's top mover.

</decisions>

<code_context>
## Existing Code Insights

- **Pattern model**: `StandingsSwingAttributionAgent` (Phase 80) — use same snapshot diff math, same assignRanksWithTies, same three-bucket model
- **Snapshot hook location**: `SnapshotOrchestratorAgent.executeSnapshot()` — add call at end, after `computeProjectedStandings()`
- **Worker pattern**: `snapshot-worker.ts` imports `SnapshotOrchestratorAgent` — no changes needed to worker if hook is in orchestrator
- **Feature flag pattern**: `isSlackEnabled()` in `utils/feature-flags.ts` — add `isChangeLogSlackEnabled()` checking `SLACK_WEBHOOK_URL` env var
- **Fastify route pattern**: `timeSeriesRoutes` in `api/timeseries.ts` — add SSE route there (same auth/access middleware)
- **Frontend SSE**: No existing SSE client — create `useChangeLog` hook using native `EventSource` API
- **Tab pattern**: `streaming/page.tsx` tabs as reference for tab UI; LeagueNav in `components/shell/LeagueNav.tsx` for nav item
- **DB migration**: Next is `021_add_standings_change_event.sql`
- **Kysely schema**: Add `standings_change_event: StandingsChangeEventTable` to `Database` interface in `schema.ts`
- **api.ts client**: Add `getChangeLogHistory(leagueId)` — REST fetch for initial history (SSE handles live updates)

</code_context>

<specifics>
## Specific Requirements

- Events only emitted when `|roto_delta| >= 0.5` (noise gate — half a roto point)
- Feed shows ALL teams' events (full league context), not just our team
- Our team's events are highlighted; others shown at reduced opacity
- Proximate cause: human-readable string derived from Phase 80 attribution
- Slack adapter is no-op when `SLACK_WEBHOOK_URL` is unset — zero runtime cost
- SSE heartbeat every 30s prevents proxy timeouts
- Initial load: last 50 events from DB via history fetch; live events via SSE thereafter
- Page shows empty state: "No standings changes yet — check back after the next snapshot"

</specifics>

<deferred>
## Deferred Ideas

- Event pruning job (>90 days) — note for future cleanup phase
- Redis pub/sub for multi-process SSE fan-out — add when horizontally scaling
- Full Slack OAuth integration — Phase 81 only adds the webhook adapter; full Slack install is already in the codebase
- In-app notification badge (unread count in LeagueNav) — future polish phase
- "Why did this happen?" deep-dive modal linking to Swing Attribution Panel — future enhancement

</deferred>
