# Plan 70-01 Summary: Backend Trends API

**Phase:** 70-trends-and-efficiency
**Plan:** 01
**Status:** Complete
**Duration:** ~5 min
**Commit:** bf3b599

## What Was Built

Two new Fastify API endpoints for player trend analysis:

1. **GET /api/leagues/:leagueId/teams/:teamId/trends/hot-cold** -- Computes 7-day rolling stats vs season baseline for every rostered player. Classifies each as hot/cold/neutral/insufficient with driving stat labels (OPS surge, HR burst, K spike, ERA drop, OPS decline, ERA spike).

2. **GET /api/leagues/:leagueId/teams/:teamId/trends/lineup-efficiency** -- Returns daily bench production (HR, SB, OPS) with warnings when a benched player outproduced the starter at the same position.

## Key Decisions

- Player type detection: AB > 0 = hitter, IP > 0 = pitcher (pitcher only if no AB)
- Hot threshold: OPS ratio > 1.25 or HR burst (3+ HR at 2x season rate) for hitters; ERA ratio < 0.75 or K spike for pitchers
- Cold threshold: OPS ratio < 0.75 (with season AB >= 50) for hitters; ERA ratio > 1.5 (with season IP >= 20) for pitchers
- Insufficient data guard: < 5 AB (hitter) or < 3 IP (pitcher) in window
- Rate stats always computed from component sums via shared/formulas.ts (calculateOBP, calculateSLG, calculateERA, calculateWHIP)

## Key Files

### Created
- `packages/backend/src/api/trends.ts` -- Route module with both endpoints

### Modified
- `packages/backend/src/index.ts` -- Added import and registration of trendsRoutes

## Self-Check: PASSED

- [x] TypeScript compiles cleanly (`npx tsc --noEmit`)
- [x] Both endpoints defined (hot-cold, lineup-efficiency)
- [x] Component math used for all rate stats
- [x] Empty array guard applied for Kysely IN queries
- [x] Graceful degradation when no data (dataAvailable: false)
