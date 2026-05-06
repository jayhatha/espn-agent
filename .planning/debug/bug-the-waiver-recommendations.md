---
status: resolved
slug: bug-the-waiver-recommendations
trigger: "Bug: The waiver recommendations are not limited to free agents."
created: 2026-05-05
updated: 2026-05-05
---

# Debug Session: bug-the-waiver-recommendations

## Symptoms

- **Expected:** Waiver recommendations should only recommend players who are actual free agents for the league snapshot / live ESPN free-agent pool.
- **Actual:** Waiver recommendations included players who were not in the league free-agent pool.
- **Errors:** No backend exception; endpoint returned structurally valid recommendations with invalid add targets.
- **Timeline:** Reported on 2026-05-05 after the prior waiver/trade empty-results fix.
- **Reproduction:** Open waiver recommendations and inspect recommended add players; at least some recommended add players are not valid free agents.

## Evidence

- timestamp: 2026-05-05T23:10Z
  observation: packages/backend/src/agents/waiver-recommendation.ts built a free-agent list from snapshot/live/raw sources, then unconditionally merged top projected non-rostered players via mergeProjectionFallbackFreeAgents.
- timestamp: 2026-05-05T23:12Z
  observation: Local validation showed addPlayerId 39832 (Shohei Ohtani) and 33192 (Aaron Judge) in waiver recommendations while the current /api/leagues/1/free-agents pool did not include them.
- timestamp: 2026-05-05T23:26Z
  observation: After removing projection fallback and restarting espn-backend, behavior validation returned invalid: [] for waiver recommendation add targets against the current free-agent endpoint.

## Eliminated

- Frontend team selection or rendering bug.
- Route-level HTTP/auth failure.
- Missing snapshot/projections baseline causing malformed recommendations.
- Free-agent endpoint inconsistency; live pool returned 300 players and excluded leaked add targets.

## Current Focus

hypothesis: "Resolved"
next_action: "None"

## Root Cause

WaiverRecommendationAgent treated projection-only, non-rostered players as waiver candidates.

After building an authoritative free-agent pool from snapshot/live/raw sources, it also appended top projected non-rostered players through the projection fallback path, which let rostered stars like Shohei Ohtani and Aaron Judge appear as waiver adds.

## Fix

- Removed projection-based free-agent fallback from WaiverRecommendationAgent.
- Removed unconditional merge of projected non-rostered players into the waiver candidate pool.
- Added a warning when no authoritative free-agent pool is available instead of fabricating waiver candidates.

## Verification

- pnpm --filter "@espn-fantasy/backend" exec tsc --noEmit still fails only on the pre-existing unrelated error in packages/backend/src/db/migrate.ts (getAppliedVersions).
- node .tmp/check-waiver-free-agents.js after backend restart returned invalid: [], confirming waiver add targets are constrained to the current free-agent pool.

## Files Changed

- packages/backend/src/agents/waiver-recommendation.ts
