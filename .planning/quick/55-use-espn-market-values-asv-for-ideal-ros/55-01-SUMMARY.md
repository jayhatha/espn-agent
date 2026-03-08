---
phase: 55-use-espn-market-values-asv-for-ideal-ros
plan: 01
subsystem: ui
tags: [extension, draft-engine, ideal-roster, auction, espn-asv]

# Dependency graph
requires:
  - phase: 29-ideal-roster-optimizer
    provides: computeIdealRoster function and optimizeRoster greedy knapsack optimizer
  - phase: 30-extension-perf-audit
    provides: engine/index.ts with computeIdealRoster, computeRosterOptimization, espnDomAuctionValues
provides:
  - computeIdealRoster with ESPN ASV price overlay applied before optimizeRoster
  - budgetUsed in IdealRosterSignal reflects estimated market cost (ASV-based)
  - nameToAsvIdeal map built from espnDomAuctionValues + auctionValues in computeIdealRoster
affects: [ideal-roster-ui, draft-sidebar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ASV overlay pattern: build nameToAsvIdeal map, create spread copies with dollars=asv, pass overlaid array to optimizer
    - normalizedName matching for result.roster entries when spread copies break object identity

key-files:
  created: []
  modified:
    - packages/extension/lib/engine/index.ts

key-decisions:
  - "Use normalizedName matching (not indexOf) when recovering originals from result.roster after ASV overlay spreads break object identity"
  - "budgetUsed from optimizeRoster reflects ASV market prices (correct — shows actual cost), while IdealRosterPlayer.dollars always shows FanGraphs projected value for tier display"
  - "Skip ASV overlay entirely when nameToAsvIdeal.size === 0, passing allPlayers unchanged for zero-cost fallback"

patterns-established:
  - "ASV overlay pattern: build Map<normalizedName, asv>, spread-copy players with dollar override, recover originals by normalizedName after optimizer returns"

requirements-completed: [IDEAL-ROSTER-ASV]

# Metrics
duration: 5min
completed: 2026-03-07
---

# Quick Task 55: Use ESPN Market Values (ASV) for Ideal RoS Summary

**ESPN ASV overlaid onto PoolPlayer.dollars in computeIdealRoster so budget constraint and SGP/$ efficiency use real market prices instead of FanGraphs projections**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-07T00:00:00Z
- **Completed:** 2026-03-07T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Built `nameToAsvIdeal` map from `espnDomAuctionValues` + `auctionValues` inside `computeIdealRoster`
- Created price-overlaid player copies (spread with `dollars = ASV`) only when ASV is populated
- Passed overlaid array to `optimizeRoster` so budget affordability check and SGP/$ efficiency sort use market prices
- Switched `optimizerPlayers` mapping from `allPlayers.indexOf(player)` to `normalizedName` lookup, preserving FanGraphs dollars for tier display
- `budgetUsed` in `IdealRosterSignal` now reflects estimated market cost (ASV-based) when ASV is available
- Falls back to `allPlayers` unchanged when no ESPN ASV is populated (no behavioral change)

## Task Commits

1. **Task 1: Overlay ESPN ASV onto PoolPlayer.dollars in computeIdealRoster** - `72eab3e` (feat)

## Files Created/Modified
- `packages/extension/lib/engine/index.ts` - Added ASV overlay step in computeIdealRoster; switched optimizerPlayers mapping to normalizedName-based original recovery

## Decisions Made
- Use `normalizedName` matching when recovering original allPlayers entries from `result.roster` — spread copies (`{ ...p, dollars: asv }`) are new objects and won't `===` the originals, so `indexOf` would return -1
- Keep `budgetUsed` as ASV-based (market cost) — this is the correct semantic: the ideal roster tab shows how much the ideal roster would actually cost at auction
- `IdealRosterPlayer.dollars` always shows FanGraphs projected value (not ASV) so tier classification ("anchor" > $20, "core" $5-20, "value" < $5) remains based on player quality, not market price

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in unrelated files (WXT entrypoint globals, test files, api-client) — confirmed zero errors in `lib/engine/index.ts` specifically

## Next Phase Readiness
- Ideal Roster tab will now show realistic market-cost budget estimates when ESPN ASV is scraped from the DOM during a draft
- Players with high FanGraphs value but low ESPN ASV will appear more often (affordable at market price); high-ASV low-FG players will appear less

---
*Phase: 55-use-espn-market-values-asv-for-ideal-ros*
*Completed: 2026-03-07*
