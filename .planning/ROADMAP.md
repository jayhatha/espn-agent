# Roadmap: ESPN Fantasy Baseball Command Center

## Milestones

- ✅ **v1.0 MVP** - Phases 1-5 (shipped 2026-02-21)
- ✅ **v2.0 Position Shopping List** - Phases 6-38 (shipped 2026-03-14)
- ✅ **v3.0 Draft Automation & Mobile Command Center** - Phases 39-42 (shipped 2026-03-14)
- ✅ **v4.0 Personal Season Setup** - Phases 43-46 (shipped 2026-03-15)
- 🚧 **v5.0 Draft Engine Spec Alignment** - Phases 47-50 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) - SHIPPED 2026-02-21</summary>

Phase 1: Foundation, Phase 2: Auth, Phase 3: Team Dashboard, Phase 4: Draft Assistant, Phase 5: Admin Dashboard — 18 plans completed.

</details>

<details>
<summary>✅ v2.0 Position Shopping List (Phases 6-38) - SHIPPED 2026-03-14</summary>

Phases 6-38 covering v1.1 trade upgrades, history backfill, Chrome extension, deterministic draft engine, AI narrator, Monte Carlo optimization, projected standings, position shopping list, forward-looking simulation, mobile companion, site redesign, and code/perf/UX audits — 108 plans completed.

</details>

<details>
<summary>✅ v3.0 Draft Automation & Mobile Command Center (Phases 39-42) - SHIPPED 2026-03-14</summary>

Phase 39: DevTools Setup, Phase 40: Auto-Nomination Rework, Phase 41: Mobile Command Center, Phase 42: Phase-Aware Queue Strategy — auto-nomination consolidated with verified selectors, mobile draft companion upgraded to full command terminal.

</details>

<details>
<summary>✅ v4.0 Personal Season Setup (Phases 43-46) - SHIPPED 2026-03-15</summary>

Phase 43: Strip Auth & Env Config, Phase 44: Hardcode League & OPS Math, Phase 45: Fix Draft Extension Detection, Phase 46: Verify In-Season Pipeline — auth stripped, league 112523 hardcoded, extension detection fixed, in-season pipeline verified.

</details>

### v5.0 Draft Engine Spec Alignment (In Progress)

**Milestone Goal:** Align the draft engine with the original auction draft system spec — add endgame mode, rework nomination strategy, implement positional priority weights, SP tier caps, inflation interpretation bands, and budget allocation bands.

- [ ] **Phase 47: Endgame Mode & Budget Bands** - Endgame mode at $20 budget threshold with value_per_dollar scoring, hitter/pitcher budget allocation bands
- [x] **Phase 48: Nomination Strategy Rework** - Nominate overpriced players (espn_price - model_value) to force league overspending (completed 2026-03-15)
- [x] **Phase 49: Positional Weights & SP Tiers** - Positional priority weights, SP1-SP5 tier caps, 200 GS cap awareness (completed 2026-03-15)
- [x] **Phase 50: Inflation Bands & Category Targets** - Inflation interpretation bands with bid ceiling adjustments, per-category competitive targets (completed 2026-03-15)
- [ ] **Phase 51: Data Pipeline for Extension** - Easy projection + ESPN value loading into extension via CSV upload or DOM scrape
- [x] **Phase 52: Extension Sidebar UI Update** - Display endgame mode, inflation bands, budget bands, SP tiers, positional weights, category targets, nomination reason (completed 2026-03-16)

## Phase Details

### Phase 47: Endgame Mode & Budget Bands
**Goal**: Engine activates endgame mode when budget <= $20 with value_per_dollar scoring, and enforces hitter/pitcher budget allocation bands
**Depends on**: Nothing (first v5.0 phase)
**Requirements**: END-01, END-02, END-03
**Success Criteria** (what must be TRUE):
  1. When budget_remaining <= $20, bidding switches to value_per_dollar scoring
  2. Endgame mode prioritizes breakout hitters, cheap OF, K pitchers; avoids backup C
  3. Budget allocation suggests hitter target $185-205, pitcher target $55-70, bench $5
**Plans**: TBD

