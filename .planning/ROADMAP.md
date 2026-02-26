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
| 11. Draft Assistant Enhancements | 5/5 | Complete    | 2026-02-25 | - |

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
**Plans:** 3/5 plans executed

Plans:
- [x] 12-01-PLAN.md — Fix critical bugs: injury data extraction, draft recommendations endpoint, DOM selector validation — completed 2026-02-26
- [ ] 12-02-PLAN.md — Wire up free agent fetch and make fuzzy player matching primary path
- [ ] 12-03-PLAN.md — Replace hardcoded API URLs and add empty array guards
