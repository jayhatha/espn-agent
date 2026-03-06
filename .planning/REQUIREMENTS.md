# Requirements: ESPN Fantasy Baseball Command Center

**Defined:** 2026-02-21
**Core Value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions

## v2.0 Requirements

Requirements for Position Shopping List milestone. Each maps to roadmap phases.

### Engine — Position Targets (TARG)

- [ ] **TARG-01**: Engine computes top N available players per unfilled roster position, ranked by adjusted SGP value
- [ ] **TARG-02**: Each target includes max bid estimate and expected market price (opponent model)
- [ ] **TARG-03**: Positions are ordered by a combined priority score blending scarcity urgency, empty roster slot count, and budget fit
- [ ] **TARG-04**: Position targets update dynamically as players are drafted and roster fills
- [ ] **TARG-05**: Multi-position eligible players appear under each position they qualify for

### Engine — Priority Scoring (PRIO)

- [ ] **PRIO-01**: Combined position priority score weights scarcity index, number of empty slots at that position, and remaining budget relative to target prices
- [ ] **PRIO-02**: Positions with zero unfilled slots are excluded from the shopping list
- [ ] **PRIO-03**: Priority re-sorts after each pick as scarcity and roster state change

### UI — Shopping List Display (SHOP)

- [ ] **SHOP-01**: Shopping list replaces the current Top Targets section in the EngineInsights sidebar
- [ ] **SHOP-02**: Each position shown as a collapsible group with position label and priority indicator
- [ ] **SHOP-03**: Each player row shows name, max bid, expected market price, and value surplus
- [ ] **SHOP-04**: Position groups are ordered by combined priority score (most urgent first)
- [ ] **SHOP-05**: Shopping list collapses gracefully when no unfilled positions remain

## v1.1 Requirements (Completed)

### Multi-Player Trade Evaluation

- [x] **TRADE-01**: User can propose an N-for-M trade (up to 3-for-3) and see projected standings impact per category
- [x] **TRADE-02**: System validates roster slot constraints before showing trade impact (prevents illegal trade proposals)
- [x] **TRADE-03**: User sees category-by-category impact breakdown (HR rank, RBI rank, AVG rank, etc.) for proposed multi-player trades
- [x] **TRADE-04**: Trade simulation uses component-based rate stat math (H/AB not averaged rates) with integration tests

### Historical Data & Backfill

- [x] **HIST-01**: Admin can trigger historical data backfill from ESPN API for a league's past season
- [x] **HIST-02**: Backfill runs as background job with progress tracking (not blocking UI)
- [x] **HIST-03**: Backfill respects ESPN rate limits (throttled requests, exponential backoff on 429)
- [x] **HIST-04**: Transaction deduplication via hash prevents duplicate entries during backfill

### Season Timeline & Replay

- [x] **TIME-01**: User can view week-by-week standings progression as a line chart for any season with data
- [x] **TIME-02**: Timeline shows transaction annotations (trades, waiver adds/drops) at the weeks they occurred
- [x] **TIME-03**: User can select different seasons/date ranges for the timeline view

## Deferred

### Mastra AI Agent (v2.1)

- **MSTR-01**: Mastra agent on Fastify backend with tools for draft engine signals
- **MSTR-02**: Typed tools (Zod-validated I/O) for inflation, scarcity, standings, budget, archetype
- **MSTR-03**: Session memory so the agent remembers earlier strategy advice within a draft
- **MSTR-04**: Streaming SSE responses for real-time feel in the extension sidebar
- **MSTR-05**: Replace ad-hoc narrator prompt engineering with structured tool use

*Research complete: see `.planning/research/` for Stack, Features, Architecture, Pitfalls analysis.*

### Trade Retrospectives (from v1.1)

- **RETRO-01**: User can view trade history showing all past trades with players, dates, and teams involved
- **RETRO-02**: Each past trade shows actual vs projected outcomes
- **RETRO-03**: Past trades display accuracy indicators

### Trade Evaluation

- **TRADE-05**: Interactive trade builder with live impact preview as players are added/removed
- **TRADE-06**: Multi-player trade suggestion generation (AI finds optimal combos)

### Historical Analysis

- **HIST-05**: What-if counterfactual analysis (simulate alternate trade decisions)
- **HIST-06**: Automated historical backfill on league connect (background, not blocking)

## Out of Scope

| Feature | Reason |
|---------|--------|
| AI/LLM agent integration | Deferred to v2.1 — research complete, implement after shopping list proves value |
| Web app changes | Extension sidebar only for draft features |
| Snake draft support | Auction-only for now — different paradigm |
| New data sources | Uses existing FanGraphs projections and engine signals |
| Autonomous bidding | Agent/engine advises, user decides |
| Real-time trade notifications | Scope creep — requires polling ESPN every N minutes |
| Keeper/dynasty trade value | Multi-year impact requires future projections and draft pick valuation |
| Points league support | Roto category leagues only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRADE-01 | Phase 6 | Complete |
| TRADE-02 | Phase 6 | Complete |
| TRADE-03 | Phase 6 | Complete |
| TRADE-04 | Phase 6 | Complete |
| HIST-01 | Phase 7 | Complete |
| HIST-02 | Phase 7 | Complete |
| HIST-03 | Phase 7 | Complete |
| HIST-04 | Phase 7 | Complete |
| TIME-01 | Phase 7 | Complete |
| TIME-02 | Phase 8 | Complete |
| TIME-03 | Phase 8 | Complete |
| TARG-01 | Phase 26 | Pending |
| TARG-02 | Phase 26 | Pending |
| TARG-03 | Phase 26 | Pending |
| TARG-04 | Phase 26 | Pending |
| TARG-05 | Phase 26 | Pending |
| PRIO-01 | Phase 26 | Pending |
| PRIO-02 | Phase 26 | Pending |
| PRIO-03 | Phase 26 | Pending |
| SHOP-01 | Phase 27 | Pending |
| SHOP-02 | Phase 27 | Pending |
| SHOP-03 | Phase 27 | Pending |
| SHOP-04 | Phase 27 | Pending |
| SHOP-05 | Phase 27 | Pending |

**Coverage:**
- v2.0 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-21*
*Last updated: 2026-03-05 after v2.0 roadmap creation (Phases 26-27)*
