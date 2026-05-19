---
status: fixed
trigger: "Make sure the projected standings and season outlook are aggregating current results and projections, not just projections"
created: "2026-05-19"
updated: "2026-05-19"
---

# Debug Session: projected-standings-only-proj

## Symptoms

- **Expected:** Projected standings and season outlook should combine current-to-date stats with rest-of-season projections using component math
- **Actual:** Was using projections only for rate stats, ignoring real accumulated stats
- **Errors:** None reported
- **Repro:** `/api/leagues/:id/standings/projected` and season outlook UI pages

## Resolution

root_cause: "writeCurrentStandings always wrote components_json: null to team_daily_category_totals. StandingsProjectionAgent fell back to {} for currentComponents on rate stats, so AVG/OBP/SLG/OPS/ERA/WHIP/K9 were computed from projections-only components."
fix: "Added buildCurrentComponents() module-level function in snapshot-orchestrator.ts that extracts rate stat components from ESPN valuesByStat. writeCurrentStandings now populates components_json for RATE categories using formulaId (AB=0, H=1, BB=10, HBP=12, SF=13, TB=8, ER=45, HA=37, BBA=39, OUTS/3=IP, K=48)."
verification: "Trigger a new snapshot and verify team_daily_category_totals.components_json is non-null for rate categories. Projected rate stats (AVG, ERA, etc.) should now reflect current actuals + projected RoS."
files_changed:
  - packages/backend/src/agents/snapshot-orchestrator.ts
