---
status: awaiting_human_verify
trigger: "standings-string-concatenation"
created: 2026-03-26T00:00:00Z
updated: 2026-03-26T00:02:00Z
---

## Current Focus

hypothesis: CONFIRMED AND FIXED
test: Applied pg numeric type parser in connection.ts + Number() guards in standings-projection.ts
expecting: User to verify projected standings now show correct numeric sums after next snapshot run
next_action: Await human verification

## Symptoms

expected: Projected standings = current values + projected remaining (numeric addition, e.g. 50 + 30 = 80)
actual: Values appear concatenated as strings (e.g. "50" + "30" = "5030")
errors: No errors — computation completes but produces incorrect values
reproduction: Check standings projection computation where current category totals are combined with projected remaining stats
started: Unknown — may have always been present, or introduced recently

## Eliminated

(none — root cause found directly on first hypothesis)

## Evidence

- timestamp: 2026-03-26T00:00:30Z
  checked: packages/backend/src/db/migrations/001_initial_schema.sql
  found: team_daily_category_totals.value is NUMERIC NOT NULL; also roto_points NUMERIC, overall_points NUMERIC, projected_value NUMERIC, projected_roto_points NUMERIC, projected_overall_points NUMERIC
  implication: node-postgres returns NUMERIC as string by default — no precision loss at the JS boundary (unlike FLOAT8)

- timestamp: 2026-03-26T00:00:45Z
  checked: packages/backend/src/db/connection.ts
  found: Pool is created with no pg.types.setTypeParser calls; zero type parser overrides
  implication: All NUMERIC columns come back as strings — confirming the concatenation bug

- timestamp: 2026-03-26T00:01:00Z
  checked: packages/backend/src/agents/standings-projection.ts line 174
  found: const finalValue = (currentTotal?.value || 0) + projectedSum; — currentTotal.value is a string "50", projectedSum is a JS number 30, JS + operator concatenates giving "5030"
  implication: This is the exact concatenation site; same pattern applies to any consumer of NUMERIC columns

- timestamp: 2026-03-26T00:01:30Z
  checked: packages/backend/src/agents/trade-recommendation.ts lines 763-764
  found: Already has explicit Number(proj.projected_value) guards — was partially worked around in the trade agent but not in standings agent
  implication: Confirms the bug was known/encountered but not fixed at the root (connection.ts)

## Resolution

root_cause: PostgreSQL NUMERIC columns (value, roto_points, overall_points, projected_value, projected_roto_points, projected_overall_points) are returned as JavaScript strings by node-postgres when no type parser is registered for OID 1700 (numeric). The connection.ts file had no such parser. In standings-projection.ts, (currentTotal?.value || 0) + projectedSum performed string concatenation instead of numeric addition because currentTotal.value was a string like "50".
fix: |
  1. packages/backend/src/db/connection.ts — Added types.setTypeParser(1700, parseFloat) to globally coerce all NUMERIC columns to JS numbers for every query in the app.
  2. packages/backend/src/agents/standings-projection.ts — Added Number() coercions at both currentTotal?.value arithmetic sites (line 174 counting path, line 214 degraded rate fallback) as defense-in-depth.
verification:
files_changed:
  - packages/backend/src/db/connection.ts
  - packages/backend/src/agents/standings-projection.ts
