# Requirements: ESPN Fantasy Baseball Command Center

**Defined:** 2026-03-23
**Core Value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions

## v11.0 Requirements

Requirements for the Projected Season Simulation Engine milestone.

### Backend: Simulation Contract & Baseline

- [ ] **SIM-01**: A canonical simulation state combines latest snapshot data, league settings, rosters, current standings components, and allocated RoS projections without duplicating rate-stat math outside the shared formulas/allocation path
- [ ] **SIM-02**: A deterministic seeded dry-run mode reproduces current point-estimate projected standings when stochastic layers are disabled, so simulation builds on a verifiable baseline instead of a second projection branch

### Backend: Opportunity & Variance Modeling

- [ ] **OPP-01**: Remaining season output is modeled as daily or configurable time-bucket opportunity and usage streams per player role and roster slot, not only naive season-end totals
- [ ] **VAR-01**: Uncertainty is tunable by stat and role, with counting stats sampled directly and rate stats derived from perturbed shared stat components rather than independent ERA/WHIP/OPS noise

### Backend: Lineup & Usage Constraints

- [ ] **LINEUP-01**: Simulated production honors roster-slot eligibility, active lineup limits, flex handling, and two-way player handling for every day or time bucket
- [ ] **GS-01**: Pitching usage paces SP volume against the league GS cap while keeping SP and RP opportunity distinct across the remaining season

### Backend: Replacement & Availability Dynamics

- [ ] **CHURN-01**: Missed lineup opportunity is covered by traceable bench or replacement-level production instead of silently disappearing from team totals
- [ ] **CHURN-02**: Availability shocks and roster churn heuristics widen outcomes without pretending to predict exact future transactions or injuries

### Backend: Outcome Surface

- [ ] **MC-01**: Monte Carlo runs return per-team finish distributions, place probabilities, roto-point intervals, and category swing ranges for a full league snapshot
- [ ] **MC-02**: Simulation outputs are consumable by backend APIs now and reusable later by add/drop and trade scenario evaluators without route-specific recomputation logic

### Backend: Execution Quality

- [ ] **OPS-01**: Simulation supports configurable run counts, deterministic seeds, and snapshot-bound caching while staying within a practical backend runtime budget
- [ ] **CAL-01**: Calibration and backtest tooling measures interval coverage and systematic bias against historical snapshots or realized outcomes before downstream features rely on the distributions

## v12.0 Requirements

Requirements for the Scenario Recommendation Integrity milestone.

### Backend: Scenario Evaluation

- [ ] **SCEN-01**: Trade and waiver scenario scoring mutates canonical simulation state for the affected rosters instead of applying ad hoc raw projection deltas in route-specific logic
- [ ] **SCEN-02**: Trade evaluation simulates both teams in the same league snapshot and returns user delta plus partner delta so fairness is grounded in both sides of the move
- [ ] **SCEN-03**: Waiver and trade legality are derived from allocator or gap-detection results rather than position-overlap heuristics, and blocking issues are surfaced in the response
- [ ] **SCEN-04**: Candidate generation uses deterministic scenario scoring for broad screening and can apply bounded Monte Carlo reranking or probability deltas to the top scenarios without recomputing unrelated state
- [ ] **SCEN-05**: Scenario evaluation is snapshot-bound and reproducible: time horizon derives from snapshot date, and snapshot-scoped data is preferred over latest raw payload fallbacks whenever available
- [ ] **SCEN-06**: Focused automated tests cover lineup congestion, GS-cap effects, partner-relative trade impact, waiver legality, and historical snapshot reproducibility

## Traceability

| REQ-ID    | Phase |
| --------- | ----- |
| SIM-01    | 103   |
| SIM-02    | 103   |
| OPP-01    | 104   |
| VAR-01    | 104   |
| LINEUP-01 | 105   |
| GS-01     | 105   |
| CHURN-01  | 106   |
| CHURN-02  | 106   |
| MC-01     | 107   |
| MC-02     | 107   |
| OPS-01    | 107   |
| CAL-01    | 107   |
| SCEN-01   | 108   |
| SCEN-02   | 108   |
| SCEN-03   | 108   |
| SCEN-04   | 108   |
| SCEN-05   | 108   |
| SCEN-06   | 108   |

