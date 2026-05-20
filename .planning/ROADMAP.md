# Roadmap: ESPN Fantasy Baseball Command Center

## Milestones

- ✅ **v1.0 MVP** - Phases 1-5 (shipped 2026-02-21)
- ✅ **v2.0 Position Shopping List** - Phases 6-38 (shipped 2026-03-14)
- ✅ **v3.0 Draft Automation & Mobile Command Center** - Phases 39-42 (shipped 2026-03-14)
- ✅ **v4.0 Personal Season Setup** - Phases 43-46 (shipped 2026-03-15)
- ✅ **v5.0 Draft Engine Spec Alignment** - Phases 48-64 (shipped 2026-03-23)
- ✅ **v6.0 In-Season Command Center** - Phases 65-86 (shipped 2026-05-05)
- ✅ **v7.0 Architectural Stabilization** - Phases 87-88 (shipped 2026-05-05)
- ✅ **v8.0 Deep Architecture** - Phases 89-93 (shipped 2026-05-06)
- ✅ **v9.0 Architectural Philosophy Remediation** - Phases 94-97 (shipped 2026-05-06)
- ⏸️ **v10.0 Architecture Improvements** - Phases 98-102 (paused 2026-05-16)
- ✅ **v11.0 Projected Season Simulation Engine** - Phases 103-107 (complete — 2026-05-17)
- ✅ **v12.0 Scenario Recommendation Integrity** - Phase 108 (shipped 2026-05-18)
- 🔄 **v13.0 Architecture Deepening** - Phases 109-113 (in progress 2026-05-19)

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

### v6.0 In-Season Command Center (Complete — 2026-05-04)

**Milestone Goal:** Transform the in-season dashboard into a Linear-style dark trading terminal — on-pace roto tracker, category opportunity map, FAAB pacing, GS pacing with SP start planner, roto-point-aware waiver and trade analysis, and automatic trade finder.

- [x] **Phase 65: Dark Mode Shell** - Linear-style dark layout with left nav, top bar, typography, and full-app dark theme (completed 2026-03-23)
- [x] **Phase 66: Roto Math Foundation** - Projected standings with live roto points, marginal gain engine, category pace visualization (completed 2026-03-23)
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
   **Plans**: 4/4 plans complete
   Plans:

- [x] 65-01-PLAN.md — Dark mode foundation: next-themes, Tailwind config, shell tokens, JetBrains Mono
- [x] 65-02-PLAN.md — Shell layout + components: LeagueNav, TopBar, SignalsPanel, settings stub
- [x] 65-03-PLAN.md — Dark variant migration: all 16 UI components restyled for dark mode
- [x] 65-04-PLAN.md — Page-level dark migration: dark overrides on all 17 page/section files under leagues/[id]/

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
   **Plans**: 2/2 plans complete
   Plans:

- [x] 66-01-PLAN.md — Roto math engine: interpolateRotoPoints() + computeMarginalGains() pure functions, standings API delta
- [x] 66-02-PLAN.md — Standings UI upgrade: delta column, pace bars, expandable gap detail, historical fallback charts

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
   **Plans**: 2/2 plans complete
   Plans:

- [x] 67-01-PLAN.md — Backend: enhanced waiver labels, marginal gain difficulty, at-risk categories
- [x] 67-02-PLAN.md — Frontend: category opportunity map, at-risk summary, waiver marginal labels

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
   **Plans**: 2/2 plans complete
   Plans:

- [x] 68-01-PLAN.md — Backend: FaabTrackerAgent + GsPacingAgent agents, FAAB and pitching usage API endpoints
- [x] 68-02-PLAN.md — Frontend: FAAB Market page with budget gauge + bid history, Pitching Usage page with GS tracker + start planner, TopBar wiring

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
   **Plans**: 2/2 plans complete
   Plans:

- [x] 69-01-PLAN.md — Backend: fix rate stat component math in TradeRecommendationAgent to match waiver pattern
- [x] 69-02-PLAN.md — Frontend: roto-point-framed trade UI with auto finder as primary view

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
   **Plans**: 2/2 plans complete
   Plans:

- [x] 70-01-PLAN.md — Backend trends API: hot/cold 7-day rolling stats + lineup efficiency endpoints
- [x] 70-02-PLAN.md — Frontend trends UI: hot/cold panel with driving stat labels + lineup efficiency view with bench warnings

## Progress

**Execution Order:**
Phase 65 (shell) → Phase 66 (roto math) → Phase 67 (waiver delta + category map). Phases 68 and 70 depend only on Phase 65 and can run after it. Phase 69 depends on Phase 67.

| Phase                                          | Milestone | Plans Complete | Status     | Completed  |
| ---------------------------------------------- | --------- | -------------- | ---------- | ---------- |
| 65. Dark Mode Shell                            | 4/4       | Complete       | 2026-03-23 | -          |
| 66. Roto Math Foundation                       | v6.0      | 2/2            | Complete   | 2026-03-23 |
| 67. Net Waiver Analysis + Category Opportunity | 2/2       | Complete       | 2026-03-23 | -          |
| 68. FAAB Tracking + Pitching Usage             | 2/2       | Complete       | 2026-03-23 | -          |
| 69. Trade Finder                               | 2/2       | Complete       | 2026-03-23 | -          |
| 70. Trends and Efficiency                      | 2/2       | Complete       | 2026-03-23 | -          |

### Phase 71: Moves page data population — transaction ingestion, FAAB bid history, move impact computation

**Goal:** Populate the moves page with real data by fixing disconnected data pipeline: dynamic season defaults, UI trigger for impact computation, and actionable empty states
**Depends on:** Phase 70
**Requirements:** MOVES-01, MOVES-02, MOVES-03, MOVES-04
**Plans:** 1/1 plans complete

Plans:

- [x] 71-01-PLAN.md — Fix season defaults, add Compute Impacts button, improve empty states

### Phase 72: UI audit fixes — mobile responsive layout, TopBar projected stat, semantic token cleanup, error handling

