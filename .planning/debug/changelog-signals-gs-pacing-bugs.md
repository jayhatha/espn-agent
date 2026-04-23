---
status: investigating
slug: changelog-signals-gs-pacing-bugs
trigger: "Points changes aren't updating live on the Change Log page. This page should basically be streaming. Additionally, signals (trades and waivers) aren't loading and the GS pacing tab no longer has the UI for keeping track of my team's GS pace."
created: 2026-04-22
updated: 2026-04-22
---

# Debug Session: changelog-signals-gs-pacing-bugs

## Symptoms

- **Bug 1 — Changelog not streaming:** Change Log page should update live as points change during games. Even after Phase 82 fixes, the page shows "Connecting…" and events don't stream in.
- **Bug 2 — Signals (trades/waivers) not loading:** The Signals tab or page (trades and waivers recommendations) is returning no data or failing to render.
- **Bug 3 — GS pacing tab missing UI:** The Games Started pacing tab previously had a UI to track the team's GS pace; that UI is now gone.
- **Errors:** Unknown — need to inspect the relevant pages and APIs.
- **Timeline:** Issues surfaced around Phase 82 implementation. Previous debug session fixed `LIVE_POLL_ENABLED`, `ON CONFLICT DO NOTHING`, and frontend `seenIds` drop — unclear if those fixes landed properly or if there are additional issues.
- **Reproduction:** Open `/leagues/[id]/changelog` — "Connecting…" dot, no events. Open signals/recommendations page — no data. Open GS pacing tab — UI elements missing.

## Evidence

_(populated by debugger)_

## Eliminated

_(populated by debugger)_

## Current Focus

hypothesis: "Unknown — needs investigation across three separate subsystems"
next_action: "gather initial evidence from changelog SSE route, signals API, and GS pacing component"
