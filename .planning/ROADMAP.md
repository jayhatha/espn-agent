# Roadmap: ESPN Fantasy Baseball Command Center

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-02-21)
- 🚧 **v1.1 Trades & History** — Phases 6-9 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-02-21</summary>

- [x] **Phase 1: Foundation & Critical Fixes** - ESPN adapter, snapshot orchestrator, projections ingest, encryption, rate limiting (6/6 plans) — completed 2026-02-19
- [x] **Phase 2: Authentication & Onboarding** - JWT auth, OAuth stubs, guided wizard (3/3 plans) — completed 2026-02-19
- [x] **Phase 3: Core Dashboard & Recommendations** - Team health, scarcity badges, waiver/trade recommendations, action items (3/3 plans) — completed 2026-02-20
- [x] **Phase 4: Advanced Features & Polish** - Draft rankings, lineup optimizer, streaming pitchers, trend charts (4/4 plans) — completed 2026-02-20
- [x] **Phase 5: Admin UI** - System health, user management, batch upload (2/2 plans) — completed 2026-02-21

</details>

### 🚧 v1.1 Trades & History (In Progress)

**Milestone Goal:** Enable multi-player trade evaluation and historical season analysis with data backfill

- [x] **Phase 6: Multi-Player Trade Foundation** - N-for-M trade evaluation with roster validation (2/2 plans) — completed 2026-02-21
- [x] **Phase 7: Historical Backfill & Timeline** - ESPN historical data and week-by-week standings (2/2 plans) — completed 2026-02-21
- [x] **Phase 8: Season Replay & Annotations** - Transaction markers and date range selection (completed 2026-02-21)
- [x] **Phase 9: Transaction Impact Analysis (Roto WPA)** - Per-move roto-points impact with counterfactual analysis (completed 2026-02-22)

## Phase Details

### Phase 6: Multi-Player Trade Foundation
**Goal:** Users can propose and evaluate multi-player trades (2-for-2, 3-for-1, N-for-M) with accurate projected standings impact
**Depends on:** Phase 5 (v1.0 complete)
**Requirements:** TRADE-01, TRADE-02, TRADE-03, TRADE-04
**Success Criteria** (what must be TRUE):
  1. User can propose an N-for-M trade (up to 3-for-3) and see projected overall standings delta
  2. User sees category-by-category impact breakdown (rank changes for HR, RBI, AVG, ERA, etc.)
  3. System prevents illegal trades by validating roster slot constraints before showing results
  4. Multi-player rate stats (AVG, OBP, ERA, WHIP) use component-based math (H/AB not averaged rates)
**Plans:** 2 plans

Plans:
- [x] 06-01-PLAN.md — Backend roster validation, 3-per-side enforcement, /trades/validate endpoint, and integration tests (TDD) — completed 2026-02-21
- [x] 06-02-PLAN.md — Frontend multi-player trade builder with selection limits, real-time validation, and category breakdown — completed 2026-02-21

### Phase 7: Historical Backfill & Timeline
**Goal:** Users can view week-by-week standings progression for their league's current and past seasons
**Depends on:** Phase 6
**Requirements:** HIST-01, HIST-02, HIST-03, HIST-04, TIME-01
**Success Criteria** (what must be TRUE):
  1. Admin can trigger historical data backfill for a league's past season via admin dashboard
  2. Backfill runs as background job without blocking UI, with progress tracking visible to admin
  3. Backfill respects ESPN rate limits (2-second throttle, exponential backoff on 429 errors)
  4. Transaction deduplication prevents duplicate entries when backfilling overlapping date ranges
  5. User can view week-by-week standings progression as a line chart for any season with collected data
**Plans:** 2 plans

Plans:
- [x] 07-01-PLAN.md — Backend backfill infrastructure: ESPN historical fetch, backfill agent with rate limiting and transaction dedup, BullMQ worker, admin API endpoints — completed 2026-02-21
- [x] 07-02-PLAN.md — Frontend backfill UI (admin trigger + progress tracking) and season-filtered timeline on trends page — completed 2026-02-21