**Goal:** Address all findings from the Phases 65-70 UI audit: fix broken mobile layout, wire TopBar projected stat, replace alert() with inline errors, migrate raw Tailwind colors to semantic tokens, and fix dark mode regressions
**Depends on:** Phase 71
**Requirements:** UI-AUDIT-01, UI-AUDIT-02, UI-AUDIT-03, UI-AUDIT-04, UI-AUDIT-05
**Plans:** 2/2 plans complete

Plans:

- [x] 72-01-PLAN.md — Priority fixes: mobile responsive layout, TopBar projected stat, waivers page error/token fixes
- [x] 72-02-PLAN.md — Token migration: semantic color classes, arbitrary text sizes, date formatting

### Phase 73: Show current and projected stats for each player on waivers and roster pages

**Goal:** Managers see position-aware projected RoS stats and YTD stats inline below each player on the waivers page (manual eval) and in a roster stats section on the lineup page
**Depends on:** Phase 72
**Requirements:** PSTAT-01, PSTAT-02, PSTAT-03, PSTAT-04, PSTAT-05, PSTAT-06
**Plans:** 2/2 plans complete

Plans:

- [x] 73-01-PLAN.md -- Backend API enrichment (currentStats) + shared PlayerStatLine component
- [x] 73-02-PLAN.md -- Wire stat lines into waivers page + roster stats section on lineup page

### Phase 74: Cache and materialize derived data from previous seasons to avoid recalculating immutable historical stats

**Goal:** Eliminate redundant projected standings recomputation for completed seasons by adding a season finalization flag that gates the SnapshotOrchestratorAgent's projection step
**Depends on:** Phase 73
**Requirements:** CACHE-01, CACHE-02, CACHE-03, CACHE-04
**Plans:** 1/1 plans complete

Plans:

- [x] 74-01-PLAN.md — Season metadata table, finalization guard in snapshot orchestrator, auto-finalization in backfill, admin reset endpoint

### Phase 75: Active stats — show each player's stat contribution to a specific team based on roster tenure, not full-season totals

**Goal:** Show each player's stat contribution based on roster tenure — populate player_period_stats during daily snapshots, expose tenure-based stats via API, and display "On Team" stats alongside YTD and Proj RoS on lineup and waivers pages
**Depends on:** Phase 74
**Requirements:** ACTIVE-01, ACTIVE-02, ACTIVE-03, ACTIVE-04, ACTIVE-05, ACTIVE-06
**Plans:** 2/2 plans complete

Plans:

- [x] 75-01-PLAN.md — Backend: enable daily player_period_stats population + extend roster API with tenure stats
- [x] 75-02-PLAN.md — Frontend: add "On Team" label to PlayerStatLine, wire tenure stats into lineup and waivers pages

### Phase 76: API hardening — validate ESPN response shapes, add runtime type guards, log unexpected fields/missing data, add retry with backoff

**Goal:** Harden the ESPN adapter with strengthened Zod schemas covering nested fields normalization relies on, critical-field assertions that throw on structurally broken responses, schema drift logging, and validation wired into all fetch methods
**Requirements**: HARD-01, HARD-02, HARD-03, HARD-04, HARD-05, HARD-06, HARD-07
**Depends on:** Phase 75
**Plans:** 2/2 plans complete

Plans:

- [x] 76-01-PLAN.md — Strengthen Zod schemas (roster entries, scoringItems), add assertEspnCriticalShape + logUnexpectedFields with unit tests
- [x] 76-02-PLAN.md — Wire validation into adapter fetch methods, remove duplicate 429 handler, clean up CLAUDE.md Known Issue #8

### Phase 77: SP sit/start recommendations from Pitcherlist and Rotoballer — scrape weekly rankings, match to rostered SPs, display start/sit verdict with source links

**Goal:** Scrape SP rankings from Pitcherlist (static HTML) and Rotoballer (graceful degradation for JS-rendered content), match rankings against rostered SPs using fuzzy name matching, and display start/sit verdicts with source links on a new Sit/Start tab in the Pitching Usage page
**Requirements**: SITSTART-01, SITSTART-02, SITSTART-03, SITSTART-04, SITSTART-05
**Depends on:** Phase 76
**Plans:** 2/2 plans complete

Plans:

- [x] 77-01-PLAN.md — Backend: cheerio install, Pitcherlist + Rotoballer adapters, SitStartAdvisor agent, API endpoint with tests
- [x] 77-02-PLAN.md — Frontend: Sit/Start tab on Pitching Usage page with verdict badges, source links, and empty state

### Phase 78: Streaming picks: merge Rotoballer verdicts and waiver pickup timing into streaming tab

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 77
**Plans:** 2/2 plans complete

Plans:

- [x] TBD (run /gsd:plan-phase 78 to break down) (completed 2026-03-27)

### Phase 79: Sophisticated Projection Model

**Goal:** Replace naive projection summation with a realistic allocation model that accounts for starting lineup constraints, 200 GS cap, projection staleness, and produces confidence intervals. Reusable for trade/waiver simulation with roster gap detection.
**Depends on:** Phase 78
**Requirements**: PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05, PROJ-06, PROJ-07, PROJ-08, PROJ-09, PROJ-10, PROJ-11, PROJ-12
**Plans:** 4/4 plans complete

Plans:

- [x] 79-01-PLAN.md — Foundation: types, staleness prorating, slot eligibility extraction, FanGraphs G/PA/GS ingest
- [x] 79-02-PLAN.md — Core allocation: hitter lineup assignment, GS cap-aware pitcher scaling
- [x] 79-03-PLAN.md — Pipeline integration: allocateProjections pipeline, variance/confidence interval model
- [x] 79-04-PLAN.md — Agent wiring: replace naive summation in standings, trade, and waiver agents

### Phase 80: Standings Swing Attribution

**Goal:** When projected standings swing significantly between snapshots, surface why: player projection changes, actual performance deviations, or competitor roto point movement. Compare snapshot-over-snapshot deltas at category level, identify driving players, attribute to specific causes.
**Requirements**: TBD
**Depends on:** Phase 79
**Plans:** 3/3 plans complete

Plans:

