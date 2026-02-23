# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions — see things other managers don't, act faster, finish higher.
**Current focus:** Phase 09 - Trade Retrospectives (IN PROGRESS)

## Current Position

Phase: 09 (Trade Retrospectives)
Plan: 2 of 2 in current phase
Status: Complete
Last activity: 2026-02-23 - Completed 09-02-PLAN.md: Bootstrap CI, frontend uncertainty indicators, SGP view, replacement-level draft report

Progress: [██████████] 100% (all v1.1 phases complete)

## Performance Metrics

**Velocity (v1.0 completed):**
- Total plans completed: 18 plans
- Average duration: 6 minutes
- Total execution time: 115 minutes

**By Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 6 | 74min | 12min |
| 02 | 3 | 10min | 3min |
| 03 | 3 | 7min | 2min |
| 04 | 4 | 17min | 4min |
| 05 | 2 | 7min | 3min |

**v1.1 Status:**
- Plans completed: 8
- Plans remaining: 0
- Current phase: 09 (Trade Retrospectives) - COMPLETE

**By Phase (v1.1):**

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 06 | P01 | 3min | 2 | 5 |
| 06 | P02 | 2min | 1 | 2 |
| 07 | P01 | 6min | 2 | 4 |
| 07 | P02 | 4min | 2 | 4 |
| 08 | P01 | 3min | 2 | 5 |
| 07.1 | P01 | 217min | 2 | 4 |
| 07.1 | P02 | 4min | 1 | 2 |
| 07.2 | P01 | 28min | 2 | 2 |
| 09 | P01 | 6min | 2 | 4 |
| 09 | P02 | 6min | 2 | 5 |

**Quick Tasks:**

| ID | Duration | Tasks | Files |
|----|----------|-------|-------|
| quick-01 | 2min | 3 | 3 |
| quick-02 | 3min | 2 | 2 |
| quick-03 | 3min | 2 | 3 |

*Updated: 2026-02-23 after 09-02 completion*

## Accumulated Context

### Decisions

Full decisions logged in PROJECT.md Key Decisions table.
Recent decisions affecting v1.1 work:

- Build on existing stack (Fastify + Next.js) — large working codebase saves time
- Component-based rate stat math (never average rates) — critical for multi-player trade accuracy
- Current-season history first, backfill later — v1.0 nailed current experience, v1.1 adds historical depth
- Recommendations only, no ESPN write actions — deep links to ESPN.com work well
- Manual FanGraphs CSV upload only — ToS compliance, no automated scraping
- [Phase 06]: Greedy slot assignment with specificity ordering prevents UTIL filling before C/1B slots
- [Phase 06]: Component math verification via formula tests proves correctness by composition
- [Phase 06]: 300ms debounce on validation prevents excessive API calls during rapid checkbox toggling
- [Phase 06]: Progressive disclosure pattern for max selection warnings (only shown when limit reached)
- [Phase 07]: Separate BullMQ queue for backfills prevents starving daily snapshot processing
- [Phase 07]: SHA-256 transaction deduplication prevents duplicate entries on overlapping backfills
- [Phase 07]: 2-second polling for active backfill jobs prevents server overload while providing real-time feedback
- [Phase 07]: Season filter additive to from/to filters allows flexible year + date range queries
- [Phase 08]: SVG foreignObject for rich tooltips inside Recharts without external positioning libraries
- [Phase 08]: Team-scoped annotations by default to prevent chart clutter on multi-team transactions
- [Phase 07.1]: Per-period accumulation only for backfill - live snapshots unchanged to avoid regression
- [Phase 07.1]: Pitching components remapped at rate calculation time preserving raw names in components_json
- [Phase 07.1]: Dynamic category dropdown loads from league settings API ensuring accurate category list per league configuration
- [Phase 07.2]: Filter ESPN rate stats (AVG, OBP, SLG, OPS, ERA, WHIP, K9) at accumulation time, not at ESPN_STAT_MAP level -- preserves rate stat info for other uses
- [Phase 07.2]: Rate stats from ESPN per-period data must never be accumulated as components -- always compute from counting stat components
- [Quick 01]: Include bench players (lineupSlotId 16) in roto stat accumulation — bench stats count toward team totals, only IL/NA excluded
- [Quick 01]: Debug endpoint at /api/admin/leagues/:id/debug/period-stats enables manual verification of roster inclusion logic and ESPN data comparison
- [Quick 02]: Positional scarcity multipliers (C: 1.5, RP: 1.3, OF: 0.8) based on typical fantasy baseball player pools — catchers and closers valued higher than outfielders
- [Quick 02]: Depth threshold at 1.5x roster slots marks positions of need — teams with fewer than 1.5 eligible players per slot are thin at that position
- [Quick 02]: Positional bonus capped at 3.0 points prevents overwhelming stat-based value — keeps trades balanced between positional and statistical improvements
- [Quick 02]: Additive bonus (valueDelta + positionalBonus) in pre-filter sorting surfaces positional trades earlier without separate queuing
- [Phase 09 P01]: Shapley values are the only attribution method with proven efficiency guarantee (per-move impacts sum to netRosterValue)
- [Phase 09 P01]: 500 Monte Carlo samples (not 1000) balances accuracy vs runtime for teams with 50+ moves
- [Phase 09 P01]: Pre-load all player contributions upfront to avoid N*samples DB queries during Shapley computation
- [Phase 09 P01]: SGP factors use average gap (counting stats) and stddev (rate stats) for standings normalization
- [Phase 09 P01]: Replacement level = average of players ranked N+1 through N+3 just outside rostered pool
- [Phase 09]: Bootstrap CI uses 200 samples (not 1000) balancing accuracy vs runtime for interactive responses
- [Phase 09]: Uncertain moves flagged when CI crosses zero OR width > 2x point estimate (captures both insignificance and variance)
- [Phase 09]: Graceful null handling ensures frontend works with pre-Shapley and post-Shapley data (zero-downtime migration)
- [Phase 09]: Bootstrap CI uses 200 samples (not 1000) balancing accuracy vs runtime for interactive responses
- [Phase 09]: Uncertain moves flagged when CI crosses zero OR width > 2x point estimate (captures both insignificance and variance)
- [Phase 09]: Graceful null handling ensures frontend works with pre-Shapley and post-Shapley data (zero-downtime migration)

