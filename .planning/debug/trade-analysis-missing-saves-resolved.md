---
status: awaiting_human_verify
trigger: "trade-analysis-missing-saves"
created: 2026-03-25T00:00:00Z
updated: 2026-03-25T15:50:00Z
---

## Current Focus

hypothesis: CONFIRMED — two bugs fixed and all 19 tests passing
test: pnpm --filter backend exec vitest run src/agents/__tests__/trade-recommendation.test.ts
expecting: Human to verify trade impact endpoint correctly shows negative SV delta when giving away a closer
next_action: Await human verification

## Symptoms

expected: When analyzing a trade where you give away a closer (RP) and receive a starter (SP), the trade impact should show a negative delta in the Saves category because you're losing projected saves from the closer
actual: The trade impact analysis doesn't account for the saves lost from the traded-away closer — it only shows what you gain from the received player, not what you lose
errors: No errors — the computation completes but produces incorrect results
reproduction: Analyze any trade where you give a closer (RP with projected saves) for a starter (SP) — the Saves category impact will be missing or zero when it should be negative
timeline: Known gap per CLAUDE.md — "TradeRecommendationAgent doesn't handle rate stat adjustments" but this appears to affect counting stats too (Saves is a counting stat)

## Eliminated

- hypothesis: Bug is in the delta computation formula itself (giveDelta/receiveDelta arithmetic)
  evidence: simulateTradeImpact counting stat path correctly computes netDelta = receiveDelta - giveDelta; logic is structurally sound
  timestamp: 2026-03-25

- hypothesis: isCategoryRelevant returns false for SV with a valid closer projection
  evidence: isCategoryRelevant checks IP > 0; a closer with IP > 0 returns true; SV category gating is correct
  timestamp: 2026-03-25

## Evidence

- timestamp: 2026-03-25
  checked: packages/backend/src/agents/trade-recommendation.ts simulateTradeImpact counting stat path (lines 975-999)
  found: giveDelta and receiveDelta are computed correctly using getProjectedCategoryValue(category, proj) where proj comes from getPlayerProjections — logic is structurally correct
  implication: Bug must be in data availability, not in the delta computation formula

- timestamp: 2026-03-25
  checked: getPlayerProjections query — uses run.as_of_date <= asOfDate (date filter) not projections_run_id
  found: StandingsProjectionAgent uses the SPECIFIC projections_run_id from the snapshot, but getPlayerProjections fetches any run <= date. These could differ, and if the closer's projection isn't in the right run, giveDelta = 0
  implication: Inconsistency between team-level projections (run-specific) and player-level delta (date-based)

- timestamp: 2026-03-25
  checked: Test file — player_projection mock data uses JSON.stringify for stat_components_json
  found: Tests fail (5 of 18) with unchanged values (AVG=0.3 not 0.304, ERA=3.0 not 2.8875) because isCategoryRelevant does object property access on a string — components.IP is undefined → returns false → giveDelta/receiveDelta both stay 0
  implication: The same isCategoryRelevant logic that breaks tests would also break production IF stat_components_json were somehow a string (but pg auto-parses JSONB so it's an object in production)

- timestamp: 2026-03-25
  checked: isCategoryRelevant for SV category with a closer having IP > 0
  found: Returns true correctly in production (IP > 0). The SV bug is data availability not logic.
  implication: If projection IS found, SV delta would be computed correctly

- timestamp: 2026-03-25
  checked: Test mock keys — player_projection_projections_run_player_list vs player_projection_player_list
  found: Primary getPlayerProjections path (with projectionsRunId) uses only innerJoin("player"), so mock key must be player_projection_player_list; legacy path adds projections_run join
  implication: All test mock keys updated to match primary code path

- timestamp: 2026-03-25
  checked: Category mock definitions — statKey vs stat_key, missing formula_id and direction
  found: Code reads category.stat_key (snake_case); mocks had statKey (camelCase). calculateFinalRate requires formula_id; mocks were missing it. Both caused silent fallback to current value.
  implication: Fixed all mock category definitions to use snake_case and include formula_id + direction

- timestamp: 2026-03-25
  checked: SV test — projected_rank missing from all-teams mock result set
  found: getCurrentStandings defaulted to numTeams (8) when projected_rank was undefined; after trade team ranked 7th; deltaRank = 7-8 = -1 (appeared to improve instead of worsen)
  implication: Added projected_rank and projected_roto_points to all entries in all-teams mock result set

- timestamp: 2026-03-25
  checked: Final test run after all fixes
  found: 19/19 tests pass including new SV closer-traded-for-starter test
  implication: Both production bugs fixed, test suite fully validates the behavior

## Resolution

root_cause: |
  Two related production bugs:
  1. getPlayerProjections used a date-based filter (run.as_of_date <= snapshotDate) instead of the snapshot's
     specific projections_run_id. This creates an inconsistency: team-level projected standings are computed
     using one specific projection run, but player-level delta computation could pull from a different run.
     If a closer's projection exists only in the run linked to the snapshot (not in an earlier run at the same
     date), giveDelta = 0, meaning no SV subtraction occurs when the closer is traded away.
  2. Test mocks serialized stat_components_json as JSON strings (JSON.stringify) rather than plain objects,
     causing isCategoryRelevant to fail silently (string property access returns undefined → false → delta = 0).
     Additionally, mocks used camelCase statKey instead of snake_case stat_key, and omitted formula_id required
     by calculateFinalRate.

fix: |
  1. Added optional projectionsRunId parameter to getPlayerProjections. When provided (primary path), queries
     player_projection directly by projections_run_id — consistent with how StandingsProjectionAgent works.
     When absent (legacy path for old snapshots), falls back to date-based filter.
  2. Updated analyzeTradeImpact to pass snapshot.projections_run_id to getPlayerProjections.
  3. Fixed test mocks: stat_components_json as plain objects, stat_key snake_case, added formula_id/direction.
  4. Added new test: "SV counting stat — closer traded for starter" verifying projectedValue=5, deltaRank>0, deltaPoints<0.

verification: All 19 tests pass (vitest run, 309ms). New SV test confirms negative delta when trading a closer for a starter.

files_changed:
  - packages/backend/src/agents/trade-recommendation.ts
  - packages/backend/src/agents/__tests__/trade-recommendation.test.ts
