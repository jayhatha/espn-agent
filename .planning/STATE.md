# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions — see things other managers don't, act faster, finish higher.
**Current focus:** Phase 10 - ESPN Live Draft Assistant (COMPLETE)

## Current Position

Phase: 13 (Clean Up Tech Debt)
Plan: 6 of 6 in current phase
Status: Complete
Last activity: 2026-02-26 - Completed 13-06: Add test coverage for critical bug fixes

Progress: Phase 13: [██████████] 100% (6 of 6 plans complete)

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

**Phase 10 Status:**
- Plans completed: 6
- Plans remaining: 0
- Current phase: 10 (ESPN Live Draft Assistant) - COMPLETE

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
| 10 | P01 | 8min | 2 | 13 |
| 10 | P02 | 5min | 2 | 6 |
| 10 | P03 | unknown | 2 | 4 |
| 10 | P04 | unknown | 4 | 4 |
| 10 | P05 | unknown | 3 | 3 |
| 10 | P06 | unknown | 3 | 3 |
| 11 | P01 | 4min | 2 | 5 |
| 11 | P04 | 3min | 2 | 3 |
| 11 | P05 | 2min | 2 | 2 |
| 12 | P01 | 15min | 3 | 8 |
| 12 | P02 | 10min | 2 | 5 |
| 12 | P03 | 27min | 2 | 3 |
| 12 | P04 | 7min | 3 | 2 |
| 12 | P05 | 10min | 2 | 2 |
| 13 | P01 | 10min | 2 | 6 |
| 13 | P02 | 10min | 3 | 7 |
| 13 | P03 | 7min | 3 | 6 |
| 13 | P04 | 5min | 2 | 7 |
| 13 | P05 | 3min | 3 | 3 |
| 13 | P06 | 11min | 3 | 4 |

**Quick Tasks:**

| ID | Duration | Tasks | Files |
|----|----------|-------|-------|
| quick-01 | 2min | 3 | 3 |
| quick-02 | 3min | 2 | 2 |
| quick-03 | 3min | 2 | 3 |
| quick-04 | 3min | 2 | 1 |
| quick-05 | 9min | 2 | 4 |
| quick-08 | 5min | 3 | 2 |
| quick-09 | 13min | 3 | 5 |
| quick-10 | 5min | 3 | 3 |

*Updated: 2026-02-26 after Phase 13 completion*
| Phase 13 P03 | 7 | 3 tasks | 6 files |
| Phase 13 P02 | 10 | 3 tasks | 6 files |
| Phase 13 P05 | 3 | 3 tasks | 3 files |
| Phase 13 P04 | 5 | 2 tasks | 7 files |
| Phase 13 P06 | 11 | 3 tasks | 4 files |
| Phase quick-10 P01 | 5 | 3 tasks | 3 files |

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
- [Phase 10 P01]: WXT chosen over Plasmo for 43% smaller bundles and better Vite/HMR integration
- [Phase 10 P01]: Baseline rankings bundled with 25 realistic players for offline fallback
- [Phase 10 P01]: API client uses 3-second timeout to prevent blocking on slow backend
- [Phase 10 P01]: Manifest V3 permissions limited to storage and tabs for minimal user concern
- [Phase 10 P01]: Shadow DOM styling via Tailwind for isolation from ESPN page styles
- [Phase 11]: node-cron over BullMQ for daily sync - simple daily job with no queue coordination needed
- [Phase 11]: 4 AM ET schedule for player pool sync - ESPN updates overnight after West Coast games
- [Phase 11]: Budget pacing threshold reduced to 5% for earlier auction alerts
- [Phase 11]: Inflation factor clamped 0.5x-2x to prevent edge case instability
- [Phase 11]: Sparse position replacement set to -10 to reflect scarcity value
- [Phase 11]: POST endpoint with config in body avoids URL length limits for complex objects
- [Phase 11]: Rate limit 50 requests/minute balances draft frequency with server load
- [Phase 11]: 10-pick threshold for snake draft value detection - players 10+ picks later than VBD rank are significant value opportunities
- [Phase 11]: 15% threshold for auction value detection - 15%+ discount/overpay represents meaningful budget deviation
- [Phase 11]: Hide fair value badges to reduce clutter - only show badges for non-fair values
- [Phase 11]: Multiple DOM selector strategies for robustness against ESPN changes
- [Phase 11]: Config cached after initial detection - no re-detection mid-draft for performance
- [Phase 11]: Keep stale data on refresh failure - better than no rankings during draft
- [Phase 12 P02]: Persistent free agent storage in league_free_agent_snapshot table enables historical queries and reduces ESPN API load
- [Phase 12 P02]: Four-tier free agent strategy (provided list → snapshot → raw payload → projections) ensures waiver recommendations work even with missing data
- [Phase 12 P02]: Position boosting (1.05x confidence) in fuzzy matcher improves accuracy for multi-position players with minimal performance cost
- [Phase 12]: Empty array guards already in place across all priority agents
- [Phase 12]: Hardcoded API URLs replaced with centralized api client imported from lib/api.ts
- [Phase 12 P01]: Dual storage for injuries - current status on player table for queries, historical events in injury_event table for tracking
- [Phase 12 P01]: Normalize ESPN injury statuses to 4 simplified states (IL, DTD, OUT, HEALTHY) for consistency
- [Phase 12 P01]: Console-based logging in extension with DOM snapshots for diagnosing ESPN page changes
- [Phase 12 P04]: Circuit breaker opens after 5 consecutive failures for 60s to prevent ESPN API abuse during outages
- [Phase 12 P04]: Don't overwrite successful prior snapshots with degraded new ones - protects good data during failures
- [Phase 12 P04]: 429 rate limit handling with Retry-After header support for graceful ESPN throttling
- [Phase 12]: Use calculateFinalRate instead of individual rate functions for consistency across all agents
- [Phase 13]: DLQ keeps failed jobs for 30 days enabling post-mortem analysis
- [Phase 13]: Morning report worker uses conditional initialization not process.exit
- [Phase 13]: Player pool worker migrated to BullMQ for consistency and reliability
- [Phase 13]: Zod schemas over manual validation for type-safe validation with automatic TypeScript inference
- [Phase 13 P01]: Batch operations with empty array guards prevent Kysely invalid SQL (WHERE col IN () crashes)
- [Phase 13 P01]: Pre-fetch optimization in waiver-recommendation reduces O(N*M) queries to single batch SELECT
- [Phase 13 P01]: StatComponents interface with uppercase keys matches FanGraphs CSV format for projection data
- [Phase 13]: Signed cookies for OAuth state storage with 10-minute TTL to prevent CSRF attacks
- [Phase 13 P04]: Interface definitions at file level for clear visibility and reusability
- [Phase 13 P04]: Shared constants in lib/constants.ts to eliminate duplication (COLORS, API_URL)
- [Phase 13]: LRU cache with 500 max items and 1-hour TTL prevents unbounded memory growth
- [Phase 13]: 2-second throttle applied to all ESPN methods prevents 429 errors
- [Phase 13]: Remove validateStatus to allow axios-retry on 429
- [Phase 13]: Graceful degradation on schema mismatch (log warning, continue) alerts devs without breaking app
- [Phase 13]: Interface definitions at file level for clear visibility and reusability
- [Phase 13]: Shared constants in lib/constants.ts to eliminate duplication (COLORS, API_URL)