### Phase 48: Nomination Strategy Rework
**Goal**: Nomination strategy nominates overpriced players (espn_price - model_value) to force league overspending and inflate the remaining player pool
**Depends on**: Nothing
**Requirements**: NOM-07, NOM-08
**Success Criteria** (what must be TRUE):
  1. nomination_score = espn_avg_salary - model_dollar_value (highest = most overpriced)
  2. Overpriced players nominated early to drain opponent budgets
  3. Strategy integrates with existing phase-aware queue (early=overpriced, late=own targets)
**Plans**: TBD

### Phase 49: Positional Weights & SP Tiers
**Goal**: Positional priority weights influence bid decisions, SP tier caps limit pitcher spending, 200 GS cap awareness
**Depends on**: Nothing
**Requirements**: POS-01, POS-02, POS-03
**Success Criteria** (what must be TRUE):
  1. Positional weights (SS +4, OF +3, 3B +3, 1B +2, 2B +2, C +1) adjust bid ceilings
  2. SP spending capped by tier: SP1 $12-18, SP2 $8-12, SP3 $6-10, SP4 $3-5, SP5 $1-3
  3. Engine accounts for 200 GS cap in pitcher valuation
**Plans**: TBD

### Phase 50: Inflation Bands & Category Targets
**Goal**: Inflation interpretation bands drive bid adjustments, per-category targets guide draft strategy
**Depends on**: Phase 47
**Requirements**: INF-01, INF-02, INF-03
**Success Criteria** (what must be TRUE):
  1. Inflation bands classified: <1.00 overspending, 1.00-1.05 neutral, 1.05-1.15 buying window, >1.15 strong value
  2. Bid ceiling gets +2 adjustment when inflation > 1.10
  3. Category targets set: OPS top 3, HR top 3, SB top 4, Saves top 4, K top 5
**Plans**: TBD

### Phase 51: Data Pipeline for Extension
**Goal**: Easy way to load FanGraphs projections and ESPN auction values into the extension
**Depends on**: Nothing
**Requirements**: DATA-01, DATA-02
**Success Criteria** (what must be TRUE):
  1. User can load FanGraphs projections into extension (CSV file or paste into popup)
  2. User can load ESPN auction values (DOM scrape from ESPN page or CSV upload)
  3. Loaded data persists in extension storage across page reloads
**Plans**: TBD

### Phase 52: Extension Sidebar UI Update
**Goal**: Grafana-inspired dark mode sidebar displaying all v5.0 engine signals with streamlined section layout
**Depends on**: Phases 47-51
**Requirements**: UI-THEME, UI-STORE-DEFAULTS, UI-SIGNAL-STRIP, UI-CATEGORY-HEATMAP, UI-POSITION-SUPPLY, UI-NEXT-NOMINEE, UI-SECTION-ORDER, UI-DARK-RESKIN, UI-REMOVALS, UI-NOMINATED-PLAYER, UI-HEADER, UI-AUCTION-RECS
**Success Criteria** (what must be TRUE):
  1. Sidebar shows endgame mode indicator (red badge when budget <= $20)
  2. Inflation band displayed with color coding (red/yellow/green/blue)
  3. Budget allocation shows hitter/pitcher spent vs target bands
  4. SP tier progress shows drafted count and next tier cap
  5. Nomination reason shows strategy tag (Budget Drain, Own Target, Overpriced)
  6. Category heatmap with rank-colored bars and click-toggle
**Plans**: 3 plans

Plans:
- [ ] 52-01-PLAN.md — Grafana dark palette tokens + store defaults
- [ ] 52-02-PLAN.md — New display components (SignalStrip, CategoryHeatmap, PositionSupplyHeatmap, NextNominee)
- [ ] 52-03-PLAN.md — DraftSidebar rewrite + component reskins

### Phase 53: UI Polish: Consistent typography, legible dark-mode colors, and professional operations dashboard styling across all sidebar components using Inter font family

**Goal:** Consistent Inter typography, AA-compliant dark-mode colors, and uniform dashboard styling across all extension sidebar components
**Depends on:** Phase 52
**Requirements:** UI-TYPOGRAPHY, UI-LEGIBILITY, UI-CONSISTENCY
**Success Criteria** (what must be TRUE):
  1. All components use Inter font (no DM Serif Display references)
  2. All text meets WCAG AA contrast on dark backgrounds
  3. Zero light-mode tokens (text-content-*, bg-surface-*) in auction sidebar components
  4. Consistent section headers, badges, player names, and dollar amounts across all components
  5. No arbitrary text-[10px] values — all using text-label or text-caption tokens
