---
status: investigating
slug: points-not-updating-live
trigger: "Points changes aren't updating live. Debug?"
created: 2026-04-22
updated: 2026-04-22
---

# Debug Session: points-not-updating-live

## Symptoms

- **Expected:** Changelog page SSE stream shows new standings change events within seconds of a score change during live games. `LIVE_POLL_EVENT` updates the "Updated X ago" timestamp. `CHANGE_LOG_EVENT` events appear as new rows in the feed.
- **Actual:** Points changes are not appearing live — the changelog page does not update in real time even when standings have changed.
- **Errors:** Unknown — user unavailable. Inferring from codebase.
- **Timeline:** Phase 82 was just implemented. The TypeScript build had a `roto_points` vs `overall_points` column mismatch (now fixed). Unknown if this feature has ever worked end-to-end.
- **Reproduction:** Open `/leagues/[id]/changelog` during game hours, trigger or wait for a live poll cycle — no new events appear in the feed.

## Evidence

_(populated by debugger)_

## Eliminated

_(populated by debugger)_

## Current Focus

hypothesis: "Unknown — needs investigation"
next_action: "gather initial evidence"