- [x] 80-01-PLAN.md — TDD: StandingsSwingAttributionAgent with 6 unit tests (three-bucket model, LOWER_BETTER direction, single-snapshot guard)
- [x] 80-02-PLAN.md — API: GET /standings/swing route in timeseries.ts + api.getStandingsSwing() in frontend client
- [x] 80-03-PLAN.md — Frontend: SwingAttributionPanel component + integration into Projected Standings tab

### Phase 81: Live Standings Change Log — Streaming activity feed with Slack-ready notification layer

**Goal:** Dashboard gains a "Change Log" tab showing a real-time streaming feed of standings events: when total roto points change, the entry names which category shifted, who was passed or who passed us, and which player/event was the proximate cause (e.g., "our SP gave up 2 HR → lost 1 pt in ERA"). A notification bus abstraction makes every event deliverable to Slack (or any future channel) without touching the feed logic.
**Requirements**: LOG-01, LOG-02, LOG-03, LOG-04, LOG-05, LOG-06, LOG-07, LOG-08
**Depends on:** Phase 80
**Plans:** 3/3 plans complete

Plans:

- [x] 81-01-PLAN.md — Backend: StandingsChangeLogAgent (snapshot diff → typed events), event persistence table, notification bus interface + no-op Slack adapter
- [x] 81-02-PLAN.md — Backend: SSE endpoint GET /leagues/:id/standings/live-log, snapshot worker hook to emit events on each snapshot, Slack adapter wiring (env-gated)
- [x] 81-03-PLAN.md — Frontend: "Change Log" tab on dashboard with live SSE feed, event cards (category badge, passer/passee, proximate cause), empty + error states

### Phase 82: Live Game Polling — Real-time intra-day standings refresh during MLB game hours

**Goal:** During live game windows (roughly 1pm–midnight ET), poll ESPN's team stats endpoint every 15 minutes, update current standings in real-time, and stream standings changes through the existing SSE/changelog infrastructure. Users get live event cards as games unfold instead of waiting for the overnight snapshot.
**Requirements**: LIVE-01, LIVE-02, LIVE-03, LIVE-04, LIVE-05
**Depends on:** Phase 81
**Plans:** 2/2 plans complete

Plans:

- [x] 82-01-PLAN.md — Backend: LivePollAgent + BullMQ live-poll-worker (15 min cron, game-window guard), live-refresh API route, LIVE_POLL_EVENT emitter extension
- [x] 82-02-PLAN.md — Frontend: game-window indicator, last-polled timestamp, refresh button wired to live-refresh API

---

### Phase 83: Changelog — My-team filter, standings neighborhood panel, play-by-play narrative

**Goal:** Transform the changelog page into a focused command center for the user's own team. (1) Filter the event feed to show only events where the user's team gains or loses roto points. (2) Add a live "standings neighborhood" panel showing overall points for the 2 teams above and 2 below the user in total standings, updated after each live-poll cycle. (3) Rewrite event card narrative to play-by-play style: "[Player] hit a 3-run homer. Now [rank] in HR, passing [opponent]. Now [overall place] overall, passing [opponent]."
**Requirements**: LIVE-06, LIVE-07, LIVE-08
**Depends on:** Phase 82
**Plans:** 2/2 plans complete

Plans:

- [x] 83-01-PLAN.md — Backend: standings neighborhood API endpoint; enrich StandingsChangeLogAgent event narrative with play-by-play description field
- [x] 83-02-PLAN.md — Frontend: filter changelog feed to my-team only; add StandingsNeighborhood component; upgrade EventCard narrative copy

### Phase 84: Streaming Results — Live standings and category rankings with play-by-play event attribution

**Goal:** Rename the "Change Log" feature to "Streaming Results" and upgrade it into a live league standings ticker. The panel shows real current standings (not projections) for the user's team plus the two teams above and two below in overall roto points. Events are filtered to only those that affect current standings, and each event identifies the specific cause — which category changed, the stat event responsible (home run, stolen base, etc.), and the player involved.
**Depends on:** Phase 83
**Requirements:** STREAM-01, STREAM-02, STREAM-03, STREAM-04, STREAM-05, STREAM-06
**Plans:** 2/2 plans complete

Plans:

- [x] 84-01-PLAN.md — Backend: add event_source column to standings_change_event; filter change-log API endpoint to live-only events via ?source=live param; tag live-poll events vs snapshot events at write time
- [x] 84-02-PLAN.md — Frontend: rename Change Log → Streaming Results (nav + page); history feed filtered to live events only; stat abbreviation chips on EventCard (HR/SB/ERA etc.) with full category name alongside

### Phase 85: Waiver page advanced stats columns

**Goal:** Add advanced hitter and pitcher stat columns to the waiver page, including K-BB%, K/9, FIP, xFIP, xERA, SIERA, BABIP, xBA, xSLG, xwOBA, and ISO
**Depends on:** Phase 84
**Requirements:** WAIVER-ADV-01, WAIVER-ADV-02, WAIVER-ADV-03
**Plans:** 1/1 plans complete

Plans:

- [x] 85-01-PLAN.md — Backend/API advanced-stats enrichment + waiver UI columns

### Phase 86: Architecture and Performance — address A1-A8 findings from review

**Goal:** Resolve all 8 architectural and performance findings from the May 2026 codebase review: unify extension endpoint config, promote adapters to singletons, batch standings projection reads, fix React Query key collisions, batch snapshot team writes, pre-index draft board rankings, and centralize query-key factories.
**Depends on:** Phase 85
**Requirements:** ARCH-A1, ARCH-A2, ARCH-A3, ARCH-A4, ARCH-A5, ARCH-A6, ARCH-A7, ARCH-A8
**Plans:** 1/1 plans complete

Plans:

- [x] 86-01-PLAN.md — All A1-A8 architecture and performance fixes

---

## v8.0 Deep Architecture

**Milestone Goal:** Address the five architectural friction points surfaced by the May 2026 codebase architecture review: decompose the fat ESPN adapter, centralize distributed query logic into a SnapshotRepository, extract shared roster simulation out of TradeRecommendationAgent and WaiverRecommendationAgent, consolidate stat component extraction into shared/formulas.ts, and centralize agent construction into an AgentFactory.

### Phase 89: ESPN Adapter Decomposition ✅ COMPLETE