## Out of Scope (v11.0)

- Major frontend dashboards or new visualization-heavy UI beyond minimal API/report exposure
- Points leagues or H2H scoring formats
- Exact future transaction prediction, FAAB strategy automation, or opponent-behavior modeling
- Full injury/news ingestion with player-specific medical forecasts
- Draft-engine unification work across backend and extension beyond reusing pure Monte Carlo patterns
- Trade and add/drop scenario products themselves — v11.0 ships reusable simulation core only

## Future Requirements

- Lightweight frontend surfaces for place probabilities, category swing bands, and confidence intervals
- Schedule-strength and opponent-context adjustments layered on top of the simulation core
- Mastra AI agent integration (deferred from v6.0)
- Snake draft / H2H league support (deferred from v1.0)
- Trade retrospectives with actual vs projected outcomes

## v10.0 Requirements (Paused — retained context)

Requirements for the Architecture Improvements milestone.

### Backend: Application Composition

- [ ] **ARCH-01**: Process-scope adapters (`ESPNAdapter`, `PitcherlistAdapter`, `AdvancedStatsAdapter`) are instantiated once at startup in `container.ts` and shared across all route handlers via dependency injection, eliminating per-request re-construction
- [ ] **ARCH-02**: Per-request agent construction (`new TradeRecommendationAgent(db, log)`, `new FaabTrackerAgent(db, log)`, `new GsPacingAgent(db, log)`, `new DraftRankingsAgent(db, log)`, etc.) is replaced by factory functions exported from `container.ts`
- [ ] **ARCH-03**: `container.ts` is registered as a Fastify plugin so `db`, `log`, and all adapters/factories are available via `fastify.container` on every route without import chaining

### Backend: Worker Runtime

- [ ] **ARCH-04**: Shared BullMQ bootstrap (IORedis connection, Queue creation, Worker construction, SIGTERM/SIGINT handler, retry policy config) is extracted into `packages/backend/src/workers/worker-runtime.ts`
- [ ] **ARCH-05**: Each worker file (`snapshot-worker.ts`, `backfill-worker.ts`, `live-poll-worker.ts`, `player-pool-worker.ts`, `morning-report-worker.ts`, `slack-approval-worker.ts`) exports only: job data type, job handler function, and optional schedule config — startup wiring removed from each file

### Backend: Snapshot Pipeline Decomposition

- [ ] **ARCH-06**: `SnapshotOrchestratorAgent.executeSnapshot()` is decomposed into named private methods: `fetchAndArchive()`, `resolveSettingsVersion()`, `writeSnapshotRows()`, `computeProjections()`, `emitChangeLog()` — each callable and testable independently
- [ ] **ARCH-07**: Degraded-state detection remains a pure function (`computeDegradedStatus()` already extracted) with no side effects; degraded reasons are passed forward through the pipeline rather than computed inline in multiple places

### Backend: Player Identity Consolidation

- [ ] **ARCH-08**: `FUZZY_MATCH_CONFIDENCE_THRESHOLD` constant moves from `projections-ingest.ts` to `player-identity.ts` as the single source of truth
- [ ] **ARCH-09**: `player_identity_map` cache lookup and write logic moves out of `projections-ingest.ts` into `PlayerIdentityResolutionAgent`, exposing a single `resolve(fangraphsKey, playerName, team?, positions?)` method that handles cache-check → fuzzy-match → cache-write atomically
- [ ] **ARCH-10**: `projections-ingest.ts` calls `identityAgent.resolve()` instead of duplicating cache lookup + threshold + DB write inline

### Frontend: League Workspace

