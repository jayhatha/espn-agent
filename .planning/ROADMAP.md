# Roadmap: ESPN Fantasy Baseball Command Center

## Milestones

- ✅ **v1.0 MVP** - Phases 1-5 (shipped 2026-02-21)
- ✅ **v2.0 Position Shopping List** - Phases 6-38 (shipped 2026-03-14)
- ✅ **v3.0 Draft Automation & Mobile Command Center** - Phases 39-42 (shipped 2026-03-14)
- 🚧 **v4.0 Personal Season Setup** - Phases 43-46 (in progress)

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

### 🚧 v4.0 Personal Season Setup (In Progress)

**Milestone Goal:** Strip auth complexity, hardcode league config for personal use, fix draft extension detection, and verify the full in-season pipeline works end-to-end for league 112523.

- [ ] **Phase 43: Strip Auth & Env Config** - API routes and frontend pages work without authentication, ESPN credentials loaded from env vars
- [ ] **Phase 44: Hardcode League & OPS Math** - League 112523 settings hardcoded as defaults, OPS wired as rate stat in component math
- [ ] **Phase 45: Fix Draft Extension Detection** - Extension reliably detects user's team and roster using hardcoded config as primary, DOM detection as validation
- [ ] **Phase 46: Verify In-Season Pipeline** - Daily snapshot pipeline, projected standings, waiver recommendations, and trade analysis work end-to-end for league 112523

## Phase Details

### Phase 43: Strip Auth & Env Config
**Goal**: API routes and frontend pages work without authentication, ESPN credentials loaded from env vars
**Depends on**: Nothing (first v4.0 phase)
**Requirements**: SIMP-01, SIMP-02, SIMP-03
**Success Criteria** (what must be TRUE):
  1. All API routes return data without JWT/cookie auth headers
  2. Frontend pages render without redirect to login
  3. ESPN adapter reads SWID/espn_s2 from process.env with DB fallback
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 43 to break down)

### Phase 44: Hardcode League & OPS Math
**Goal**: League 112523 settings hardcoded as defaults, OPS wired as rate stat in component math
**Depends on**: Phase 43
**Requirements**: CONF-01, CONF-02, CONF-03
**Success Criteria** (what must be TRUE):
  1. Backend uses league 112523, team 13, 13 teams as default when no league specified
  2. Categories are R, RBI, HR, SB, OPS / K, W, SV, ERA, WHIP
  3. OPS computed as OBP + SLG using component math (not raw stat)
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 44 to break down)

### Phase 45: Fix Draft Extension Detection
**Goal**: Extension reliably detects user's team and roster using hardcoded config as primary, DOM detection as validation
**Depends on**: Phase 44
**Requirements**: CONF-04, DFIX-01, DFIX-02, DFIX-03
**Success Criteria** (what must be TRUE):
  1. Extension loads hardcoded league config (team 13, 13 teams, categories) before DOM detection runs
  2. myRoster only contains picks from the user's team column
  3. Team detection succeeds on page load without timing races
  4. Config detection (team count, categories, roster slots) uses hardcoded values with DOM validation
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 45 to break down)

### Phase 46: Verify In-Season Pipeline
**Goal**: Daily snapshot pipeline, projected standings, waiver recommendations, and trade analysis work end-to-end for league 112523
**Depends on**: Phase 43, Phase 44
**Requirements**: SEAS-01, SEAS-02, SEAS-03, SEAS-04
**Success Criteria** (what must be TRUE):
  1. Running snapshot for league 112523 produces team_daily_category_totals and projected standings
  2. Waiver recommendations endpoint returns ranked suggestions for user's team
  3. Trade analysis endpoint evaluates a proposed trade with accurate projected deltas
  4. Frontend dashboard renders standings and recommendations without auth redirect
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 46 to break down)

## Progress

**Execution Order:**
Phases execute in numeric order: 43 -> 44 -> 45 -> 46

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 43. Strip Auth & Env Config | v4.0 | 0/? | Not started | - |
| 44. Hardcode League & OPS Math | v4.0 | 0/? | Not started | - |
| 45. Fix Draft Extension Detection | v4.0 | 0/? | Not started | - |
| 46. Verify In-Season Pipeline | v4.0 | 0/? | Not started | - |
