# Roadmap: ESPN Fantasy Baseball Command Center

## Milestones

- ✅ **v1.0 MVP** - Phases 1-5 (shipped 2026-02-21)
- ✅ **v2.0 Position Shopping List** - Phases 6-38 (shipped 2026-03-14)
- ✅ **v3.0 Draft Automation & Mobile Command Center** - Phases 39-42 (shipped 2026-03-14)
- ✅ **v4.0 Personal Season Setup** - Phases 43-46 (shipped 2026-03-15)
- ✅ **v5.0 Draft Engine Spec Alignment** - Phases 48-64 (shipped 2026-03-23)
- 🚧 **v6.0 In-Season Command Center** - Phases 65-70 (in progress)

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

<details>
<summary>✅ v5.0 Draft Engine Spec Alignment (Phases 48-64) - SHIPPED 2026-03-23</summary>

Phases 48-64: Nomination strategy rework, positional weights and SP tiers, inflation bands, extension sidebar UI (Grafana dark theme, signal strip, category heatmap), UI polish, auction engine test suite, extension draft reliability, draft logic audit, simulation test suite, max bid / positional need, bid engine tuning, SP logic fix, dynamic SGP recalculation, priority-scored auction engine (EV-based), mobile draft companion with manual bid/nominate controls, dynamic budget allocation — ~35 plans completed. Phases 47 (Endgame Mode) and 51 (Data Pipeline) dropped as superseded.

</details>

### v6.0 In-Season Command Center (In Progress)

**Milestone Goal:** Transform the in-season dashboard into a Linear-style dark trading terminal — on-pace roto tracker, category opportunity map, FAAB pacing, GS pacing with SP start planner, roto-point-aware waiver and trade analysis, and automatic trade finder.

- [x] **Phase 65: Dark Mode Shell** - Linear-style dark layout with left nav, top bar, typography, and full-app dark theme (completed 2026-03-23)
- [ ] **Phase 66: Roto Math Foundation** - Projected standings with live roto points, marginal gain engine, category pace visualization
- [x] **Phase 67: Net Waiver Analysis + Category Opportunity** - Enhanced waiver labels, category opportunity map with difficulty, at-risk summary (completed 2026-03-23)
- [x] **Phase 68: FAAB Tracking + Pitching Usage** - FAAB budget tracker with ROI + GS/K pacing with SP start planner (completed 2026-03-23)
- [x] **Phase 69: Trade Finder** - Roto-point-framed trade impact and automatic 1-for-1 trade finder (completed 2026-03-23)
- [x] **Phase 70: Trends and Efficiency** - Hot/cold player trends and lineup efficiency tracking (completed 2026-03-23)

## Phase Details

### Phase 65: Dark Mode Shell
**Goal**: Users navigate a fully dark Linear-style command center with left sidebar, top summary bar, and consistent dark typography across all pages
**Depends on**: Nothing (v6.0 foundation)
**Requirements**: SHELL-01, SHELL-02, SHELL-03, SHELL-04, SHELL-05, SHELL-06, SHELL-07
**Success Criteria** (what must be TRUE):
  1. Every page renders on #0B0D10 background with #111318 panels and #1D2128 borders — no white or light-mode surfaces visible anywhere
  2. Left sidebar shows all 9 nav items (Dashboard, Standings, Categories, Roster, Waivers, FAAB Market, Pitching Usage, Trades, Settings) with icon + label
  3. Top bar displays league name, current week, FAAB remaining, GS pace, and projected total points on every sub-page
  4. All numbers render in JetBrains Mono; all headers and body text render in Inter
  5. Right signals panel shows contextual daily action items that update per page
