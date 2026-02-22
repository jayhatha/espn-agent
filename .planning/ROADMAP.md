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
- [ ] **Phase 9: Trade Retrospectives** - Actual vs projected outcomes with accuracy indicators

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
  3. Each move shows roto-points impact computed via counterfactual analysis (actual vs what-if-you-hadn't-made-this-move)
  4. Frontend shows impact timeline, move leaderboard (best/worst moves), and draft pick report
**Plans:** 4 plans

Plans:
- [ ] 09-01-PLAN.md — Migration + backfill modification to store per-player per-period stats + re-backfill
- [ ] 09-02-PLAN.md — Roster move derivation + impact computation agent with counterfactual analysis
- [ ] 09-03-PLAN.md — API endpoints for transaction impacts, draft report, and compute trigger
- [ ] 09-04-PLAN.md — Frontend moves page with impact timeline, leaderboard, and draft report tabs

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
| 9. Transaction Impact (Roto WPA) | v1.1 | 0/4 | Not started | - |