### Phase 07.2: Research and fix standings over time — counting stat values an order of magnitude too small in backfill snapshots (INSERTED)

**Goal:** Fix counting stat values in backfill snapshots that appear ~10x smaller than expected by diagnosing and correcting the data extraction in writeCurrentStandingsFromPlayerStats
**Depends on:** Phase 7
**Requirements:** TIME-01-fix-07.2
**Success Criteria** (what must be TRUE):
  1. Backfill counting stats (HR, RBI, R, SB, K, W, SV) are within expected magnitude (20-90 HR at mid-season, not 2-3)
  2. Week-over-week accumulation produces increasing cumulative totals
  3. Rate stats (AVG, ERA, WHIP) from accumulated components are in reasonable ranges
**Plans:** 1/1 plans complete

Plans:
- [x] 07.2-01-PLAN.md — Diagnose root cause via debug logging and ESPN response inspection, implement fix, verify with re-backfill -- completed 2026-02-22

### Phase 07.1: Historical Stats Accumulation & Dynamic Categories (INSERTED)

**Goal:** Fix historical backfill to produce accurate week-by-week standings by accumulating per-period player stats and use league-defined scoring categories
**Depends on:** Phase 7
**Requirements:** TIME-01-fix
**Success Criteria** (what must be TRUE):
  1. Backfill produces per-week standings that actually differ (not identical across all weeks)
  2. Stats are accumulated from per-period player data (statSplitTypeId=5), filtered to active roster only
  3. Rate stats use component-based math (accumulate H/AB, ER/OUTS, not average rates)
  4. League-defined scoring categories used for ranking (from league_settings_version)
  5. Frontend trends page uses dynamic categories from API, not hardcoded list
**Plans:** 2/2 plans complete

Plans:
- [ ] 07.1-01-PLAN.md — Backend per-period player stat accumulation, rate stat component math, league categories endpoint
- [ ] 07.1-02-PLAN.md — Frontend dynamic category dropdown replacing hardcoded list

### Phase 8: Season Replay & Annotations
**Goal:** Users can see how transactions affected their standings over time with visual annotations
**Depends on:** Phase 7
**Requirements:** TIME-02, TIME-03
**Success Criteria** (what must be TRUE):
  1. Timeline chart shows transaction annotations (trades, waiver adds/drops) at the weeks they occurred
  2. User can hover over annotation markers to see transaction details (players involved, date, teams)
  3. User can select different seasons or custom date ranges for timeline view
**Plans:** 1/1 plans complete

Plans:
- [ ] 08-01-PLAN.md — Enrich annotations endpoint with player names, build TransactionMarker and DateRangeFilter components, integrate into trends page