**Plans**: 4 plans
Plans:
- [ ] 65-01-PLAN.md — Dark mode foundation: next-themes, Tailwind config, shell tokens, JetBrains Mono
- [ ] 65-02-PLAN.md — Shell layout + components: LeagueNav, TopBar, SignalsPanel, settings stub
- [ ] 65-03-PLAN.md — Dark variant migration: all 16 UI components restyled for dark mode
- [ ] 65-04-PLAN.md — Page-level dark migration: dark overrides on all 17 page/section files under leagues/[id]/

### Phase 66: Roto Math Foundation
**Goal**: Users can see their projected roto standings with live rank-based points, per-category pace bars, and hover-to-inspect gap detail
**Depends on**: Phase 65
**Requirements**: ROTO-01, ROTO-02, ROTO-03, ROTO-05, ROTO-07, ROTO-08
**Success Criteria** (what must be TRUE):
  1. Projected standings table shows all 13 teams with current roto points, projected final roto points, and point change since last snapshot
  2. Roto points are computed by ranking each team's projected category totals against all other teams (not hardcoded or estimated)
  3. Historical category curves are displayed as fallback visualization when live standings are unavailable
  4. Marginal gain engine returns the cheapest path (stat improvement needed) to gain one roto point in each category
  5. Category pace bars show current total vs projected target with a color-coded progress indicator
  6. Hovering a category row expands to show teams immediately above and below with exact stat gaps
**Plans**: 2 plans
Plans:
- [ ] 66-01-PLAN.md — Roto math engine: interpolateRotoPoints() + computeMarginalGains() pure functions, standings API delta
- [ ] 66-02-PLAN.md — Standings UI upgrade: delta column, pace bars, expandable gap detail, historical fallback charts

### Phase 67: Net Waiver Analysis + Category Opportunity
**Goal**: Waiver recommendations show real roto-point delta (including the drop side) and a category opportunity map prioritizes which categories to target
**Depends on**: Phase 66
**Requirements**: WAIVER-01, WAIVER-02, WAIVER-03, WAIVER-04, WAIVER-05, ROTO-04, ROTO-06
**Success Criteria** (what must be TRUE):
  1. Waiver recommendation delta is computed from real add/drop simulation — the hardcoded 0.5 deltaOverallPoints is gone
  2. Each waiver recommendation shows per-category breakdown: which categories improve and which decline from the add/drop
  3. Marginal analysis label shows "this move gets you +N roto points in category X" for top recommendations
  4. Rate stat add/drop simulation uses component math (ERA, WHIP, OPS recalculated from components — never averaged)
  5. Category opportunity map displays gap-to-next-rank per category with a difficulty rating
  6. "Standings Points at Risk" summary highlights categories where points could shift up or down within the current week
**Plans**: 2 plans
Plans:
- [ ] 67-01-PLAN.md — Backend: enhanced waiver labels, marginal gain difficulty, at-risk categories
- [ ] 67-02-PLAN.md — Frontend: category opportunity map, at-risk summary, waiver marginal labels

### Phase 68: FAAB Tracking + Pitching Usage
**Goal**: Users can track FAAB budget pace against the league and monitor GS usage with weekly start recommendations
**Depends on**: Phase 65 (shell only — independent of waiver math)
**Requirements**: FAAB-01, FAAB-02, FAAB-03, FAAB-04, FAAB-05, PITCH-01, PITCH-02, PITCH-03, PITCH-04, PITCH-05
**Success Criteria** (what must be TRUE):
  1. FAAB page shows my remaining budget vs league average remaining with a spend-rate projection that flags if budget runs out before season end
  2. Bid history lists each claim with won/lost outcome and ROI score (player value gained per FAAB dollar)
  3. Suggested bid amounts reflect remaining budget, weeks left in season, and projected player value
  4. Season GS tracker shows starts used vs 200-start cap with a projected pace line
  5. Weekly GS view shows this week's starts consumed and remaining starts available
  6. SP start planner recommends which SPs to start or sit to keep GS pace on target, with an alert when pace is burning too fast or too slow