**Goal:** Split the 1200-line ESPNAdapter monolith into three focused modules — EspnHttpClient (throttle, cache, retry), EspnDataNormalizer (raw → canonical), and EspnResponseValidator (schema validation) — with a thin ESPNAdapter facade wiring them together for backward compatibility.
**Depends on:** Phase 88
**Requirements:** ESPN-SPLIT-01, ESPN-SPLIT-02, ESPN-SPLIT-03
**Success Criteria** (what must be TRUE):

1. `EspnHttpClient` owns all HTTP, throttle, cache, and retry logic — no normalization or validation code inside it
2. `EspnDataNormalizer` converts raw ESPN payloads to canonical types without any HTTP or network code
3. `EspnResponseValidator` validates schema shape without any HTTP, cache, or normalization code
4. Existing `ESPNAdapter` public interface (fetchLeague, fetchFreeAgents, normalizeLeagueData, etc.) is unchanged — all callers continue to compile without changes
5. The 7 constant maps (ESPN_STAT_MAP, ESPN_LINEUP_SLOT_MAP, etc.) are implementation details of EspnDataNormalizer, not exported from the adapter facade
6. Tests can instantiate EspnDataNormalizer and EspnResponseValidator without mocking HTTP
   **Plans:** 1/1 plans complete

Plans:

- [x] 89-01-PLAN.md — Split ESPNAdapter into EspnHttpClient, EspnDataNormalizer, EspnResponseValidator sub-modules with backward-compatible facade

### Phase 90: SnapshotRepository Centralization ✅ COMPLETE

**Goal:** Extract a SnapshotRepository module that centralizes the 5+ duplicated Kysely query patterns (getRosterForSnapshot, getLeagueCategoryTotals, getPlayerProjections, getLeagueSettings) so that agents and views call one interface instead of each writing their own SQL.
**Depends on:** Phase 89
**Requirements:** REPO-01, REPO-02, REPO-03
**Success Criteria** (what must be TRUE):

1. `SnapshotRepository` exports at minimum: `getRosterForSnapshot(leagueId, teamId, snapshotDate)`, `getLeagueCategoryTotals(leagueId, snapshotDate)`, `getPlayerProjections(projectionsRunId, playerIds)`, `getLeagueSettings(leagueId)`
2. StandingsProjectionAgent, WaiverRecommendationAgent, TradeRecommendationAgent, FreeAgentView, and TradeView all call SnapshotRepository methods — no raw Kysely roster queries remain in those files
3. The `team_roster_snapshot → player` join is written exactly once (in SnapshotRepository)
4. All existing tests continue to pass
5. SnapshotRepository is injectable (accepts `db: Kysely<Database>`) and testable without a running PostgreSQL instance via mocking
   **Plans:** 1/1 plans complete

Plans:

- [x] 90-01-PLAN.md — Create SnapshotRepository class; migrate 5 callers (StandingsProjectionAgent, WaiverRecommendationAgent, TradeRecommendationAgent, FreeAgentView, TradeView)

### Phase 91: RosterSimulator Extraction ✅ COMPLETE

**Goal:** Extract a RosterSimulator module from the shared simulation logic in TradeRecommendationAgent and WaiverRecommendationAgent — covering roster-change simulation, post-change gap detection, and standing-delta ranking — so both agents call one interface instead of maintaining parallel implementations.
**Depends on:** Phase 90
**Requirements:** SIM-01, SIM-02, SIM-03
**Success Criteria** (what must be TRUE):

1. `RosterSimulator` exports `simulateTrade(roster, tradeProposal, leagueContext): TradeSimulation` and `simulateAddDrop(roster, add, drop, leagueContext): AddDropSimulation`
2. `TradeRecommendationAgent` and `WaiverRecommendationAgent` both import from RosterSimulator — no duplicate simulation math remains in either agent
3. Gap detection logic (`detectPostTradeGaps`, `detectPostSwapGaps`) lives in RosterSimulator, not in the agents
4. Explanation generation (`generateTradeExplanation`, `generateExplanation`) is unified — one function in RosterSimulator used by both agents
5. TradeRecommendationAgent shrinks from ~1700 lines to ≤900 lines; WaiverRecommendationAgent shrinks from ~800 lines to ≤500 lines
6. All existing recommendation endpoints return identical outputs to pre-refactor
   **Plans:** 1/1 plans complete

Plans:

- [x] 91-01-PLAN.md — Extract RosterSimulator from TradeRecommendationAgent + WaiverRecommendationAgent; unify simulateTrade, simulateAddDrop, detectGaps, generateExplanation

### Phase 92: Stat Component Consolidation ✅ COMPLETE

**Goal:** Make shared/formulas.ts the single source of truth for stat component extraction — move extractBatterComponents and extractPitcherComponents from allocator.ts (and any inline agent copies) into shared/formulas.ts alongside the rate-stat formulas they feed.
**Depends on:** Phase 91
**Requirements:** FORMULA-01, FORMULA-02
**Success Criteria** (what must be TRUE):

1. `shared/formulas.ts` exports `extractBatterComponents(rawStats): BatterComponents` and `extractPitcherComponents(rawStats): PitcherComponents`
2. `allocator.ts` imports component extraction from shared/formulas.ts — no local extractBatterComponents or extractPitcherComponents defined in allocator.ts
3. No agent file defines its own component extraction logic — all import from shared/formulas.ts
4. A single change to the component field list in shared/formulas.ts propagates correctly to all callers
5. All existing projection calculations produce identical numerical outputs to pre-refactor
   **Plans:** 1/1 plans complete

Plans:

- [x] 92-01-PLAN.md — Move extractBatterComponents + extractPitcherComponents into shared/formulas.ts; update allocator.ts and all agent callers

### Phase 93: AgentFactory Centralization ✅ COMPLETE

**Goal:** Introduce an AgentFactory module that centralizes construction of all agents and views — so routes and workers call a factory function instead of newing up agents with their full dependency graphs inline.
**Depends on:** Phase 92
**Requirements:** FACTORY-01, FACTORY-02, FACTORY-03
**Success Criteria** (what must be TRUE):