### Phase 9: Transaction Impact Analysis (Roto WPA)
**Goal:** Users see the roto-points impact of every roster move — from draft picks through the final add/drop — showing which moves helped/hurt their season the most
**Depends on:** Phase 7 (needs historical backfill snapshots with per-player data)
**Requirements:** IMPACT-01, IMPACT-02, IMPACT-03, IMPACT-04
**Success Criteria** (what must be TRUE):
  1. Per-player per-period stats stored during backfill, enabling individual contribution tracking
  2. Roster moves derived from weekly snapshot diffs with draft picks identified from opening-day roster
  3. Each move shows roto-points impact computed via counterfactual analysis (actual vs what-if-you-hadn't-made-this-move) (UPGRADE: Shapley values)
  4. Frontend shows impact timeline, move leaderboard (best/worst moves), and draft pick report (UPGRADE: confidence indicators, SGP)
**Plans:** 2/2 plans complete

Plans:
- [ ] 09-01-PLAN.md — Shapley value computation, SGP category normalization, replacement-level baselines, DB migration
- [ ] 09-02-PLAN.md — Bootstrap confidence intervals, API updates, frontend confidence/SGP/replacement-level UI

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Critical Fixes | v1.0 | 6/6 | Complete | 2026-02-19 |
| 2. Authentication & Onboarding | v1.0 | 3/3 | Complete | 2026-02-19 |
| 3. Core Dashboard & Recommendations | v1.0 | 3/3 | Complete | 2026-02-20 |
| 4. Advanced Features & Polish | v1.0 | 4/4 | Complete | 2026-02-20 |
| 5. Admin UI | v1.0 | 2/2 | Complete | 2026-02-21 |
| 6. Multi-Player Trade Foundation | v1.1 | 2/2 | Complete | 2026-02-21 |
| 7. Historical Backfill & Timeline | v1.1 | 2/2 | Complete | 2026-02-21 |
| 7.1 Historical Stats Accumulation | v1.1 | 0/2 | Planning | - |
| 7.2 Fix Standings Values | v1.1 | 1/1 | Complete | 2026-02-22 |
| 8. Season Replay & Annotations | v1.1 | 1/1 | Complete | 2026-02-21 |
| 9. Transaction Impact (Roto WPA) | v1.1 | 2/2 | Complete | 2026-02-23 |
| 10. ESPN Live Draft Assistant | v1.2 | 6/6 | Complete | 2026-02-25 |
| 11. Draft Assistant Enhancements | v1.2 | 5/5 | Complete | 2026-02-25 |
| 12. Address Codebase Concerns | v1.2 | 5/5 | Complete | 2026-02-26 |
| 13. Clean Up Tech Debt | v1.2 | 6/6 | Complete | 2026-02-26 |
| 14. ESPN Auction Values Bug Fix | v1.2 | Complete    | 2026-02-28 | - |
| 15. Fix Empty SGP Categories | v1.2 | 1/1 | Complete | 2026-03-03 |
| 16. ESPN Auction Pagination Fix | v1.2 | 1/1 | Complete | 2026-03-03 |
| 17. Site Redesign | v1.3 | 9/9 | Complete | 2026-03-03 |
| 18. Dashboard Compositional Layout | v1.3 | Complete    | 2026-03-03 | 2026-03-03 |
| 20. Deterministic Draft Engine | 2/2 | Complete    | 2026-03-04 | - |
| 21. Build Archetype Analysis | 3/3 | Complete   | 2026-03-05 | - |

### Phase 10: ESPN Live Draft Assistant

**Goal:** Chrome extension that overlays ESPN's live draft page, providing real-time player recommendations, roster tracking, and value analysis for both snake and auction drafts
**Depends on:** Phase 9
**Requirements:** []
**Success Criteria** (what must be TRUE):
  1. Extension loads on ESPN draft pages and injects sidebar overlay
  2. MutationObserver detects picks in real-time and updates draft state
  3. Snake draft users see BPA recommendations, pair recommendations at turn, and roster summary
  4. Auction draft users see budget pacing tracker, dollar value recommendations, and spend guidance
  5. Draft state persists across page refreshes via chrome.storage.local
**Plans:** 6/6 plans complete

Plans:
- [x] 10-01-PLAN.md — WXT extension setup, manifest config, baseline rankings bundle, API client
- [x] 10-02-PLAN.md — Zustand draft state with chrome.storage.local persistence, snake/auction value calculations
- [x] 10-03-PLAN.md — Content script with Shadow DOM sidebar injection, MutationObserver for pick detection
- [x] 10-04-PLAN.md — Snake draft UI: BPA recommendations, pair recommendations, roster summary
- [x] 10-05-PLAN.md — Auction draft UI: budget pacing tracker, dollar value recommendations
- [x] 10-06-PLAN.md — Pick value tracking (overpay/underpay indicators), pre-draft ranking overrides, ADP/countdown display

### Phase 11: Draft Assistant Enhancements - player pool sync, value detection, and league-agnostic projections

**Goal:** Extension provides accurate value-based draft recommendations by syncing player pool data, detecting league configurations, and refreshing projections automatically after each pick
**Depends on:** Phase 10
**Requirements:** []
**Success Criteria** (what must be TRUE):
  1. Backend syncs ESPN player pool daily (stats, ownership %) to shared database table
  2. Extension detects league config from ESPN draft page DOM (categories, roster slots, teams)
  3. Rankings auto-refresh after each pick detection with retry logic
  4. Snake draft shows color-coded value indicators (10+ pick steals = green, reaches = red)
  5. Auction draft shows percentage discount/overpay indicators (15%+ discount = green)
  6. Valuation logic audited and corrected for accuracy
**Plans:** 5/5 plans complete

Plans:
- [ ] 11-01-PLAN.md — Audit and fix existing valuation logic (backend + extension)
- [ ] 11-02-PLAN.md — Backend player pool sync (DB migration, sync agent, daily cron job)
- [ ] 11-03-PLAN.md — Extension league config detection and auto-refresh on pick
- [ ] 11-04-PLAN.md — Extension value detection UI (red/yellow/green badges)
- [ ] 11-05-PLAN.md — Backend projected standings endpoint (league-agnostic)

### Phase 12: address codebase concerns

**Goal:** Systematically fix known bugs, complete partial features, and improve code quality by addressing documented concerns in progressive depth order (bugs first, quick wins, deeper refactors)
**Depends on:** Phase 11
**Requirements:** CONCERN-BUG-01, CONCERN-BUG-02, CONCERN-BUG-04, CONCERN-DEBT-01, CONCERN-DEBT-02, CONCERN-DEBT-03, CONCERN-DEBT-05, CONCERN-DEBT-06, CONCERN-DEBT-08, CONCERN-FRAGILE-02, CONCERN-FRAGILE-03, CONCERN-PERF-01
**Success Criteria** (what must be TRUE):
  1. Injury data populated in morning reports with actual player positions
  2. Draft recommendations return actual rankings instead of placeholder
  3. Extension DOM selectors have validation and graceful degradation
  4. Free agent pool populated during snapshot orchestration
  5. Player name matching uses fuzzy resolution as primary path
  6. Frontend pages use centralized API client (no hardcoded localhost URLs)
  7. WHERE IN clauses have empty array guards to prevent SQL crashes
  8. Transactions tracked during snapshot with deduplication
  9. Snapshot orchestrator has error boundaries for partial failures
  10. Trade recommendations include rate stat adjustments (AVG, ERA, WHIP)
**Plans:** 5/5 plans complete

Plans:
- [x] 12-01-PLAN.md — Fix critical bugs: injury data extraction, draft recommendations endpoint, DOM selector validation — completed 2026-02-26
- [ ] 12-02-PLAN.md — Wire up free agent fetch and make fuzzy player matching primary path
- [ ] 12-03-PLAN.md — Replace hardcoded API URLs and add empty array guards

### Phase 13: Clean up tech debt

**Goal:** Fix critical bugs silently producing incorrect data, close security vulnerabilities, eliminate performance bottlenecks, and improve type safety across backend and frontend
**Depends on:** Phase 12
**Requirements:** DEBT-01, DEBT-02, DEBT-03, DEBT-04, DEBT-05, DEBT-06, DEBT-07, DEBT-08, DEBT-09, DEBT-10
**Success Criteria** (what must be TRUE):
  1. TradeRecommendationAgent accesses projection data correctly (no silent failures)
  2. N+1 query patterns replaced with batch operations (120+ INSERTs → 1 batch)
  3. All API request bodies validated with Zod schemas (no crashes on malformed input)
  4. OAuth CSRF state validated on callback (no security vulnerabilities)
  5. BullMQ failed jobs moved to DLQ for inspection (no silent failures)
  6. Workers don't call process.exit() (no crashes affecting co-located workers)
  7. Frontend `any` types replaced with proper interfaces (28 violations fixed)
  8. Shared frontend components extracted (no duplication)
  9. ESPNAdapter uses bounded LRU cache (no memory leaks)
  10. Critical paths have test coverage (TradeRecommendation, ESPNAdapter, auth routes)
**Plans:** 6/6 plans complete

Plans:
- [x] 13-01-PLAN.md — Fix TradeRecommendationAgent projection access bug and batch N+1 operations — completed 2026-02-26
- [x] 13-02-PLAN.md — Add Zod request validation and OAuth CSRF validation — completed 2026-02-26
- [x] 13-03-PLAN.md — Configure BullMQ DLQ and fix worker stability — completed 2026-02-26
- [x] 13-04-PLAN.md — Replace frontend any types and extract shared components — completed 2026-02-26
- [x] 13-05-PLAN.md — ESPNAdapter improvements: LRU cache, rate limiting, schema validation — completed 2026-02-26
- [x] 13-06-PLAN.md — Add tests for critical paths — completed 2026-02-26

### Phase 14: ESPN Auction Values Bug Fix

**Goal:** Fix ESPN auction values endpoint returning only 6 players instead of full player pool by increasing pagination limit and adding diagnostic logging
**Depends on:** Phase 13
**Requirements:** BUGFIX-ESPN-AUCTION-VALUES
**Success Criteria** (what must be TRUE):
  1. Auction validation endpoint returns 500+ players with ESPN auction values
  2. Players span multiple positions (C, 1B, 2B, 3B, SS, OF, SP, RP)
  3. Response includes high-ownership (>50%) and low-ownership (<10%) players
  4. Diagnostic logging shows actual ESPN response metrics
**Plans:** 1/1 plans complete

Plans:
- [x] 14-01-PLAN.md — Increase x-fantasy-filter limit to 2000, add diagnostic logging, add integration test

### Phase 15: Fix empty categories in SGP calculation - categories not passing through to DraftRankingsAgent causing all auction values to be $1

**Goal:** Fix categories data flow bug causing all auction values to collapse to $1 by ensuring formula_id is included for RATE stats in both extension DOM detection and admin page
**Depends on:** Phase 14
**Plans:** 1/1 plans complete

Plans:
- [ ] 15-01-PLAN.md — Fix DOM detector to include formula_id/required_components for RATE stats, fix admin page enum values, add unit tests

### Phase 16: ESPN auction values pagination - ESPN caps responses at 50 players regardless of limit, implement offset-based pagination to fetch full 500+ player pool

**Goal:** Fix ESPN returning only 50 players in auction value and free agent fetches by moving x-fantasy-filter from URL params to HTTP headers, and add offset-based pagination to fetchPreDraftAuctionValues to retrieve the full 500+ player pool
**Depends on:** Phase 15
**Requirements:** BUGFIX-ESPN-PAGINATION
**Plans:** 1/1 plans complete

Plans:
- [ ] 16-01-PLAN.md — Fix x-fantasy-filter transport (params -> headers) in fetchFreeAgents and fetchPreDraftAuctionValues, add sortDraftRanks to auction filter, implement offset-based pagination loop in fetchPreDraftAuctionValues

### Phase 17: Site redesign -- typography-driven, high-end creative design system with improved spacing, navigation, accessibility, and performance

**Goal:** Refactor the frontend to follow a restrained, typography-driven, high-end creative design system with increased whitespace, simplified navigation, stronger hierarchy, reduced visual clutter, subtle motion, and WCAG AA accessibility
**Depends on:** Phase 16
**Requirements:** DS-01, DS-02, DS-03, DS-04, DS-05, DS-06, DS-07
**Success Criteria** (what must be TRUE):
  1. Design token system defined (typography scale, color palette, spacing, shadows) in tailwind.config.js
  2. Shared component library created (Container, Heading, Text, Button, Card, Badge, Input, Select, FadeIn)
  3. Navigation redesigned with lucide-react icons, design tokens, and WCAG AA accessibility
  4. All 18 routes migrated to use design system components
  5. No gradient backgrounds, heavy shadows, or dangerouslySetInnerHTML for emojis
  6. Scroll-reveal animations on landing page respecting prefers-reduced-motion
  7. Skip-to-content link, focus-visible states, and proper aria attributes throughout
**Plans:** 9/9 plans complete

Plans:
- [ ] 17-01-PLAN.md — Install dependencies (tailwind-merge, cva, lucide-react), define design tokens in Tailwind config, create cn() utility, clean globals.css, update root layout
- [ ] 17-02-PLAN.md — Create component library: Container, Heading, Text, Button, Card, Badge, Input, Select, FadeIn
- [ ] 17-03-PLAN.md — Redesign navigation and refactor shared UI components (PageHeader, StatCard, LoadingSpinner, ErrorAlert, StatsTable)
- [ ] 17-04-PLAN.md — Redesign landing page, login, signup, and onboarding pages
- [ ] 17-05-PLAN.md — Migrate league list, connect, and dashboard pages with league components
- [ ] 17-06-PLAN.md — Migrate trades, waivers, standings pages with player/impact components
- [ ] 17-07-PLAN.md — Migrate trends, moves, projections pages with chart theming
- [ ] 17-08-PLAN.md — Migrate draft rankings, auction, lineup, streaming, and admin pages
- [ ] 17-09-PLAN.md — Remove legacy config, verify no anti-patterns, visual verification checkpoint

### Phase 18: Refactor dashboard from card-based SaaS layout into composition-driven layout inspired by high-end creative web design

**Goal:** Transform the league dashboard from a card-grid SaaS layout into a composition-driven editorial layout with DM Serif Display typography, section-based background alternation, asymmetric grids, oversized impact numbers, and reduced visual borders
**Depends on:** Phase 17
**Success Criteria** (what must be TRUE):
  1. DM Serif Display renders on display-scale and h1/h2 headings; Inter on body/UI
  2. Dashboard uses alternating section backgrounds instead of floating Card wrappers
  3. Identity section shows team name, rank, and points with editorial typography scale
  4. Recommended Actions is the dominant visual section with oversized point deltas
  5. Health + chart grid uses asymmetric 8/4 column layout
  6. Quick actions rendered as compact text links, not bordered icon cards
  7. Data tables use tighter padding with text-data monospace for values
  8. All existing functionality preserved (team selector, auth modal, snapshot, roster)
**Plans:** 2/2 plans complete

Plans:
- [x] 18-01-PLAN.md — Install DM Serif Display font, configure typography foundation, decompose dashboard into 6 section components with compositional layout — completed 2026-03-03
- [x] 18-02-PLAN.md — Rework ActionItemsList, TeamHealthOverview, CategoryStatsTable, and roster tables to match editorial style, visual verification — completed 2026-03-03

### Phase 19: Apply Phase 18 editorial composition design to Chrome extension package — share design tokens, DM Serif Display font, divider-list patterns, spacing hierarchy, and alternating section backgrounds across popup settings UI and draft sidebar overlay

**Goal:** [To be planned]
**Depends on:** Phase 18
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 19 to break down)

