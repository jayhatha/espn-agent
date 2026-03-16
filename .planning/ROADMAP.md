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
| 53. UI Polish | 1/3 | In Progress|  | - |