**Plans**: 3 plans

Plans:
- [ ] 53-01-PLAN.md — Tailwind config tokens + content.css cleanup
- [ ] 53-02-PLAN.md — Active sidebar component typography and color migration
- [ ] 53-03-PLAN.md — AuctionPlayerCard and preserved component migration

## Progress

**Execution Order:**
Phases 47, 48, 49, 51 can execute in parallel. Phase 50 depends on 47.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 47. Endgame Mode & Budget Bands | v5.0 | 0/? | Not started | - |
| 48. Nomination Strategy Rework | 1/1 | Complete   | 2026-03-15 | - |
| 49. Positional Weights & SP Tiers | 1/1 | Complete   | 2026-03-15 | - |
| 50. Inflation Bands & Category Targets | 1/1 | Complete   | 2026-03-15 | - |
| 51. Data Pipeline for Extension | v5.0 | 0/? | Not started | - |
| 52. Extension Sidebar UI Update | 3/3 | Complete    | 2026-03-16 | - |
| 53. UI Polish | 3/3 | Complete    | 2026-03-16 | - |
| 54. Auction Engine Test Suite | v5.0 | 3/3 | Complete | 2026-03-17 |
| 55. Extension Draft Reliability | 3/3 | Complete   | 2026-03-17 | - |

### Phase 54: Auction engine test suite: unit tests for bid ceiling, inflation, SGP, roster constraints; simulation tests for strategy validation; scenario tests for edge cases

**Goal:** Comprehensive test coverage for v5.0 auction engine — unit tests for inflation, budget curve, draft constants, bid ceiling, and roster constraints; simulation tests for strategy validation; scenario tests for edge cases
**Depends on:** Phase 53
**Requirements:** TEST-UNIT, TEST-SIM, TEST-SCENARIO
**Success Criteria** (what must be TRUE):
  1. All v5.0 engine modules (inflation, budget-curve, draft-constants) have dedicated test files
  2. Bid ceiling tests verify BID/PASS decisions with inflation and positional adjustments
  3. Roster constraint tests verify budget limits, slot filling, SP tier caps, and backfill
  4. Simulation tests confirm value-drafting strategy outperforms random
  5. Scenario tests verify correct behavior under early value run, late inflation, position scarcity, and endgame conditions
**Plans**: 3 plans

Plans:
- [ ] 54-01-PLAN.md — Unit tests for inflation, budget-curve, draft-constants
- [ ] 54-02-PLAN.md — Bid ceiling decision tests + roster constraint enforcement tests
- [ ] 54-03-PLAN.md — Simulation strategy validation + scenario edge case tests

### Phase 55: Extension draft reliability — opponent model fix, inflation wiring, test stabilization

**Goal:** Fix broken opponent model position tracking, wire live inflation into runtime engine, stabilize failing tests
**Depends on:** Phase 54
**Requirements:** RELIABILITY-01, RELIABILITY-02, RELIABILITY-03
**Success Criteria** (what must be TRUE):
  1. Opponent model uses pick.positions directly (not broken index-based pool lookup)
  2. competitionFactors and teamNeeds reflect actual draft state
  3. computeInflation called with real data (not neutral placeholder)
  4. generateAlerts receives inflation parameter (fixes type mismatch)
  5. All 10 previously-failing tests pass (archetype fixtures + perf thresholds)
**Plans**: 3 plans

Plans:
- [ ] 55-01-PLAN.md — Fix opponent model position tracking + tests
- [ ] 55-02-PLAN.md — Wire inflation into runtime engine
- [ ] 55-03-PLAN.md — Fix failing archetype, draft-simulator, monte-carlo tests

### Phase 56: Audit draft logic for value strategy consistency and spec compliance — verify bid controller, engine signals, UI components, and constants against auction draft spec (13 teams)

**Goal:** Audit all draft logic for consistency with value draft strategy and spec compliance (13 teams)
**Depends on:** Phase 55
**Requirements:** AUDIT-01, AUDIT-02
**Plans:** 2 plans