### Phase 20: Deterministic draft engine — inflation model, category gap projections, budget curve, strategy anchors with pivot logic, and structured alert system for extension sidebar

**Goal:** Build a client-side deterministic draft intelligence engine with four pure-function models (inflation, positional scarcity, category gap, budget curve) and a structured alert system, all running in the Chrome extension sidebar during live auction drafts
**Depends on:** Phase 19
**Requirements:** ENGINE-01, ENGINE-02, ENGINE-03, ENGINE-04, ENGINE-05
**Success Criteria** (what must be TRUE):
  1. Inflation model tracks remaining budget vs remaining projected value, recomputes per pick, clamped 0.5-2.0
  2. Positional scarcity model computes supply/demand/tier_drop_value/scarcity_index per position
  3. Category projection engine computes z-score gaps per category for user's team vs league average
  4. Budget curve model computes budget_pressure, optimal_remaining_spend, max_bid_recommendation
  5. Structured alert system surfaces alerts with severity > 0.65 in the sidebar UI
  6. All engine code is pure deterministic functions (no AI computation)
  7. Engine recomputes in < 300ms with performance logging
**Plans:** 2/2 plans complete

Plans:
- [ ] 20-01-PLAN.md — Extend Zustand store with allTeamBudgets and leagueCategories, create lib/engine/ with inflation, scarcity, category-gap, budget-curve models, alert generator, and orchestrator
- [ ] 20-02-PLAN.md — Create useDraftEngineSignals hook, EngineAlerts and EngineInsights components, integrate into DraftSidebar, upgrade AuctionBudgetTracker