- [ ] **FE-01**: `localStorage.getItem/setItem(`league\_${leagueId}\_team`)` pattern duplicated across 7+ pages is encapsulated in a `useLeagueTeam(leagueId)` hook that returns `[teamId, setTeamId]` — pages import the hook rather than accessing localStorage directly
- [ ] **FE-02**: Page-local TypeScript interfaces that are duplicated across pages (`RosterPlayer`, `Team`, `CategoryImpact`, etc.) are consolidated into a shared `packages/frontend/src/lib/types/league.ts` module and imported where needed

### Traceability (v10.0)

| REQ-ID  | Phase |
| ------- | ----- |
| ARCH-01 | 98    |
| ARCH-02 | 98    |
| ARCH-03 | 98    |
| ARCH-04 | 99    |
| ARCH-05 | 99    |
| ARCH-06 | 100   |
| ARCH-07 | 100   |
| ARCH-08 | 101   |
| ARCH-09 | 101   |
| ARCH-10 | 101   |
| FE-01   | 102   |
| FE-02   | 102   |

### Out of Scope (v10.0)

- Public API / multi-tenant mode — deferred (no auth rework)
- Database schema changes — no new tables in this milestone
- New user-facing features — architectural refactor only, no visible behavior changes
- Chrome extension refactor — scoped to web app backend/frontend only

---

## v9.0 Requirements (Archived — Shipped)

### Architectural Philosophy Remediation

- [x] **PHIL-01**: Auth mode gating centralized — v9.0
- [x] **PHIL-02**: NotificationBus naming normalized across codebase — v9.0
- [x] **PHIL-03**: Frontend query hooks standardized — v9.0
- [x] **PHIL-04**: Snapshot pipeline tests added — v9.0

