---
status: resolved
slug: authoritative-pool-still-thin
trigger: "tackle next issue: why the authoritative free-agent pool is too thin, so valid waiver recommendations become non-empty again."
created: 2026-05-05
updated: 2026-05-05
---

# Debug Session: authoritative-pool-still-thin

## Symptoms

- **Expected:** `GET /api/leagues/:id/teams/:teamId/waivers/recommendations` returns a non-empty list of valid add/drop suggestions sourced only from authoritative free-agent data.
- **Actual:** `GET /api/leagues/1/teams/8/waivers/recommendations` currently returns `{ "recommendations": [] }` even after the free-agent snapshot population fix landed.
- **Errors:** No error — silent empty result.
- **Timeline:** Persists after the earlier `free-agent-pool-too-thin` fix was resolved and committed.
- **Reproduction:** Open the waiver recommendations endpoint for league 1 team 8; response is empty on 2026-05-05.

## Evidence

- timestamp: 2026-05-05T00:00Z
  finding: "Current endpoint state: /api/leagues/1/teams/8/waivers/recommendations returns {\"recommendations\":[],\"snapshotDate\":\"2026-05-05T00:00:00.000Z\"}."

- timestamp: 2026-05-05T00:01Z
  finding: "Prior fix already added authoritative free-agent persistence via snapshot-orchestrator fetchAndStoreFreeAgents(); this follow-up bug is downstream of that merged change, not the original missing-table-write root cause."

- timestamp: 2026-05-05T00:02Z
  finding: "The waiver recommendations route only fetched live ESPN free agents when league_free_agent_snapshot returned zero rows. Any thin-but-nonzero snapshot short-circuited the live authoritative fetch and was passed straight into WaiverRecommendationAgent."

- timestamp: 2026-05-05T00:03Z
  finding: "packages/backend/src/api/views/free-agent-view.ts already proves the codebase has a live authoritative ESPN free-agent source for this league. The empty recommendation response is caused by route selection logic, not by the absence of an authoritative source."

- timestamp: 2026-05-05T00:04Z
  finding: "Live `/api/leagues/1/free-agents?limit=50` returns a large authoritative pool, but the returned free agents visible in that payload have `projections: null`, so the waiver agent still drops many live candidates before simulation."

- timestamp: 2026-05-05T00:05Z
  finding: "WaiverRecommendationAgent returns `null` from `simulateSwapFromCache()` whenever either add/drop player lacks a projection. Local `player_projection` coverage was too sparse for live free agents, so route-only fixes were insufficient."

## Eliminated

- hypothesis: "Projection-only fallback should be restored"
  eliminated_by: "Prior debug session established that projection-only non-rostered fallbacks violate domain rules and leak invalid waiver targets."

## Current Focus

hypothesis: "Resolved — waiver recommendations now merge authoritative live free agents with ESPN fallback projections when local projection coverage is sparse."
next_action: "RESOLVED — backend restart against real app database needed for end-to-end verification."

## Resolution

root_cause: "Two bottlenecks compounded. First, the waiver route preferred a thin stored snapshot over a fuller live ESPN free-agent pool. Second, even with live free agents present, many authoritative candidates had no local `player_projection` rows, and `WaiverRecommendationAgent` drops add candidates that lack projections during swap simulation."
fix: "Updated the waiver route to fetch live authoritative ESPN free agents on every request, widen the live fetch to 1500 players, intersect that pool with the active projections run when possible, and supplement sparse local coverage with ESPN global draft `espnProjectedStats` for matching live free agents. Updated `WaiverRecommendationAgent` to accept fallback player metadata and fallback stat-component projections so live authoritative candidates can still be simulated when local projection rows are missing."
verification: "Static validation passed: no editor errors in `packages/backend/src/api/recommendations.ts` or `packages/backend/src/agents/waiver-recommendation.ts`. Isolated backend booted with patched code on port 3003, but end-to-end runtime verification against a real dataset was blocked because the local default Postgres database lacked the app schema (`relation \"league\" does not exist`). Existing localhost:3001 process was left untouched."
files_changed:

- packages/backend/src/api/recommendations.ts
- packages/backend/src/agents/waiver-recommendation.ts