### Phase 21: Dynamic build archetype analysis — show how roster commitments constrain remaining draft strategy using FanGraphs projections and auction values

**Goal:** Show the user during a live auction draft how their roster picks shape their team archetype and what strategic paths remain, by computing category ceilings via greedy fill, classifying build archetypes, and identifying pivot players — all using bundled FanGraphs projections and auction values running offline in the extension sidebar
**Depends on:** Phase 20
**Success Criteria** (what must be TRUE):
  1. FanGraphs leaderboard projections and auction calculator data bundled as typed JSON assets in the extension
  2. Category ceilings computed via greedy fill showing current totals, optimal-fill maximums, and competitive targets
  3. Archetype classifier labels the team build (Power Build, Speed Build, Pitching-First, Balanced, etc.) with confidence indicator
  4. Punt detection flags categories where ceiling falls below 70% of competitive target
  5. Pivot players identified — specific affordable undrafted players that would unlock category ceiling improvements
  6. Build Analysis panel replaces Category Gaps section in EngineInsights, collapsed by default
  7. All engine code is pure deterministic functions within 300ms performance budget
**Plans:** 3/3 plans complete

Plans:
- [ ] 21-01-PLAN.md — Convert FanGraphs CSVs to bundled JSON assets, create typed data module, extend engine types with BuildArchetypeSignal
- [ ] 21-02-PLAN.md — Implement computeBuildArchetype pure function with greedy fill, archetype classification, ceiling computation (TDD), wire into engine orchestrator
- [ ] 21-03-PLAN.md — Create BuildArchetypePanel UI component, replace Category Gaps in EngineInsights, visual verification