**Plans**: 2 plans
Plans:
- [ ] 68-01-PLAN.md — Backend: FaabTrackerAgent + GsPacingAgent agents, FAAB and pitching usage API endpoints
- [ ] 68-02-PLAN.md — Frontend: FAAB Market page with budget gauge + bid history, Pitching Usage page with GS tracker + start planner, TopBar wiring

### Phase 69: Trade Finder
**Goal**: Trade analysis shows roto-point delta with per-category breakdown and an automatic scan surfaces all roto-positive 1-for-1 swaps
**Depends on**: Phase 67 (waiver delta must be correct before trade finder is meaningful)
**Requirements**: TRADE-01, TRADE-02, TRADE-03, TRADE-04, TRADE-05
**Success Criteria** (what must be TRUE):
  1. Trade impact view shows net roto-point delta for any proposed trade with the same math as waiver analysis
  2. Per-category breakdown for a trade shows which categories improve and which decline
  3. Automatic trade finder scans all 12 other teams and returns a ranked list of 1-for-1 swaps that produce a net positive roto-point gain
  4. Trade finder results are ranked by net roto points gained (highest benefit first)
  5. Rate stat adjustments in trade simulation use component math — not counting-stat-only approximations
**Plans**: 2 plans
Plans:
- [ ] 69-01-PLAN.md — Backend: fix rate stat component math in TradeRecommendationAgent to match waiver pattern
- [ ] 69-02-PLAN.md — Frontend: roto-point-framed trade UI with auto finder as primary view

### Phase 70: Trends and Efficiency
**Goal**: Users can see which roster players are running hot or cold over 7 days and how much production is being left on the bench
**Depends on**: Phase 65 (shell only — independent of roto math and waiver delta)
**Requirements**: TREND-01, TREND-02, TREND-03, TREND-04, TREND-05
**Success Criteria** (what must be TRUE):
  1. Hot/cold panel shows 7-day trend for every player on the active roster with directional indicator
  2. Hot players are highlighted by OPS surge, HR burst, or K spike — label identifies which stat is driving the heat
  3. Cold players are flagged with a declining production indicator so the user knows who to consider dropping
  4. Lineup efficiency view shows production from benched players (HR, SB, OPS missed) for each recent day
  5. A warning indicator appears when a benched player produced more than a started player at the same position
**Plans**: 2 plans
Plans:
- [ ] 70-01-PLAN.md — Backend trends API: hot/cold 7-day rolling stats + lineup efficiency endpoints
- [ ] 70-02-PLAN.md — Frontend trends UI: hot/cold panel with driving stat labels + lineup efficiency view with bench warnings

## Progress

**Execution Order:**
Phase 65 (shell) → Phase 66 (roto math) → Phase 67 (waiver delta + category map). Phases 68 and 70 depend only on Phase 65 and can run after it. Phase 69 depends on Phase 67.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 65. Dark Mode Shell | 4/4 | Complete    | 2026-03-23 | - |
| 66. Roto Math Foundation | v6.0 | 0/2 | Not started | - |
| 67. Net Waiver Analysis + Category Opportunity | 2/2 | Complete    | 2026-03-23 | - |
| 68. FAAB Tracking + Pitching Usage | 2/2 | Complete    | 2026-03-23 | - |
| 69. Trade Finder | 2/2 | Complete    | 2026-03-23 | - |
| 70. Trends and Efficiency | 2/2 | Complete    | 2026-03-23 | - |

### Phase 71: Moves page data population — transaction ingestion, FAAB bid history, move impact computation

**Goal:** Populate the moves page with real data by fixing disconnected data pipeline: dynamic season defaults, UI trigger for impact computation, and actionable empty states
**Depends on:** Phase 70
**Requirements:** MOVES-01, MOVES-02, MOVES-03, MOVES-04
**Plans:** 1/1 plans complete

Plans:
- [x] 71-01-PLAN.md — Fix season defaults, add Compute Impacts button, improve empty states
