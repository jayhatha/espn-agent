---
status: resolved
slug: points-not-updating-live
trigger: "Points changes aren't updating live. Debug?"
created: 2026-04-22
updated: 2026-04-22
---

# Debug Session: points-not-updating-live

## Symptoms

- **Expected:** Changelog page SSE stream shows new standings change events within seconds of a score change during live games. `LIVE_POLL_EVENT` updates the "Updated X ago" timestamp. `CHANGE_LOG_EVENT` events appear as new rows in the feed.
updated: 2026-05-05
- **Errors:** Unknown — user unavailable. Inferring from codebase.
- **Timeline:** Phase 82 was just implemented. The TypeScript build had a `roto_points` vs `overall_points` column mismatch (now fixed). Unknown if this feature has ever worked end-to-end.
- **Reproduction:** Open `/leagues/[id]/changelog` during game hours, trigger or wait for a live poll cycle — no new events appear in the feed.

## Evidence

- timestamp: 2026-04-22
  finding: `packages/backend/.env` has no `LIVE_POLL_ENABLED` entry. Both `scheduleLivePolls()` and the BullMQ worker processor check `process.env.LIVE_POLL_ENABLED !== "true"` and return/skip early. No polls ever fire.

- timestamp: 2026-04-22
  finding: `StandingsChangeLogAgent.generateEvents()` uses `ON CONFLICT DO NOTHING` on the unique constraint `(league_id, team_id, snapshot_date, category_id)`. First poll of the day inserts events; all subsequent intraday polls return `totalInserted=0` and emit no SSE even when standings changed.

- timestamp: 2026-04-22
  finding: Frontend `addEvents` in `changelog/page.tsx` deduplicates by event ID using `seenIds.current.has(evt.id)` and skips already-seen IDs. Even if the backend updated an event's `roto_delta`, the frontend would never display the change.

## Eliminated

- Hypothesis: `isGameWindow()` UTC hour check wrong — ELIMINATED. Backend check (`h >= 17 || h < 4` UTC) correctly covers 1pm–midnight EDT during DST. Front-end indicator uses local hours which is display-only.
- Hypothesis: SSE route misconfigured — ELIMINATED. Route correctly subscribes to both `CHANGE_LOG_EVENT` and `LIVE_POLL_EVENT` and fans out to clients.
- Hypothesis: BullMQ worker not executing — ELIMINATED as separate from root cause. Worker is registered correctly; the issue is the env var gate.
- Hypothesis: Frontend EventSource parsing wrong — ELIMINATED. `es.onmessage` correctly parses `{ type: "event", data: {...} }` and `{ type: "live_poll", data: {...} }`.

## Current Focus

hypothesis: "Resolved — live standings now read ESPN points plus live pointsDelta during active games"
next_action: "resolved"

## Resolution

**Root cause:** Three compounding bugs preventing live updates end-to-end:

1. **`LIVE_POLL_ENABLED` missing from `.env`** — The entire live poll system was disabled. Both `scheduleLivePolls()` and the BullMQ job processor gate on this env var and return early when it's unset. No polls fired.

2. **`ON CONFLICT DO NOTHING` blocked intraday updates** — The first poll of each day inserted events; all subsequent 15-min polls found the same `(league_id, team_id, snapshot_date, category_id)` and did nothing, emitting no SSE. Standings changes after the first poll were silently swallowed.

3. **Frontend skipped updated event IDs** — `addEvents` checked `seenIds.current.has(evt.id)` and skipped already-seen events. If the backend did update an event's delta, the frontend would not show it.

**Fix applied:**

1. Added `LIVE_POLL_ENABLED=true` to `packages/backend/.env`.

2. Changed `standings-change-log.ts` to:
   - Pre-fetch existing events for the current date into `existingDeltaMap` before the event loop.
   - Replace `doNothing()` with `doUpdateSet()` using `EXCLUDED.*` references so intraday polls update `roto_delta`, `curr_roto_pts`, `direction`, `passed_team_*`, `proximate_cause`, and `occurred_at`.
   - Emit SSE (and increment `totalInserted`) only when the event is new or the delta changed by ≥0.01 points (`isNewOrChanged`).

3. Changed `changelog/page.tsx` `addEvents` to upsert by ID: events with known IDs are updated in-place in the state array rather than skipped, so intraday delta changes appear without duplicating the card.