### Roadmap Evolution

- Phase 07.1 inserted after Phase 7: Historical Stats Accumulation & Dynamic Categories (URGENT) — ESPN backfill produces identical standings across all weeks because `valuesByStat` returns full-season cumulative stats. Fix: accumulate per-period player stats (statSplitTypeId=5), filter active roster, use league-defined scoring categories.
- Phase 07.2 inserted after Phase 7: Research and fix standings over time (URGENT) — counting stat values are an order of magnitude smaller than expected in backfill snapshots despite cumulative accumulation fix in 07.1.

### Pending Todos

None yet.

### Blockers/Concerns

**Phase 6 readiness:**
- Existing TradeRecommendationAgent.simulateTradeImpact() already handles N-for-N trades correctly (lines 634-653)
- Need to add genetic algorithm candidate generation to prevent combinatorial explosion
- Integration tests required to prevent component math regression

**Phase 7 readiness:**
- ESPN historical data retention unclear — may only support current + prior season
- Need to validate 2024 vs 2025 response schema compatibility
- Rate limiting critical — 2-second throttle required to avoid IP ban

**Phase 9 readiness:**
- Depends on Phase 6 (multi-player simulation) + Phase 7 (historical snapshots)
- Projection accuracy metrics need user research (MAE/RMSE vs simple indicator)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix cumulative counting stats magnitude (bench player exclusion) + debug endpoint | 2026-02-22 | c4c73f8 | [1-fix-cumulative-counting-stats-magnitude-](./quick/1-fix-cumulative-counting-stats-magnitude-/) |
| 2 | Add positional value to trade recommendations (roster gaps, scarcity scoring) | 2026-02-23 | 846736e | [2-update-trade-recommendations-to-consider](./quick/2-update-trade-recommendations-to-consider/) |
| 3 | Fix move impact metric - replace sum with single counterfactual (netRosterValue) | 2026-02-23 | 4bd284c | [3-fix-move-impact-replace-sum-of-individua](./quick/3-fix-move-impact-replace-sum-of-individua/) |

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 09-02-PLAN.md (Bootstrap CI + frontend statistical indicators)
Resume file: None