1. `AgentFactory` exports named factory functions: `createSnapshotOrchestrator(db, logger)`, `createWaiverAgent(db, logger)`, `createTradeAgent(db, logger)`, `createStandingsAgent(db, logger)`, `createProjectionsIngestAgent(db, logger)`
2. All route handlers in `api/` construct agents via factory functions — no `new WaiverRecommendationAgent(...)` calls remain in route files
3. All worker files construct agents via factory functions — no `new SnapshotOrchestratorAgent(...)` calls remain in worker files
4. Adding a new dependency to any agent requires editing exactly one file (the factory) — no route or worker file changes needed
5. Integration tests can swap factories that inject test doubles without modifying route or worker code
   **Plans:** 1/1 plans complete

Plans:

- [x] 93-01-PLAN.md — Create agent-factory.ts with 5 factory functions; update all route handlers and workers to use factories

---

## v9.0 Architectural Philosophy Remediation — shipped 2026-05-06

**Milestone Goal:** Address the four highest-impact concerns surfaced by the May 2026 architectural philosophy assessment: make the single-user auth bypass explicit and auditable via SINGLE_USER_MODE flag, rename the misnamed NotificationBus to SlackNotifier to reflect its actual responsibility, create a typed TanStack Query hook layer in the frontend so pages use composable hooks instead of inline useQuery() calls, and add integration tests for the snapshot → standings projection pipeline seam.

### Phase 94: Single-User Mode Explicit Gating

**Goal:** Replace the silent mock-user bypass in `middleware/auth.ts` with an explicit `SINGLE_USER_MODE=true` environment check — making the bypass named, visible, and auditable before multi-user mode ships.
**Depends on:** Phase 93
**Requirements:** AUTHMODE-01, AUTHMODE-02, AUTHMODE-03
**Success Criteria** (what must be TRUE):

1. `middleware/auth.ts` checks `process.env.SINGLE_USER_MODE === 'true'` before injecting the mock user — the bypass is gated, not unconditional
2. When `SINGLE_USER_MODE` is not set (falsy), `authenticate()` validates a real JWT and returns 401 on failure
3. `lib/api.ts` and any frontend auth-adjacent code is updated to reflect the single-user mode flag
4. `SINGLE_USER_MODE=true` is documented in the project and the bypass behavior is traceable to the env flag
5. `npx tsc --noEmit` passes with 0 errors in `packages/backend`
   **Plans:** 1/1 plans complete

Plans:

- [x] 94-01-PLAN.md — Gate authenticate() behind SINGLE_USER_MODE flag; update .env.example, api.ts comment, CLAUDE.md

### Phase 95: NotificationBus → SlackNotifier Rename

**Goal:** Rename `NotificationBus`, `NoOpNotificationBus`, `SlackWebhookNotificationBus`, and `createNotificationBus` to `SlackNotifier`, `NullSlackNotifier`, `SlackWebhookNotifier`, and `createSlackNotifier` — names that reflect what the abstraction actually does instead of implying a general event bus.
**Depends on:** Phase 94
**Requirements:** NOTIF-01, NOTIF-02
**Success Criteria** (what must be TRUE):

1. `notification-bus.ts` exports `SlackNotifier` interface, `NullSlackNotifier` class, `SlackWebhookNotifier` class, and `createSlackNotifier()` factory
2. All callers (`live-poll.ts`, `snapshot-orchestrator.ts`, `standings-change-log.ts`) import from the updated names
3. `npx tsc --noEmit` passes with 0 errors in `packages/backend`
   **Plans:** 1/1 plans complete

Plans:

- [x] 95-01-PLAN.md — Rename all 4 exports in notification-bus.ts; update all 3 callers

### Phase 96: Frontend Query Hook Layer

**Goal:** Create a typed TanStack Query hook layer in `packages/frontend/src/lib/hooks/` so pages call composable, self-caching hooks instead of inlining `useQuery({ queryKey: [...], queryFn: () => api.*() })` directly — centralizing stale-time policy and cache key management.
**Depends on:** Phase 95
**Requirements:** HOOKS-01, HOOKS-02, HOOKS-03, HOOKS-04
**Success Criteria** (what must be TRUE):

1. `lib/hooks/` exports: `useLeagueStatus`, `useProjectedStandings`, `useWaiverRecommendations`, `useTradeRecommendations`, `useFreeAgents`, and `useLeagueTeams`
2. Each hook uses the centralized `queryKeys` factory from `lib/query-keys.ts` — no hand-written query keys inside hooks
3. Each hook has an explicit `staleTime` matching the data's update frequency
4. At least the standings page and waivers page are updated to use the new hooks instead of inline `useQuery()` calls
5. `npx tsc --noEmit` passes with 0 errors in `packages/frontend`
   **Plans:** 1/1 plans complete

Plans:

- [x] 96-01-PLAN.md — Create hooks/ directory with 5 hooks + barrel; update standings + waivers pages

### Phase 97: Snapshot Pipeline Integration Tests

**Goal:** Add integration tests for the `SnapshotOrchestratorAgent → StandingsProjectionAgent` pipeline seam — the highest-risk cross-agent boundary where data completeness assumptions are most likely to produce silent failures.
**Depends on:** Phase 96
**Requirements:** TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):

1. `__tests__/snapshot-pipeline.test.ts` tests that `SnapshotOrchestratorAgent` calls `StandingsProjectionAgent` with complete data from a snapshot
2. A test verifies the `is_degraded=true` + `degraded_reasons` path when projections are missing
3. A test verifies that the empty-array guard in `getPlayerProjections` is respected (no SQL `WHERE id IN ()` call)
4. All tests pass with `pnpm test` in `packages/backend`
   **Plans:** 1/1 plans complete

Plans:

- [x] 97-01-PLAN.md — 8 tests across 2 suites: getPlayerProjections guard + degraded flag logic; all passing

---

## v11.0 Projected Season Simulation Engine — ✅ complete (2026-05-17)

**Milestone Goal:** Build a backend-first, seeded Monte Carlo engine that turns current standings plus RoS projections into constraint-aware remaining-season outcome distributions for roto leagues.

### Phase 103: Simulation Contract & Baseline State