Plans:
- [ ] 56-01-PLAN.md — Fix totalTeams default (12->13), consolidate HITTER_BUDGET_MAX, fix hardcoded budget in UI
- [ ] 56-02-PLAN.md — Consolidate nomination scoring, verify BidVerdict async bid display

### Phase 57: Auction simulation test suite — run value strategy against simulated opponents with real FanGraphs player pool, verify spec targets: roster value >= $320, profit >= $70, top-4 category finishes >= 60%

**Goal:** Fix auction simulator to match live engine bidding behavior -- expand player pool to include PL-ranked SPs, align computeOurBid with strategy-caps.ts, enforce bench composition
**Depends on:** Phase 56
**Requirements:** SIM-01, SIM-02
**Plans:** 1/1 plans complete

Plans:
- [ ] 57-01-PLAN.md -- Fix simulator: player pool, bid computation, bench enforcement, 1000-sim validation

### Phase 58: Audit max bid and ideal roster logic — introduce positional need as a bid factor, suppress bids on positions with filled dedicated and flex slots unless the player is elite

**Goal:** Add positional need multiplier to bid caps — reduce bids for UTIL-bound (0.7x) and BN-bound (0.5x) players, with elite override for top-value players
**Depends on:** Phase 57
**Plans:** 1/1 plans complete

Plans:
- [ ] 58-01-PLAN.md — Need multiplier in strategy caps + BidVerdict display

### Phase 59: Bid engine tuning — use SGP directly when higher than ASV (skip blend), exempt DH from UTIL-only bid cap, spend all $260, update simulator to match

**Goal:** Three bid engine tuning changes: skip ASV blend when SGP is higher, exempt DH from UTIL-only bid cap, add budget flush to spend all $260
**Depends on:** Phase 58
**Requirements:** BID-01, BID-02, BID-03, BID-04
**Plans:** 2/2 plans complete

Plans:
- [ ] 59-01-PLAN.md — SGP skip blend + DH UTIL exemption + budget flush in engine + tests
- [ ] 59-02-PLAN.md — Mirror changes in simulator + 2000-sim validation

### Phase 60: Evaluate and fix starting pitcher logic in bid engine — verify SP tier caps (PL rank determines tier, cap is floor+ceiling for top 60), SP savings reallocation, target 7SP+5RP composition, RP $15 hard cap, no pitcher SGP multiplier, update simulator to match

**Goal:** Fix SP savings reallocation bug (slot-position ideal vs per-SP rank-based tier caps), verify all SP/RP rules, add 7SP+5RP composition targeting, audit pitching-vs-hitting conflicts
**Depends on:** Phase 59
**Requirements:** SP-TIER, SP-SAVINGS, SP-COMP, RP-CAP, PITCHER-SGP, HIT-PITCH-CONFLICT
**Plans:** 3/3 plans complete

Plans:
- [x] 60-01-PLAN.md — Fix SP savings to use per-SP rank-based tier caps + tests for all SP/RP rules
- [x] 60-02-PLAN.md — Mirror fixes in simulator + 7SP+5RP composition + pitching-vs-hitting conflict audit
- [ ] 60-03-PLAN.md — Gap closure: fix endgame dampening violating ranked SP tier floor + register requirement IDs

### Phase 61: Dynamic SGP recalculation during draft — recompute player values as pool shrinks, anchor from static SGP baseline, update replacement levels and inflation live, fix simulator to draft real hitters and RPs

**Goal:** Recompute SGP per-pick as the player pool shrinks, anchored from static baseline. Fix simulator to draft quality hitters (ASV >= $3) and RPs, fill all 28 roster slots. Validate with 10k sims.
**Depends on:** Phase 60
**Plans:** 1/2 plans executed
**Requirements:** DYN-SGP, SIM-ROSTER, SIM-RP, SIM-BENCH

Plans:
- [ ] 61-01-PLAN.md — TDD: Dynamic SGP recomputation in simulator (5-pick interval) + verify live engine already filters to undrafted players
- [ ] 61-02-PLAN.md — Fix RP cap (conditional on spCount), SP/RP mode roster display, bench hitter reliability, 10k sim validation