### Phase 22: AI narrator layer — event-triggered LLM interpretation of deterministic engine signals with tactical commentary, strategy state transitions, and anchor/pivot explanations in the extension sidebar

**Goal:** Add an LLM narration layer that interprets the deterministic engine's structured signals during live auction drafts, providing tactical commentary via a backend OpenAI endpoint called by the extension when meaningful thresholds are met
**Depends on:** Phase 21
**Plans:** 3/3 plans complete

Plans:
- [ ] 22-01-PLAN.md — Install OpenAI SDK, create DraftNarratorAgent with system prompt and gpt-4.1-mini, add POST /api/draft/narrate route
- [ ] 22-02-PLAN.md — Create narrator Zustand store (non-persisted), NarratorPayload type, useNarrator hook with trigger/debounce/session cap, add strategy object to draft store
- [ ] 22-03-PLAN.md — Create DraftNarrator UI component with Ask button and calls counter, StrategySetup component, wire into DraftSidebar

### Phase 23: Roster optimization engine with marginal-value max bid, Monte Carlo draft simulation, dynamic replacement levels, and opponent need modeling — adapted from draft engine spec to TypeScript extension

**Goal:** The extension sidebar provides a data-driven SGP-based max-bid recommendation for every nominated player in an auction draft, backed by greedy roster optimization, Monte Carlo simulation of remaining draft outcomes, and opponent need awareness — all running as pure TypeScript functions within the 100ms performance budget
**Depends on:** Phase 22
**Plans:** 3/3 plans complete

Plans:
- [ ] 23-01-PLAN.md — SGP model with vectorized computation, dynamic replacement levels, and greedy knapsack roster optimizer (TDD)
- [ ] 23-02-PLAN.md — Bid optimizer (binary-search max bid), opponent need model, and Monte Carlo draft simulation (TDD)
- [ ] 23-03-PLAN.md — Wire all modules into computeDraftEngine orchestrator and surface max bid, targets, and bid/pass signals in sidebar UI