**Goal:** Establish one canonical backend simulation state and deterministic baseline path on top of the existing projection infrastructure.
**Depends on:** Nothing beyond the current projection stack (Phases 79-80)
**Requirements:** SIM-01, SIM-02
**Success Criteria** (what must be TRUE):

1. A caller can materialize a single simulation input for league + snapshot without route-level joins or ad hoc data assembly
2. The baseline state includes current standings, team category components, roster constraints, remaining-season horizon, and explicit degraded reasons when inputs are incomplete
3. With randomness disabled, baseline rollup matches current projected-standings output within an agreed tolerance
4. Re-running the same snapshot with the same config and seed returns identical dry-run outputs
5. Changing underlying stat components changes AVG/OPS/ERA/WHIP consistently across deterministic and simulated paths, proving there is no duplicate rate-math branch

**Plans:** 1/1 plans complete ✅

### Phase 104: Opportunity & Variance Model

**Goal:** Convert remaining-season projections into daily or bucketed opportunity streams with tunable uncertainty.
**Depends on:** Phase 103
**Requirements:** OPP-01, VAR-01
**Success Criteria** (what must be TRUE):

1. Remaining-season output is expressed as daily or configured time-bucket opportunity for hitters and pitchers instead of only season-end totals
2. Changing days remaining, roster status, or role assumptions changes opportunity allocation in a visible and explainable way
3. Counting-stat uncertainty can be tuned by stat or role and visibly changes generated intervals and distributions
4. Rate-stat uncertainty is produced by perturbing shared stat components rather than inventing separate ERA/WHIP/OPS noise models
5. A no-variance mode produces the same totals as the Phase 103 deterministic baseline

**Plans:** 1/1 plans complete ✅

### Phase 105: Constraint-Aware Daily Season Simulator

**Goal:** Simulate team production under real lineup, slot, and GS-cap constraints.
**Depends on:** Phase 104
**Requirements:** LINEUP-01, GS-01
**Success Criteria** (what must be TRUE):

1. Simulated hitter and pitcher totals never exceed eligible active slots for any day or time bucket
2. Bench and IL players contribute only when activated through lineup logic or explicit replacement flow
3. SP usage is throttled against the season GS cap based on current pace, not only final-season cap math
4. RP opportunity remains distinct from SP pacing, so throttling starters does not incorrectly suppress all pitching output
5. Two-way players and flex slots resolve without double counting production or leaving eligible slots incorrectly empty

**Plans:** 1/1 plans complete ✅

### Phase 106: Replacement & Availability Dynamics

**Goal:** Reflect roster fragility by simulating missed time, bench coverage, and replacement-level churn.
**Depends on:** Phase 105
**Requirements:** CHURN-01, CHURN-02
**Success Criteria** (what must be TRUE):

1. Unfilled starter opportunity can be covered by bench depth or replacement-level production instead of disappearing silently
2. Teams with thinner depth or higher missed-time exposure show lower medians and wider outcome ranges than equally projected healthier teams
3. Output makes clear whether category production came from starters, bench coverage, or replacement fill
4. Availability shocks can remove player opportunity for sampled windows and reallocate leftover volume to remaining roster or replacement paths
5. Disabling churn and availability layers returns the same totals as the pure Phase 105 simulator

**Plans:** 1/1 plans complete ✅

### Phase 107: Monte Carlo Outcomes & Backend Exposure

**Goal:** Produce downstream-ready league outcome distributions with bounded runtime and calibration evidence.
**Depends on:** Phase 106
**Requirements:** MC-01, MC-02, OPS-01, CAL-01
**Success Criteria** (what must be TRUE):

1. A seeded run returns per-team finish distribution, first-place/top-3/top-6 probabilities, roto-point confidence intervals, and category swing ranges
2. Probability outputs are internally consistent: each team's finish probabilities sum to approximately 100%, and league-wide rank occupancy is valid
3. Repeated requests for the same snapshot, config, and seed can reuse a cached or persisted result instead of rerunning the full simulation
4. Default run count for a standard roto league completes within an agreed backend runtime budget
5. Results are available through a backend agent plus minimal API or report payload, with no major frontend dependency
6. Calibration output shows interval coverage and bias on historical snapshots before later trade or waiver scenario tools depend on the distributions

**Plans:** 1/1 plans complete ✅

---

## v12.0 Scenario Recommendation Integrity — shipped 2026-05-18

**Milestone Goal:** Replace heuristic trade and waiver scoring with snapshot-bound, lineup-aware scenario evaluation built on the v11 simulation engine.

### Phase 108: Scenario-Driven Trade & Waiver Evaluation

**Goal:** Trade and waiver recommendations are computed by mutating canonical simulation state instead of applying raw projection deltas, so results respect lineup allocation, GS caps, partner impact, and snapshot-bound reproducibility.
**Depends on:** Phase 107
**Requirements:** SCEN-01, SCEN-02, SCEN-03, SCEN-04, SCEN-05, SCEN-06
**Plans:** 2/2 plans complete ✅

Plans:

- [x] 108-01-PLAN.md — Scenario evaluator foundation
- [x] 108-02-PLAN.md — Agent rewiring and regression tests

---

## v13.0 Architecture Deepening — in progress 2026-05-19

**Milestone Goal:** Eliminate scattered ESPN stat ID knowledge, over-long orchestrator methods, and inline query bypasses of the repository seam — deepening modules that were shallow and giving each architectural concept a single place to live.

### Phase 109: ESPN Stat Component Translator

**Goal:** `buildCurrentComponents()` moves from `snapshot-orchestrator.ts` into `espn/constants.ts` as `resolveStatComponents()`, making ESPN stat ID → component knowledge live in one place alongside `ESPN_STAT_MAP`.
**Depends on:** Phase 108
**Requirements:** ARCH-D-01
**Success Criteria** (what must be TRUE):

1. `resolveStatComponents(formulaId, statValues)` is exported from `packages/backend/src/adapters/espn/constants.ts`
2. `snapshot-orchestrator.ts` imports and calls `resolveStatComponents` instead of defining `buildCurrentComponents` locally
3. `npx tsc --noEmit` passes with 0 errors in `packages/backend`
4. All existing tests pass

