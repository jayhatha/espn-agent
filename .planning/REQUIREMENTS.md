# Requirements: ESPN Fantasy Baseball Command Center

**Defined:** 2026-02-21
**Core Value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions

## v1.1 Requirements

Requirements for v1.1 Trades & History milestone. Each maps to roadmap phases.

### Multi-Player Trade Evaluation

- [x] **TRADE-01**: User can propose an N-for-M trade (up to 3-for-3) and see projected standings impact per category
- [x] **TRADE-02**: System validates roster slot constraints before showing trade impact (prevents illegal trade proposals)
- [ ] **TRADE-03**: User sees category-by-category impact breakdown (HR rank, RBI rank, AVG rank, etc.) for proposed multi-player trades
- [x] **TRADE-04**: Trade simulation uses component-based rate stat math (H/AB not averaged rates) with integration tests

### Historical Data & Backfill

- [ ] **HIST-01**: Admin can trigger historical data backfill from ESPN API for a league's past season
- [ ] **HIST-02**: Backfill runs as background job with progress tracking (not blocking UI)
- [ ] **HIST-03**: Backfill respects ESPN rate limits (throttled requests, exponential backoff on 429)
- [ ] **HIST-04**: Transaction deduplication via hash prevents duplicate entries during backfill

### Season Timeline & Replay

- [ ] **TIME-01**: User can view week-by-week standings progression as a line chart for any season with data
- [ ] **TIME-02**: Timeline shows transaction annotations (trades, waiver adds/drops) at the weeks they occurred
- [ ] **TIME-03**: User can select different seasons/date ranges for the timeline view

### Trade Retrospectives

- [ ] **RETRO-01**: User can view trade history showing all past trades with players, dates, and teams involved
- [ ] **RETRO-02**: Each past trade shows actual vs projected outcomes (projected impact at trade time vs actual result)
- [ ] **RETRO-03**: Past trades display accuracy indicators ("Exceeded projections", "Met projections", "Underperformed")

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Trade Evaluation

- **TRADE-05**: Interactive trade builder with live impact preview as players are added/removed
- **TRADE-06**: Multi-player trade suggestion generation (AI finds optimal combos)

### Historical Analysis

- **HIST-05**: What-if counterfactual analysis (simulate alternate trade decisions)
- **HIST-06**: Automated historical backfill on league connect (background, not blocking)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time trade notifications | Scope creep — requires polling ESPN every N minutes |
| Keeper/dynasty trade value | Multi-year impact requires future projections and draft pick valuation |
| Automated roster moves via ESPN API | ESPN has no official write API; ToS risk |
| Points league support | Roto category leagues only for v1 |
| Custom stat categories (QS, K/9, OPS+) | Standard categories only for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRADE-01 | Phase 6 | Complete |
| TRADE-02 | Phase 6 | Complete |
| TRADE-03 | Phase 6 | Pending |
| TRADE-04 | Phase 6 | Complete |
| HIST-01 | Phase 7 | Pending |
| HIST-02 | Phase 7 | Pending |
| HIST-03 | Phase 7 | Pending |
| HIST-04 | Phase 7 | Pending |
| TIME-01 | Phase 7 | Pending |
| TIME-02 | Phase 8 | Pending |
| TIME-03 | Phase 8 | Pending |
| RETRO-01 | Phase 9 | Pending |
| RETRO-02 | Phase 9 | Pending |
| RETRO-03 | Phase 9 | Pending |

**Coverage:**
- v1.1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0
- Coverage: 100% ✓

---
*Requirements defined: 2026-02-21*
*Last updated: 2026-02-21 after roadmap creation*
