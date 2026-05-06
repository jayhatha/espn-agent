---
status: fixed
slug: trades-need-equivalent-value
trigger: "Trades need to be based on equivalent or close-to-equivalent value. Weigh ESPN's ASV/ADP (80%) and the price the player was drafted for in the current league (20%)."
created: 2026-05-05
updated: 2026-05-05
---

# Debug Session: trades-need-equivalent-value

## Symptoms

- **Expected:** Trade recommendations should prefer candidates with roughly equivalent value using a weighted fairness signal: ESPN ASV/ADP at 80% and the player's actual draft price in the current league at 20%.
- **Actual:** Trade recommendations are reported to ignore or underweight this equivalent-value rule.
- **Errors:** No concrete UI, network, or backend error reported.
- **Timeline:** Reported on 2026-05-05 after prior trade recommendation availability fixes.
- **Reproduction:** Open trade recommendations and inspect suggested trades; recommendations are not constrained tightly enough to equivalent or near-equivalent value.

## Evidence

- timestamp: 2026-05-05T00:00:00Z
  finding: Trade recommendation candidate generation only applied an ASV floor and then sorted by projected roto gain, so league-specific draft price never influenced equivalence.
  source: packages/backend/src/agents/trade-recommendation.ts
- timestamp: 2026-05-05T00:05:00Z
  finding: team_roster_snapshot stores acquisition_type but not draft cost, while archived ESPN raw payloads retain draftDetail in league_raw_payload.response_json.
  source: packages/backend/src/db/migrations/001_initial_schema.sql, packages/backend/src/adapters/espn.ts

## Eliminated

- Existing trade roster query already selected player.espn_asv, so this was not a missing field select.
- team_roster_snapshot could not provide draft price directly because schema does not persist it.

## Current Focus

hypothesis: "Equivalent-value rule was unimplemented at recommendation time: ASV was used as a coarse filter, but current-league draft cost was never read even though draftDetail is archived in raw payloads."
next_action: "patched"

## Resolution

status: fixed
root_cause: Trade recommendations only used an ASV-only equivalence floor and ignored current-league draft price, so close-value trades were not ranked or filtered by the requested 80/20 signal.
fix: TradeRecommendationAgent now extracts draft prices from the latest archived ESPN raw payload, computes an 80/20 ASV-plus-draft-cost equivalence ratio, filters out lopsided candidates, and ranks survivors by value similarity before roto gain.
verification:
- pnpm exec vitest run src/agents/__tests__/trade-recommendation.test.ts
files_changed:
- packages/backend/src/agents/trade-recommendation.ts
- packages/backend/src/agents/__tests__/trade-recommendation.test.ts
- .planning/debug/trades-need-equivalent-value.md
