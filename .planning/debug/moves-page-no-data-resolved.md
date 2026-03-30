---
status: awaiting_human_verify
trigger: "moves-page-no-data"
created: 2026-03-25T00:00:00Z
updated: 2026-03-25T00:15:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — hardcoded April 1 season start date excluded all pre-season (March) snapshots
test: replaced all 04-01/10-31 bounds with 01-01/12-31 in both agent and API files
expecting: deriveRosterMoves will now find March snapshots; computeImpacts will store impacts; moves page will show data
next_action: user verification — click Compute Impacts on moves page and confirm data appears

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Moves page should show FAAB transactions/moves from yesterday's waiver run
actual: Moves page shows no data — empty
errors: Unknown — user did not report specific errors
reproduction: Navigate to the moves page for a league that had a FAAB run yesterday
started: unclear if it ever worked

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: Season defaults still hardcoded to 2025
  evidence: Phase 71 completed yesterday (2026-03-24) — all 4 hardcoded 2025 values replaced with new Date().getFullYear()
  timestamp: 2026-03-25T00:08:00Z

- hypothesis: Frontend missing Compute Impacts button / no way to trigger computation
  evidence: Phase 71 task 2 added the button; frontend code at line 225-236 confirms it exists
  timestamp: 2026-03-25T00:08:00Z

- hypothesis: transaction-impacts/compute endpoint is admin-only and blocked
  evidence: Comment in 71-01-PLAN.md says "requireAdmin middleware is already a no-op (auth bypassed for single-user mode)"
  timestamp: 2026-03-25T00:08:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-03-25T00:05:00Z
  checked: packages/backend/src/agents/transaction-impact.ts deriveRosterMoves (line 38-46)
  found: startDate was `${season}-04-01`, query on team_roster_snapshot required snapshot_date >= "2026-04-01"
  implication: All March 2026 snapshots excluded — zero snapshots found — zero moves derived

- timestamp: 2026-03-25T00:05:00Z
  checked: packages/backend/src/api/transaction-impact.ts GET /teams/:teamId/transaction-impacts (line 68-101)
  found: Same date bounds applied to query on transaction_impact table
  implication: Even if transaction_impact rows existed with March dates, they would not be returned

- timestamp: 2026-03-25T00:05:00Z
  checked: packages/backend/src/api/transaction-impact.ts GET league-summary (line 180-212)
  found: Same 04-01 to 10-31 bounds, plus move_type != 'draft' filter
  implication: League summary tab also empty for pre-season period

- timestamp: 2026-03-25T00:05:00Z
  checked: packages/backend/src/agents/transaction-impact.ts computeShapleyImpacts (line 836-845)
  found: Same 04-01 to 10-31 bounds on roster_move table query
  implication: computeShapleyImpacts would not find March moves even if deriveRosterMoves stored them

- timestamp: 2026-03-25T00:06:00Z
  checked: Today's date per system context
  found: Today is 2026-03-25 — before April 1
  implication: MLB season hasn't started; all user snapshots are from March 2026; all blocked by 04-01 gate

- timestamp: 2026-03-25T00:13:00Z
  checked: TypeScript compilation after fix
  found: npx tsc --noEmit -p packages/backend/tsconfig.json — zero errors
  implication: Fix is type-safe

- timestamp: 2026-03-25T00:13:00Z
  checked: grep for remaining 04-01/10-31 in backend/src
  found: zero matches — all instances replaced
  implication: Fix is complete and consistent

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: All date-range queries in TransactionImpactAgent and transaction-impact API routes used hardcoded season bounds of ${season}-04-01 to ${season}-10-31. Today (2026-03-25) is before April 1, so every snapshot taken during pre-season testing was excluded. deriveRosterMoves found 0 snapshots, derived 0 moves, stored 0 impacts. All display queries also returned empty results for the same reason.

fix: Changed start date from April 1 to January 1 and end date from October 31 to December 31 (${season}-01-01 through ${season}-12-31) in both packages/backend/src/agents/transaction-impact.ts (8 instances) and packages/backend/src/api/transaction-impact.ts (6 instances / 3 pairs).

verification: TypeScript compilation passes. Need user to restart backend, click Compute Impacts, and confirm moves appear.

files_changed:
  - packages/backend/src/agents/transaction-impact.ts
  - packages/backend/src/api/transaction-impact.ts
