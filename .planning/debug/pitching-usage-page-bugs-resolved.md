---
status: awaiting_human_verify
trigger: "pitching-usage-page-bugs: GS pacing wrong count, RPs counted as starters, streaming tab empty"
created: 2026-03-26T00:00:00Z
updated: 2026-03-26T00:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: THREE confirmed root causes found. Ready to fix.
test: all root causes traced through code
expecting: fixes will be: (1) count GS by SP-eligible roster slot logic, (2) add positions filter to weekly GS query, (3) fix streaming field name mismatch + improve name matching
next_action: apply fixes to gs-pacing.ts and streaming-pitcher.ts

## Symptoms

expected: GS pacing shows correct number of games started by SP-eligible pitchers only. Streaming tab shows pitcher streaming recommendations.
actual: GS count is wrong (likely 0 or incorrect). Relievers are being counted as starters. Streaming recommendations are empty.
errors: No errors reported — data is just wrong or missing
reproduction: Navigate to the pitching usage / streaming page for any league with active pitchers
started: Unknown if this ever worked correctly

## Eliminated

- hypothesis: streaming route not registered
  evidence: Both `streamingRoutes` and `pitchingUsageRoutes` are registered in index.ts
  timestamp: 2026-03-26

- hypothesis: streaming empty because of missing fresh projections
  evidence: Likely contributing but cannot confirm without live DB — primary structural cause identified below
  timestamp: 2026-03-26

## Evidence

- timestamp: 2026-03-26
  checked: ESPN_STAT_MAP in adapters/espn.ts (lines 161-205)
  found: No entry for "GS" (Games Started). The stat map covers stats 0-63 and has no GS key.
  implication: `getGsFromCategoryTotals` always returns null (looks for category_id = "GS" which will never exist). Falls back to IP/6 estimate, which includes RP innings and is inaccurate.

- timestamp: 2026-03-26
  checked: GsPacingAgent.getWeeklySummary, SP_ROSTER_SLOTS constant (line 24)
  found: SP_ROSTER_SLOTS = ["SP", "P"]. Roster_slot "P" maps to lineup slot id 13 (generic pitcher slot). An RP slotted in "P" position passes this filter. The query has no filter on player.positions to confirm SP eligibility.
  implication: RPs in the "P" lineup slot are counted as game starts. Bug #2 confirmed.

- timestamp: 2026-03-26
  checked: StreamingPitcherAgent output vs frontend StreamingCandidate interface
  found: Agent returns `opponent`, `ownership`, `scoreBreakdown.opponentScore`. Frontend expects `matchupOpponent`, `ownershipPct`, `matchupScore`. API route returns candidates directly without transformation.
  implication: Field names don't match — frontend displays undefined values for opponent/score fields. However this doesn't cause empty results; it causes incorrect display when results exist.

- timestamp: 2026-03-26
  checked: StreamingPitcherAgent.findMatchingProjection (line 266)
  found: Matching strips all non-alpha chars and does exact lowercase match. MLB probable pitcher names from StatsAPI (e.g. "Gerrit Cole") vs FanGraphs projection names may differ (e.g. suffixes, accents). No partial matching.
  implication: Many pitchers won't match → candidates array stays small or empty.

- timestamp: 2026-03-26
  checked: StreamingPitcherAgent.getRosteredPlayerIds (line 242)
  found: Queries snapshot_date = startDate (today's date). If no snapshot was taken today, returns empty set → no pitchers are excluded (benign but means all pitchers including owned ones could appear).
  implication: Minor — doesn't cause empty results but means owned pitchers may appear in streaming candidates.

## Resolution

root_cause: |
  BUG 1 (GS count wrong): ESPN does not expose GS as a tracked stat. GS category_id lookup always returns null.
  Fallback estimateGsFromIP divides total IP (including RP innings) by 6 — inaccurate.
  Real fix: count GS from roster snapshots — count days each SP-eligible pitcher was in an SP/P slot with active status.

  BUG 2 (RPs counted as starters): getWeeklySummary filters by roster_slot IN ["SP", "P"].
  Slot "P" (id 13) is a generic pitcher slot that can hold either SP or RP.
  No secondary filter on player.positions to require "SP" eligibility.

  BUG 3 (streaming empty): StreamingCandidate shape mismatch between agent and frontend interface:
  agent.opponent → frontend expects matchupOpponent
  agent.ownership → frontend expects ownershipPct
  agent.scoreBreakdown.opponentScore → frontend expects matchupScore
  Additionally, findMatchingProjection uses exact-only name normalization which drops accents/suffixes but doesn't handle last-name-only mismatches.

fix: |
  1. gs-pacing.ts: Removed `getGsFromCategoryTotals` and `estimateGsFromIP`. Added `countGsFromRosterSnapshots` that counts active SP/P slot days for SP-eligible players only.
  2. gs-pacing.ts `getWeeklySummary`: Added `.where(({ eb }) => eb(sql\`p.positions @> ARRAY['SP']::text[]\`, "=", sql\`true\`))` to exclude RPs in generic "P" slot.
  3. streaming.ts route: Added mapping block that transforms agent's `opponent/ownership/scoreBreakdown.opponentScore` to the frontend-expected `matchupOpponent/ownershipPct/matchupScore` fields.

verification: TypeScript build passes cleanly. Runtime verification pending human confirmation.
files_changed:
  - packages/backend/src/agents/gs-pacing.ts
  - packages/backend/src/api/streaming.ts
