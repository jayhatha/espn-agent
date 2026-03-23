---
phase: 99-fix-trade-asv-filter-load-asv-from-tools
plan: 01
subsystem: api
tags: [trade, asv, static-data]

requires:
  - phase: 97-trade-recommendations
    provides: "ASV filter logic in TradeRecommendationAgent"
provides:
  - "Functional ASV filter using static JSON instead of always-NULL DB column"
affects: [trade-recommendation]

tech-stack:
  added: []
  patterns: ["Module-level lazy-loaded static data map with graceful degradation"]

key-files:
  created: []
  modified:
    - packages/backend/src/agents/trade-recommendation.ts

key-decisions:
  - "Load ASV from tools/espn-predraft-values.json via fs.readFileSync with lazy caching"
  - "Case-insensitive player name matching via lowercase Map keys"
  - "Keep espn_asv in SQL query to avoid breaking type inference"

requirements-completed: [TRADE-ASV-FIX]

duration: 1min
completed: 2026-03-23
---

# Quick Task 99: Fix Trade ASV Filter Summary

**Trade ASV filter now loads 160-player salary data from static JSON file instead of always-NULL DB column, enabling realistic trade pair filtering by salary similarity**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-23T22:11:55Z
- **Completed:** 2026-03-23T22:12:51Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

### Task 1: Load static ASV data and replace DB column lookups

Added module-level ASV lookup mechanism to `trade-recommendation.ts`:

- `loadAsvMap()` reads `tools/espn-predraft-values.json`, builds a `Map<string, number>` keyed by lowercase player name, caches result for subsequent calls
- `getAsvForPlayer()` helper returns salary or null for graceful degradation
- Replaced both ASV lookup sites (pre-filter at line ~518 and post-simulation display at line ~608) to use static file instead of `givePlayer.espn_asv` DB column
- Existing filter logic unchanged: pairs within 30% OR $5 pass, others skipped
- Players not in JSON file skip the filter gracefully (no penalty for missing data)

**Commit:** `1dd596d`

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript compiles cleanly (`npx tsc --noEmit` passes)
- `getAsvForPlayer` wired at both call sites (confirmed via grep)
- `espn-predraft-values.json` path reference exists in source