- [ ] **ROTO-01**: Projected standings table shows all 13 teams with current points, projected points, and change
- [ ] **ROTO-02**: Roto points computed from live standings (rank my projected totals against all teams' projected totals)
- [ ] **ROTO-03**: Historical category curves used as fallback when live standings unavailable
- [ ] **ROTO-04**: Category opportunity map shows gap to +1 and +2 roto points per category with difficulty rating
- [ ] **ROTO-05**: Marginal gain engine computes cheapest path to next roto point per category
- [ ] **ROTO-06**: "Standings Points at Risk" summary shows categories where points could be gained or lost
- [ ] **ROTO-07**: Category pace bars show current vs target with progress visualization
- [ ] **ROTO-08**: Hover on category row shows teams above/below and exact stat gaps

### Waiver Analysis

- [ ] **WAIVER-01**: Net roto point delta accounts for both added player projection AND dropped player loss
- [ ] **WAIVER-02**: Per-category breakdown shows which categories improve and which get worse
- [ ] **WAIVER-03**: Marginal analysis shows "this move gets you +N roto points in category X"
- [ ] **WAIVER-04**: Fix hardcoded 0.5 deltaOverallPoints in WaiverRecommendationAgent with real computation
- [ ] **WAIVER-05**: Rate stat adjustments (ERA, WHIP, OPS) use component math for add/drop simulation

### FAAB Pacing

- [ ] **FAAB-01**: Show my remaining FAAB budget vs league average remaining
- [ ] **FAAB-02**: Spend-rate projection showing if budget will run out before season ends
- [ ] **FAAB-03**: Bid history with won/lost outcomes per claim
- [ ] **FAAB-04**: ROI scoring (player value gained per FAAB dollar spent)
- [ ] **FAAB-05**: Suggested bid amounts based on remaining budget, weeks left, and player value

### Pitching Usage

- [ ] **PITCH-01**: Season GS tracker showing used vs 200 cap with projected pace
- [ ] **PITCH-02**: Weekly GS usage showing this week's starts and remaining
- [ ] **PITCH-03**: K/GS ratio tracking per pitcher to identify streaming value
- [ ] **PITCH-04**: SP start planner recommending which SPs to start/sit to optimize GS pace
- [ ] **PITCH-05**: Alert when GS pace is burning too fast or leaving starts unused

### Trade Analysis

- [ ] **TRADE-01**: Trade impact shows net roto point delta (same treatment as waiver analysis)
- [ ] **TRADE-02**: Per-category breakdown for proposed trades
- [ ] **TRADE-03**: Automatic trade finder scans all teams for roto-point-positive 1-for-1 swaps
- [ ] **TRADE-04**: Trade finder results ranked by net roto points gained
- [ ] **TRADE-05**: Rate stat adjustments use component math (not counting stats only)

### Trends & Efficiency

- [ ] **TREND-01**: Hot/cold player panel showing 7-day trend for roster players
- [ ] **TREND-02**: Hot players highlighted by OPS surge, HR burst, K spike
- [ ] **TREND-03**: Cold players flagged with declining production
- [ ] **TREND-04**: Lineup efficiency tracks bench production (missed HR, SB, OPS from benched players)
- [ ] **TREND-05**: Warning indicator when significant production is being left on the bench

### Season Caching

- [x] **CACHE-01**: season_metadata table tracks which (league_id, season) pairs are finalized
- [x] **CACHE-02**: Finalized seasons skip projected standings recomputation in SnapshotOrchestratorAgent (regardless of forceFresh)
- [x] **CACHE-03**: Successful backfill completion auto-finalizes the season
- [x] **CACHE-04**: Admin can reset finalization to allow re-runs for data corrections

### SP Sit/Start Recommendations

- [x] **SITSTART-01**: Pitcherlist adapter scrapes weekly SP Streamer Ranks article and extracts tier-grouped pitcher names into normalized entries
- [x] **SITSTART-02**: Rotoballer adapter returns empty array gracefully when JS-rendered content cannot be parsed (degraded mode)
- [x] **SITSTART-03**: SitStartAdvisor agent matches external rankings against rostered SPs using diacritic-aware normalized name comparison
- [x] **SITSTART-04**: API endpoint returns sit/start recommendations per team at GET /api/leagues/:leagueId/teams/:teamId/pitching/sit-start
- [x] **SITSTART-05**: Frontend Sit/Start tab on Pitching Usage page displays verdict badges with source links and empty state

### Sophisticated Projection Model

- [x] **PROJ-01**: FanGraphs CSV ingest parses G, PA (batters) and G, GS (pitchers) into stat_components_json
- [x] **PROJ-02**: Staleness prorating scales RoS projections by fraction of remaining season elapsed since upload
- [x] **PROJ-03**: canFillSlot extracted as standalone reusable function with OF slot rule (LF/CF/RF/OF)
- [x] **PROJ-04**: Hitter lineup allocation assigns best eligible players to starting slots; bench/IL contribute 0%
- [x] **PROJ-05**: GS cap enforcement scales SP counting components proportionally when projected GS exceeds remaining budget
- [x] **PROJ-06**: RP projections never scaled by GS cap
- [x] **PROJ-07**: Unified allocation pipeline chains prorate -> allocate hitters -> scale pitchers -> sum components
- [x] **PROJ-08**: Two-way players (Ohtani) contribute batting stats to hitter categories and pitching stats to pitcher categories
- [x] **PROJ-09**: Confidence intervals (P10/P50/P90) computed per category using per-stat CV model
- [x] **PROJ-10**: StandingsProjectionAgent uses allocateProjections instead of naive roster-wide summation
- [x] **PROJ-11**: TradeRecommendationAgent uses allocateProjections for trade impact simulation with roster gap detection
- [x] **PROJ-12**: WaiverRecommendationAgent uses allocateProjections for add/drop simulation (replaces hardcoded 0.5 delta)

## Future Requirements

### Advanced Analytics

- **ADV-01**: Injury-adjusted projections (discount players on IL)
- **ADV-02**: Schedule-strength adjustments per category
- **ADV-03**: Opponent schedule tracking for streaming pitcher recommendations
- **ADV-04**: Multi-player trade evaluation (2-for-2, 3-for-2) with roto delta

## Out of Scope

| Feature                       | Reason                                                 |
| ----------------------------- | ------------------------------------------------------ |
| Points/H2H league support     | Different scoring paradigm — roto only                 |
| Snake draft features          | Season is in auction mode only                         |
| Real-time ESPN updates        | ESPN API is read-only, batch snapshot model sufficient |
| Mobile-specific in-season app | Desktop command center first, responsive later         |
| AI agent chat interface       | Deferred to future milestone                           |

## Traceability

| Requirement | Phase    | Status   |
| ----------- | -------- | -------- |
| SHELL-01    | Phase 65 | Complete |
| SHELL-02    | Phase 65 | Complete |
| SHELL-03    | Phase 65 | Complete |
| SHELL-04    | Phase 65 | Complete |
| SHELL-05    | Phase 65 | Complete |
| SHELL-06    | Phase 65 | Complete |
| SHELL-07    | Phase 65 | Complete |
| ROTO-01     | Phase 66 | Pending  |
| ROTO-02     | Phase 66 | Pending  |
| ROTO-03     | Phase 66 | Pending  |
| ROTO-05     | Phase 66 | Pending  |
| ROTO-07     | Phase 66 | Pending  |
| ROTO-08     | Phase 66 | Pending  |
| ROTO-04     | Phase 67 | Pending  |
| ROTO-06     | Phase 67 | Pending  |
| WAIVER-01   | Phase 67 | Pending  |
| WAIVER-02   | Phase 67 | Pending  |
| WAIVER-03   | Phase 67 | Pending  |
| WAIVER-04   | Phase 67 | Pending  |
| WAIVER-05   | Phase 67 | Pending  |
| FAAB-01     | Phase 68 | Pending  |
| FAAB-02     | Phase 68 | Pending  |
| FAAB-03     | Phase 68 | Pending  |
| FAAB-04     | Phase 68 | Pending  |
| FAAB-05     | Phase 68 | Pending  |
| PITCH-01    | Phase 68 | Pending  |
| PITCH-02    | Phase 68 | Pending  |
| PITCH-03    | Phase 68 | Pending  |
| PITCH-04    | Phase 68 | Pending  |
| PITCH-05    | Phase 68 | Pending  |
| TRADE-01    | Phase 69 | Pending  |
| TRADE-02    | Phase 69 | Pending  |
| TRADE-03    | Phase 69 | Pending  |
| TRADE-04    | Phase 69 | Pending  |
| TRADE-05    | Phase 69 | Pending  |
| TREND-01    | Phase 70 | Pending  |
| TREND-02    | Phase 70 | Pending  |
| TREND-03    | Phase 70 | Pending  |
| TREND-04    | Phase 70 | Pending  |
| TREND-05    | Phase 70 | Pending  |
| CACHE-01    | Phase 74 | Complete |
| CACHE-02    | Phase 74 | Complete |
| CACHE-03    | Phase 74 | Complete |
| CACHE-04    | Phase 74 | Complete |
| SITSTART-01 | Phase 77 | Complete |
| SITSTART-02 | Phase 77 | Complete |
| SITSTART-03 | Phase 77 | Complete |
| SITSTART-04 | Phase 77 | Complete |
| SITSTART-05 | Phase 77 | Complete |
| PROJ-01     | Phase 79 | Complete |
| PROJ-02     | Phase 79 | Complete |
| PROJ-03     | Phase 79 | Complete |
| PROJ-04     | Phase 79 | Complete |
| PROJ-05     | Phase 79 | Complete |
| PROJ-06     | Phase 79 | Complete |
| PROJ-07     | Phase 79 | Complete |
| PROJ-08     | Phase 79 | Complete |
| PROJ-09     | Phase 79 | Complete |
| PROJ-10     | Phase 79 | Complete |
| PROJ-11     | Phase 79 | Complete |
| PROJ-12     | Phase 79 | Complete |

**Coverage:**

- v6.0 requirements: 56 total
- Mapped to phases: 56
- Unmapped: 0

---

_Requirements defined: 2026-03-23_
_Last updated: 2026-05-16 — added v11.0 Projected Season Simulation Engine requirements; retained v10.0 below as paused context_