**Plans:** 0/1 plans complete

### Phase 110: Snapshot Orchestrator Context Extraction

**Goal:** `executeSnapshot()` body is ≤ 40 lines by extracting the league fetch, ESPN data fetch, settings version resolution, and projections run lookup into a private `resolveSnapshotContext()` method.
**Depends on:** Phase 109
**Requirements:** ARCH-D-02
**Success Criteria** (what must be TRUE):

1. `executeSnapshot()` body ≤ 40 lines — calls private methods in sequence
2. `resolveSnapshotContext(leagueId, snapshotDate, espnAuth)` exists as a private method returning all context needed by `writeSnapshotRows`
3. `npx tsc --noEmit` passes with 0 errors in `packages/backend`
4. All existing snapshot tests pass

**Plans:** 0/1 plans complete

### Phase 111: Player Identity Resolver — Verify

**Goal:** Confirm `PlayerIdentityResolutionAgent.resolve()` is the single entry point for all name → playerId lookups and `projections-ingest.ts` has no inline `player_identity_map` queries.
**Depends on:** Phase 109
**Requirements:** ARCH-D-03
**Success Criteria** (what must be TRUE):

1. `projections-ingest.ts` has no inline `player_identity_map` SELECT or INSERT queries
2. `FUZZY_MATCH_CONFIDENCE_THRESHOLD` defined in `player-identity.ts`, not `projections-ingest.ts`
3. `npx tsc --noEmit` passes with 0 errors

**Plans:** 0/1 plans complete

### Phase 112: Projection Blending — Pure Team Compute Function

**Goal:** Extract a pure `computeTeamAllocation(allocationResult, currentTotals, categories)` function from `StandingsProjectionAgent.computeTeamProjection()`, making the per-team category projection testable without constructing a full DB-backed agent.
**Depends on:** Phase 110
**Requirements:** ARCH-D-04
**Success Criteria** (what must be TRUE):

1. A module-level (or exported) `computeTeamAllocation` function takes `AllocationResult + currentTotals + categories` and returns per-category projections without any DB access
2. `computeTeamProjection` calls `computeTeamAllocation` internally
3. `npx tsc --noEmit` passes with 0 errors
4. A unit test exercises `computeTeamAllocation` directly with a synthetic `AllocationResult`

**Plans:** 0/1 plans complete

### Phase 113: SnapshotRepository Projection-By-Date

**Goal:** Add `getProjectionsByDate(leagueId, snapshotDate)` to `SnapshotRepository` — resolving the latest `projections_run` at or before `snapshotDate` and returning all player projections — so inline `player_projection` queries in `recommendations.ts` are replaced by repository calls.
**Depends on:** Phase 111
**Requirements:** ARCH-D-05
**Success Criteria** (what must be TRUE):

1. `SnapshotRepository.getProjectionsByDate(leagueId, snapshotDate)` returns `{ runId, projections }` resolving the best run ≤ snapshotDate
2. Inline `player_projection` SELECT queries in `recommendations.ts` are replaced by repository calls
3. Empty-array guard (`playerIds.length === 0 → return []`) is internal to all `getPlayerProjections` variants
4. `npx tsc --noEmit` passes with 0 errors

**Plans:** 0/1 plans complete

---

## v10.0 Architecture Improvements — paused 2026-05-16 (started 2026-05-15)

**Status Note:** Paused when season-simulation work took priority. Existing phase folders were moved to `.planning/milestones/v10.0-phases/` so v11.0 can start cleanly.

**Milestone Goal:** Eliminate scattered `new Agent()` instantiation, duplicated localStorage patterns, and mixed concerns in snapshot/worker/identity code by extracting five focused modules: container, worker runtime, snapshot pipeline decomposition, player identity consolidation, and frontend league workspace hook.

### Phase 98: Application Composition Module

**Goal:** Process-scope adapters (`ESPNAdapter`, `PitcherlistAdapter`, `AdvancedStatsAdapter`) are instantiated once at startup in `container.ts` and shared across all routes via Fastify plugin — eliminating per-request re-construction and scattered `new Agent()` calls across 10+ route handlers.
**Depends on:** Phase 97
**Requirements:** ARCH-01, ARCH-02, ARCH-03
**Success Criteria** (what must be TRUE):

1. `packages/backend/src/container.ts` exports a Fastify plugin registered in `index.ts` that decorates `fastify.container` with `adapters` (ESPNAdapter, PitcherlistAdapter, AdvancedStatsAdapter singletons) and `agents` (factory functions)
2. `new ESPNAdapter(request.log)` no longer appears in route handler bodies in `draft.ts`, `leagues.ts`, or `recommendations.ts`
3. Per-request `new TradeRecommendationAgent(db, log)`, `new FaabTrackerAgent(db, log)`, `new GsPacingAgent(db, log)`, `new DraftRankingsAgent(db, log)`, `new TransactionImpactAgent(db, log)` are replaced by factory calls from `fastify.container.agents`
4. `npx tsc --noEmit` passes with 0 errors in `packages/backend`
5. Backend starts cleanly and existing snapshot/waiver/trade routes respond correctly

**Plans:** 0/1 plans complete

### Phase 99: Worker Runtime Module

**Goal:** Shared BullMQ bootstrap code (IORedis connection, Queue creation, Worker construction, SIGTERM/SIGINT handler, retry policy) is extracted into `worker-runtime.ts` — each worker file shrinks to: job data type + handler function + `createRuntime()` call.
**Depends on:** Phase 98
**Requirements:** ARCH-04, ARCH-05
**Success Criteria** (what must be TRUE):

1. `packages/backend/src/workers/worker-runtime.ts` exports `createRedisConnection()`, `createQueue()`, `createWorker()`, and `registerShutdown()`
2. Each of the 6 worker files (`snapshot-worker.ts`, `backfill-worker.ts`, `live-poll-worker.ts`, `player-pool-worker.ts`, `morning-report-worker.ts`, `slack-approval-worker.ts`) no longer contains inline `new IORedis()` or `process.on("SIGTERM")` — delegates to `worker-runtime.ts`
3. Worker startup behavior is unchanged — all workers start and process jobs correctly
4. `npx tsc --noEmit` passes with 0 errors in `packages/backend`

