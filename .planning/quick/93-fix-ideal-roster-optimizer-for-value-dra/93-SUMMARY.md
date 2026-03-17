---
phase: 93-fix-ideal-roster-optimizer-for-value-dra
plan: 93
subsystem: extension-engine
tags: [roster-optimizer, ideal-roster, sgp, value-drafting, sp-tier-caps]
dependency_graph:
  requires: []
  provides: [value-oriented-ideal-roster]
  affects: [packages/extension/lib/engine/roster-optimizer.ts, packages/extension/lib/engine/index.ts]
tech_stack:
  added: []
  patterns: [greedy-knapsack-optimizer, sp-tier-cap-enforcement, raw-sgp-efficiency]
key_files:
  created: []
  modified:
    - packages/extension/lib/engine/roster-optimizer.ts
    - packages/extension/lib/engine/index.ts
decisions:
  - "Remove Phase 4 upgrade pass: greedy SGP/$ fill already produces value-oriented roster; remaining budget better left as savings"
  - "SP tier cap enforcement in both Phase 3 and Phase 3b: primary pass skips violators, backfill falls back to cheapest only when no compliant candidates exist"
  - "Use raw SGP (no rank boost) in ideal roster: rank boost biases toward expensive stars; retained only in bid-optimizer"
  - "Use FanGraphs model dollars (no ASV overlay) in ideal roster: ASV inflates market prices; model values reflect true SGP/$ efficiency"
metrics:
  duration: 8 minutes
  completed: 2026-03-16
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 93: Fix Ideal Roster Optimizer for Value Drafting Summary

**One-liner:** Value-oriented roster optimizer using raw SGP/FanGraphs dollars with SP tier caps, removing Phase 4 star upgrades and ASV/rank-boost inflation.

## What Was Done

Fixed four issues causing the ideal roster to recommend expensive stars instead of efficient value picks:

1. **Phase 4 budget upgrade pass removed** — The upgrade pass sorted cheapest greedy picks and replaced them with more expensive high-SGP alternatives. This directly undermined value drafting by swapping efficient cheap picks for expensive stars. The greedy SGP/$ fill from Phase 3 already produces a value-oriented roster; leftover budget is now preserved as savings.

2. **SP tier caps added to Phase 3 greedy fill** — When the optimizer assigns an SP or P slot, it now calls `getSpTierCap(spCount)` and skips candidates whose `player.dollars` exceeds the cap. `spCount` is initialized after Phase 1 by counting locked player SP/P slot assignments, then incremented each time a SP/P slot is filled.

3. **SP tier caps added to Phase 3b backfill** — Backfill now prefers tier-cap-compliant candidates (cheapest within cap), falling back to the overall cheapest only when no compliant candidate exists (ensuring roster completeness).

4. **Rank boost multiplier removed from `computeIdealRoster`** — Replaced `computeExternalRankBoost(extRank) * rawSgp` with `sgpValuesRaw[i]` directly. Rank boost biases toward expensive top-ranked players; ideal roster should evaluate true model efficiency. Rank boost remains in the bid-optimizer path.

5. **ASV overlay removed from `computeIdealRoster`** — Replaced the entire `nameToAsvIdeal` map construction with `const playersForOptimizer = allPlayers`. FanGraphs model dollars are used for SGP/$ efficiency sorting, reflecting true projected value rather than inflated ESPN market prices. ASV overlay remains in the bid-optimizer path.

## Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Remove Phase 4, add SP tier cap enforcement | 5a60a91 | roster-optimizer.ts |
| 2 | Skip rank boost and ASV overlay in computeIdealRoster | 1768f8a | index.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript compiles with no new errors in modified files
- Extension builds successfully (1.24 MB output)
- `grep -n "Phase 4" roster-optimizer.ts` returns nothing
- `grep -n "getSpTierCap" roster-optimizer.ts` shows import at line 13 and usage at lines 220 and 262
- `grep -n "nameToAsvIdeal" index.ts` returns nothing
- `computeExternalRankBoost` remains imported and called at line 334 (bid-optimizer path only)

## Self-Check: PASSED

- [x] packages/extension/lib/engine/roster-optimizer.ts modified and committed (5a60a91)
- [x] packages/extension/lib/engine/index.ts modified and committed (1768f8a)
- [x] Extension build passes
- [x] No Phase 4 block in roster-optimizer.ts
- [x] SP tier cap enforced in Phase 3 and Phase 3b
- [x] No rank boost in computeIdealRoster
- [x] No ASV overlay in computeIdealRoster
