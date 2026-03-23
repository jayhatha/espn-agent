# Plan 68-01 Summary: Backend FAAB Tracking + GS Pacing

**Status:** COMPLETE
**Date:** 2026-03-23

## What was done

### Task 1: FaabTrackerAgent + GsPacingAgent + Shared Types

**Shared types** (`packages/shared/src/types.ts`):
- Added `FaabSummary`, `FaabBidEntry`, `FaabSuggestedBid` interfaces for FAAB tracking
- Added `GsSeasonSummary`, `GsWeeklySummary`, `GsStartPlan`, `GsStartRecommendation` interfaces for GS pacing
- Added `PaceStatus` and `StartAction` type aliases

**FaabTrackerAgent** (`packages/backend/src/agents/faab-tracker.ts`):
- `getSummary()`: Computes FAAB remaining from total budget minus sum of won bid amounts in `league_transaction_event.raw_event_json.bidAmount`. Calculates league average, spend rate per week, projected runout week, and `willRunOut` flag.
- `getBidHistory()`: Queries transaction events with bid amounts, looks up player names and ROI from latest projection run. Returns sorted by date desc.
- `getSuggestedBid()`: Computes player's projected value share of remaining budget. Applies urgency premium (+50% in final 4 weeks) or patience discount (-30% in first 15 weeks). Floors at $1, caps at remaining budget.
- Default FAAB budget: $100 (reads from `league_settings_version.settings_json.acquisition_rules.acquisition_budget` if available)

**GsPacingAgent** (`packages/backend/src/agents/gs-pacing.ts`):
- `getSeasonSummary()`: Three-tier GS detection: 1) `team_daily_category_totals` GS stat, 2) IP/6 estimate, 3) roster snapshot SP slot count. Default 200 GS cap. Pace status: on_track / burning_fast (>110%) / too_slow (<90%).
- `getWeeklySummary()`: Groups roster snapshot SP entries by pitcher and date within Monday-Sunday week boundary. Shows starts used vs target pace.
- `getStartPlan()`: Pace-aware SP start/sit recommendations using K/GS ratio from projections. Burning fast = sit low-K pitchers; too slow = activate all; on track = rank by efficiency. Alert generated when pace >10% off target.

### Task 2: API Routes + Server Registration

**FAAB routes** (`packages/backend/src/api/faab.ts`):
- `GET /api/leagues/:leagueId/teams/:teamId/faab` — FAAB budget summary
- `GET /api/leagues/:leagueId/teams/:teamId/faab/history` — Bid history with ROI
- `GET /api/leagues/:leagueId/teams/:teamId/faab/suggested-bid/:playerId` — Suggested bid

**Pitching usage routes** (`packages/backend/src/api/pitching-usage.ts`):
- `GET /api/leagues/:leagueId/teams/:teamId/pitching/gs` — Season GS summary
- `GET /api/leagues/:leagueId/teams/:teamId/pitching/gs/weekly` — Weekly breakdown
- `GET /api/leagues/:leagueId/teams/:teamId/pitching/start-plan` — SP start/sit plan

All routes registered in `packages/backend/src/index.ts` with authenticate + requireLeagueAccess + requireTeamOwnership middleware.

## Verification
- `cd packages/shared && npx tsc --noEmit` — passes
- `cd packages/backend && npx tsc --noEmit` — passes
- All 6 API endpoints registered in server
- Shared types exported: FaabSummary, FaabBidEntry, FaabSuggestedBid, GsSeasonSummary, GsWeeklySummary, GsStartPlan

## Key Files
- `packages/shared/src/types.ts` — 8 new type exports
- `packages/backend/src/agents/faab-tracker.ts` — FaabTrackerAgent (new)
- `packages/backend/src/agents/gs-pacing.ts` — GsPacingAgent (new)
- `packages/backend/src/api/faab.ts` — 3 FAAB endpoints (new)
- `packages/backend/src/api/pitching-usage.ts` — 3 GS endpoints (new)
- `packages/backend/src/index.ts` — route registration