**Plans:** 0/1 plans complete

### Phase 100: Snapshot Pipeline Decomposition

**Goal:** `SnapshotOrchestratorAgent.executeSnapshot()` is decomposed into independently testable named private methods (`fetchAndArchive`, `resolveSettingsVersion`, `writeSnapshotRows`, `computeProjections`, `emitChangeLog`) — the orchestrator method becomes ≤ 40 lines of sequencing logic.
**Depends on:** Phase 99
**Requirements:** ARCH-06, ARCH-07
**Success Criteria** (what must be TRUE):

1. `executeSnapshot()` body is ≤ 40 lines — calls private methods in sequence with degraded-state threading
2. `fetchAndArchive()`, `writeSnapshotRows()`, `computeProjections()`, and `emitChangeLog()` exist as private methods each ≤ 80 lines
3. `computeDegradedStatus()` remains a pure function with no side effects
4. Existing `snapshot-pipeline.test.ts` tests pass unchanged
5. `npx tsc --noEmit` passes with 0 errors in `packages/backend`

**Plans:** 0/1 plans complete

### Phase 101: Player Identity Consolidation

**Goal:** `PlayerIdentityResolutionAgent` owns all identity resolution logic — `FUZZY_MATCH_CONFIDENCE_THRESHOLD`, cache lookup, and `player_identity_map` write move out of `projections-ingest.ts` into a single `resolve()` method — eliminating duplicate DB access and threshold definitions.
**Depends on:** Phase 100
**Requirements:** ARCH-08, ARCH-09, ARCH-10
**Success Criteria** (what must be TRUE):

1. `FUZZY_MATCH_CONFIDENCE_THRESHOLD` is defined in `player-identity.ts` and not in `projections-ingest.ts`
2. `PlayerIdentityResolutionAgent` exposes `resolve(fangraphsKey, playerName, team?, positions?)` that atomically handles cache-check → fuzzy-match → threshold → cache-write
3. `projections-ingest.ts` no longer contains inline `player_identity_map` SELECT or INSERT queries for identity resolution
4. `projections-ingest.ts` calls `identityAgent.resolve()` as the single identity resolution call
5. `npx tsc --noEmit` passes with 0 errors in `packages/backend`

**Plans:** 0/1 plans complete

### Phase 102: Frontend League Workspace

**Goal:** `localStorage.getItem(`league\_${leagueId}\_team`)` duplicated across 7 pages is encapsulated in a `useLeagueTeam(leagueId)` hook, and page-local TypeScript interfaces that duplicate common types are consolidated in `lib/types/league.ts`.
**Depends on:** Phase 101
**Requirements:** FE-01, FE-02
**Success Criteria** (what must be TRUE):

1. `packages/frontend/src/lib/hooks/use-league-team.ts` exports `useLeagueTeam(leagueId): [string | null, (id: string) => void]` with SSR-safe `typeof window` guard
2. All 7 pages (`waivers`, `moves`, `lineup`, `standings`, `trends`, `changelog`, `trades`) import `useLeagueTeam` instead of accessing `localStorage` directly for team selection
3. `packages/frontend/src/lib/types/league.ts` exports consolidated shared interfaces used across pages
4. No inline `localStorage.getItem(`league\_${leagueId}\_team`)` remains in any page file
5. `npx tsc --noEmit` passes with 0 errors in `packages/frontend`
6. Pages render and team selection persists correctly in browser

**Plans:** 0/1 plans complete

## v7.0 Architectural Stabilization — shipped 2026-05-05

**Milestone Goal:** Close the remaining gaps surfaced by the May 2026 senior staff architectural audit: route manual snapshot triggers through BullMQ (eliminating the concurrency race between direct `executeSnapshot` calls and the scheduled worker), and refresh CLAUDE.md so its known-issues list accurately reflects the v6.0 codebase state.

### Phase 87: Manual snapshot concurrency guard

**Goal:** Manual snapshot triggers enqueue into BullMQ with a deterministic job ID instead of calling `executeSnapshot` directly, so concurrent user-triggered snapshots for the same league on the same day are deduplicated at the queue level — matching the deduplication already in place for scheduled snapshots.
**Depends on:** Phase 86
**Requirements:** SNAP-DEDUP-01, SNAP-DEDUP-02, SNAP-DEDUP-03
**Success Criteria** (what must be TRUE):

1. `POST /api/leagues/:leagueId/snapshot` enqueues a BullMQ job with `jobId: snapshot-${leagueId}-${today}` instead of calling `orchestrator.executeSnapshot()` directly
2. Two simultaneous manual trigger requests for the same league on the same date result in exactly one BullMQ job being created (second returns 202 with `queued: false, reason: "duplicate"`)
3. The manual endpoint returns `{ queued: true, jobId }` immediately (async) rather than blocking until snapshot completes
4. Existing scheduled snapshot deduplication in `scheduleDailySnapshots()` is unchanged
5. No change to snapshot execution logic — only the trigger path changes
   **Plans:** 1/1 plans complete

Plans:

- [x] 87-01-PLAN.md — Route `POST /snapshot` through BullMQ with deterministic jobId; add job-status polling endpoint; update frontend to poll instead of awaiting

### Phase 88: CLAUDE.md accuracy refresh

**Goal:** CLAUDE.md `Known Issues / Technical Debt` section is updated to reflect actual v6.0 codebase state — items fixed across v1.0-v6.0 are removed or marked resolved, and the remaining genuinely-open items are accurate.
**Depends on:** Phase 87
**Requirements:** DOCS-01
**Success Criteria** (what must be TRUE):

1. Each item in the Known Issues list is verified against the codebase: removed if fixed, updated if partially fixed, or retained with an accurate description if still open
2. Any new technical debt introduced in v6.0 not already tracked is added
3. AGENTS.md `Known gaps` sections are updated to match
   **Plans:** 1/1 plans complete

Plans:

- [x] 88-01-PLAN.md — Audit CLAUDE.md known issues against actual code; update AGENTS.md agent-level gap sections; commit