### Roadmap Evolution

- Phase 07.1 inserted after Phase 7: Historical Stats Accumulation & Dynamic Categories (URGENT) — ESPN backfill produces identical standings across all weeks because `valuesByStat` returns full-season cumulative stats. Fix: accumulate per-period player stats (statSplitTypeId=5), filter active roster, use league-defined scoring categories.
- Phase 07.2 inserted after Phase 7: Research and fix standings over time (URGENT) — counting stat values are an order of magnitude smaller than expected in backfill snapshots despite cumulative accumulation fix in 07.1.
- Phase 10 added: ESPN Live Draft Assistant
- Phase 11 added: Draft Assistant Enhancements - player pool sync, value detection, and league-agnostic projections
- Phase 12 added: address codebase concerns

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

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|| 1 | Fix cumulative counting stats magnitude (bench player exclusion) + debug endpoint | 2026-02-22 | c4c73f8 | ✅ | [1-fix-cumulative-counting-stats-magnitude-](./quick/1-fix-cumulative-counting-stats-magnitude-/) |
| 2 | Add positional value to trade recommendations (roster gaps, scarcity scoring) | 2026-02-23 | 846736e | ✅ | [2-update-trade-recommendations-to-consider](./quick/2-update-trade-recommendations-to-consider/) |
| 3 | Fix move impact metric - replace sum with single counterfactual (netRosterValue) | 2026-02-23 | 4bd284c | ✅ | [3-fix-move-impact-replace-sum-of-individua](./quick/3-fix-move-impact-replace-sum-of-individua/) |
| 4 | Season selector and historical trade analysis (moves page) | 2026-02-23 | 79ecc41 | ✅ | [4-season-selector-and-historical-trade-ana](./quick/4-season-selector-and-historical-trade-ana/) |
| 5 | Inflection point explanations on trends chart (category attribution + transactions) | 2026-02-23 | bf89cb2 | ✅ | [5-add-inflection-point-explanations-to-ran](./quick/5-add-inflection-point-explanations-to-ran/) |
| 6 | Delete old/inaccurate/unused md files | 2026-02-23 | aae76f3 | ✅ | [6-delete-old-inaccurate-unused-md-files](./quick/6-delete-old-inaccurate-unused-md-files/) |
| 7 | Review and commit phase 10 work (10-03 through 10-06) | 2026-02-25 | 6148fb3 | ✅ | [7-review-the-other-agent-s-work-on-phase-1](./quick/7-review-the-other-agent-s-work-on-phase-1/) |
| 8 | Research and fix auction valuation issues: values too low, wrong positions. Compare our VBD/SGP approach to ESPN's pre-draft rankings, research industry best practices (z-scores vs SGP), identify root cause, and fix calculations. | 2026-02-25 | 7c5b0b3 | ✅ | [8-research-and-fix-auction-valuation-issue](./quick/8-research-and-fix-auction-valuation-issue/) |
| 9 | Fix test failures in ESPNAdapter and auth validation tests | 2026-02-26 | 07d3c24 | ⚠️ Partial | [9-fix-test-failures-in-espnadapter-and-aut](./quick/9-fix-test-failures-in-espnadapter-and-aut/) |
| 10 | Improve DOM detection in Chrome extension with multiple fallback strategies and diagnostic tools | 2026-02-27 | 144bbec | ✅ | [10-improve-dom-detection-in-chrome-extensio](./quick/10-improve-dom-detection-in-chrome-extensio/) |

## Session Continuity

Last session: 2026-02-27
Stopped at: Completed quick task 10 - improved DOM detection in Chrome extension with 26 fallback strategies and diagnostic tools
Resume file: None
