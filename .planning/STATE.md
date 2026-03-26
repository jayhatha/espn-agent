---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: In-Season Command Center
status: Ready to execute
stopped_at: Completed 76-01-PLAN.md
last_updated: "2026-03-26T20:36:54.697Z"
progress:
  total_phases: 12
  completed_phases: 11
  total_plans: 24
  completed_plans: 23
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-23)

**Core value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions — see things other managers don't, act faster, finish higher.
**Current focus:** Phase 76 — api-hardening

## Current Position

Phase: 76 (api-hardening) — EXECUTING
Plan: 2 of 2

## Performance Metrics

**Velocity:**

- Total plans completed (v5.0): ~35 plans
- v6.0 plans: 7 completed

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 65-dark-mode-shell | 01 | 8 min | 2 | 6 |
| 65-dark-mode-shell | 02 | 15 min | 2 | 5 |
| 65-dark-mode-shell | 03 | 3 min | 2 | 16 |
| 65-dark-mode-shell | 04 | 10 min | 2 | 17 |
| 66-roto-math-foundation | 01 | 5 min | 2 | 2 |
| 66-roto-math-foundation | 02 | 8 min | 2 | 3 |
| 69-trade-finder | 01 | 5 min | 2 | 1 |
| 69-trade-finder | 02 | 8 min | 2 | 1 |

*Updated after each plan completion*
| Phase 71 P01 | 3 min | 2 tasks | 2 files |
| Phase 72-ui-audit-fixes P01 | 12 min | 3 tasks | 5 files |
| Phase 72-ui-audit-fixes P02 | 12 | 2 tasks | 8 files |
| Phase 73 P01 | 15 | 2 tasks | 2 files |
| Phase 73 P02 | 10 | 2 tasks | 2 files |
| Phase 74 P01 | 2 min | 2 tasks | 5 files |
| Phase 75-active-stats P01 | 3 | 2 tasks | 6 files |
| Phase 75-active-stats P02 | 2 | 1 tasks | 3 files |
| Phase 76-api-hardening P01 | 2 | 1 tasks | 2 files |

## Accumulated Context

### Decisions

- [v6.0 roadmap]: Phase 65 (shell) is pure frontend — build first, all other phases populate into it
- [v6.0 roadmap]: Phase 66 (roto math) uses interpolateRotoPoints() in shared/formulas.ts — pure function, no DB writes
- [v6.0 roadmap]: Phase 67 depends on Phase 66: marginal gain engine must exist before category opportunity map
- [v6.0 roadmap]: Phase 68 (FAAB + GS) and Phase 70 (trends) depend only on the shell — independent tracks
- [v6.0 roadmap]: Phase 69 (trade finder) comes last — depends on Phase 67 waiver delta being production-trusted
- [v6.0 roadmap]: FAAB balance must come from ESPN mRoster view (acquisitionBudgetRemaining) — not derived from transaction sums
- [v6.0 roadmap]: next-themes for SSR-safe dark mode, @tanstack/react-table for sortable trade scanner, @tanstack/react-virtual for virtualized rows
- [Phase 65-01]: ThemeProvider placed outside QueryClientProvider (outermost wrapper) so theme state is available to all children
- [Phase 65-01]: defaultTheme=dark with enableSystem=false — forces dark mode, no light/system toggle in v6.0
- [Phase 65-01]: Shell tokens are separate from grafana tokens — grafana palette kept for mobile draft companion, shell palette for Command Center
- [Phase 65-02]: layout.tsx uses pl-60 offset on main area so fixed LeagueNav doesn't overlap content
- [Phase 65-02]: LucideIcon type used in NavItem (not ComponentType) to avoid TypeScript size prop mismatch
- [Phase 65-02]: SignalsPanel reads localStorage in useEffect to avoid SSR hydration mismatch
- [Phase 65-03]: StatsTable td cells get font-mono globally — all data cells render in JetBrains Mono (SHELL-05)
- [Phase 65-03]: Container uses dark:text-inherit — transparent wrapper, inherits text from shell body
- [Phase 65-03]: TeamColorBadge keeps dynamic inline styles for team colors, adds dark:font-semibold for legibility
- [Phase 65-04]: Card surfaces use dark:bg-shell-panel, secondary/header areas use dark:bg-shell-bg to maintain visual hierarchy in dark mode
- [Phase 65-04]: shadow-card dark:shadow-none — card shadows are removed in dark mode as they provide no visual value on dark backgrounds
- [Phase 69]: Trade simulation uses category_id (not stat_key) as map key — matches DB schema for team_daily_projected_category
- [Phase 69]: Auto trade finder is default view on trades page (showAnalyzer=false)
- [Phase 69]: Fairness score numeric removed from UI — likelihood label (high/medium/low) is sufficient
- [Phase 103]: Replaced font-display (DM Serif Display) with font-extrabold/font-bold for Inter-only typography; dark:text-shell-text/dark:text-shell-muted as standard contrast pairing
- [Phase 71]: new Date().getFullYear() for API season defaults -- self-updating across seasons with zero maintenance
- [Phase 72-ui-audit-fixes]: mobileOpen state lives in LeagueNav (not layout) — nav owns its own open/close state
- [Phase 72-ui-audit-fixes]: isLoadingSignals uses && !!teamId guard — prevents loading state when no team selected
- [Phase 72-ui-audit-fixes]: projectedValue useMemo in TopBar computes selected team projected rank from /standings/projected API
- [Phase 72-02]: All semantic positive/negative/warning states flow through semantic token classes — no raw green/red/amber/emerald in semantic contexts
- [Phase 72-02]: Snapshot dates formatted with toLocaleDateString in UI — not raw ISO strings
- [Phase 73]: formatRate() checks denominator before calling formula — avoids 0.00 display when IP=0 or AB=0
- [Phase 73]: PlayerStatLine returns null when components is null — callers control conditional rendering in Plan 02
- [Phase 73]: PlayerStatLine placed inside flex-1 div so padding aligns with PlayerRow content in waivers page
- [Phase 73]: Roster query in lineup page uses enabled: !!selectedTeamId without viewMode guard — roster stats always visible when team is selected
- [Phase 74]: SeasonMetadata.created_at uses Generated<Date> to match DB DEFAULT NOW() — required for Kysely insert type safety
- [Phase 74]: Finalization guard placed before computeProjectedStandings(), outside all forceFresh branches — independent of forceFresh flag
- [Phase 74]: finalizeSeasonIfComplete uses INSERT...ON CONFLICT DO UPDATE for idempotent upsert — safe across multiple backfill runs
- [Phase 75]: player_period_stats PK is (league_id, scoring_period, player_id) — upserts overwrite team_id when player is traded mid-season
- [Phase 75]: Tenure stats are raw component sums — frontend computes rate stats from components using existing formula functions
- [Phase 75]: player.espn_player_id (not player.id) used for ESPN-to-DB player ID lookup — player.id is a DB surrogate key
- [Phase 75-02]: On Team label uses cyan-400 to create a distinct visual tier between accent projection and muted YTD labels
- [Phase 75-02]: tenureStats render above YTD in lineup page — contribution-since-acquired shown before full-season view
- [Phase 76-api-hardening]: assertEspnCriticalShape is a TypeScript assertion function that throws on missing teams array — hard fail for structural ESPN API breakage
- [Phase 76-api-hardening]: logUnexpectedFields only logs at INFO — never throws — preserving graceful degradation for ESPN schema drift detection

### Roadmap Evolution

- Phase 71 added: Moves page data population — transaction ingestion, FAAB bid history, move impact computation
- Phase 73 added: Show current and projected stats for each player on waivers and roster pages
- Phase 74 added: Cache and materialize derived data from previous seasons to avoid recalculating immutable historical stats
- Phase 75 added: Active stats — show each player's stat contribution to a specific team based on roster tenure, not full-season totals
- Phase 76 added: API hardening — validate ESPN response shapes, add runtime type guards, log unexpected fields/missing data, add retry with backoff

### Blockers/Concerns

- [Phase 68 — FAAB]: ESPN mRoster view field name for FAAB remaining (acquisitionBudgetRemaining) is MEDIUM confidence — verify against live ESPN API before writing storage logic
- [Phase 68 — GS]: GS cap field in league_settings_version JSONB needs verification from ESPN API before GS pacing is built
- [Phase 67 — Category Map]: Free agent pool is never fetched from ESPN (CLAUDE.md Known Issue #1) — must fix or gracefully degrade before category opportunity map ships
- [Phase 70 — Hot/Cold]: ESPN period stats endpoint for 7-day rolling windows needs verification; player_period_stats exists in schema but ESPN feeding is unconfirmed

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 91 | Fix nominated player detection after reload | 2026-03-16 | 6052020 | [91-fix-nominated-player-detection-after-rel](./quick/91-fix-nominated-player-detection-after-rel/) |
| 92 | Detect myTeamId from ESPN draft DOM | 2026-03-16 | ab29825 | [92-detect-myteamid-from-espn-draft-dom-inst](./quick/92-detect-myteamid-from-espn-draft-dom-inst/) |
| 93 | Fix ideal roster optimizer for value drafting | 2026-03-16 | 1768f8a | [93-fix-ideal-roster-optimizer-for-value-dra](./quick/93-fix-ideal-roster-optimizer-for-value-dra/) |
| 94 | Simplify nomination — overpriced-first | 2026-03-16 | 0caeedd | [94-simplify-nomination-overpriced-first-on-](./quick/94-simplify-nomination-overpriced-first-on-/) |
| 95 | Wire shouldBid from Monte Carlo into auto-bid | 2026-03-18 | b22abaa | [95-wire-shouldbid-from-monte-carlo-into-aut](./quick/95-wire-shouldbid-from-monte-carlo-into-aut/) |
| 96 | Fix auto-nominate bug — add delay after search | 2026-03-22 | b3b5787 | [96-fix-auto-nominate-bug-add-delay-after-se](./quick/96-fix-auto-nominate-bug-add-delay-after-se/) |
| 97 | Filter trade recommendations by ESPN ASV similarity | 2026-03-23 | 1047cd9 | [97-trade-recommendations-should-be-based-on](./quick/97-trade-recommendations-should-be-based-on/) |
| 98 | Dashboard UX overhaul — hero card, status bar, tiered actions | 2026-03-23 | 5ac9ae2 | [98-dashboard-ux-overhaul-hero-card-status-b](./quick/98-dashboard-ux-overhaul-hero-card-status-b/) |
| 99 | Fix trade ASV filter — load ASV from static JSON | 2026-03-23 | 1dd596d | [99-fix-trade-asv-filter-load-asv-from-tools](./quick/99-fix-trade-asv-filter-load-asv-from-tools/) |
| 100 | UI audit — Inter/JetBrains Mono consistency + dark mode contrast | 2026-03-23 | 756c5cd | [100-ui-audit-inter-jetbrains-mono-consistenc](./quick/100-ui-audit-inter-jetbrains-mono-consistenc/) |
| 101 | Fix waiver rank color inversion and trade roster slot validation | 2026-03-24 | fde4071 | [101-fix-waiver-rank-color-inversion-and-trad](./quick/101-fix-waiver-rank-color-inversion-and-trad/) |
| 102 | Fix GS tracker counting roster slots and FAAB budget default | 2026-03-24 | 0f19c72 | [102-fix-gs-tracker-counting-roster-slots-not](./quick/102-fix-gs-tracker-counting-roster-slots-not/) |
| 103 | Fix standings page readability — remove DM Serif, dark mode contrast | 2026-03-24 | 762a42f | [103-fix-standings-page-readability-redesign-](./quick/103-fix-standings-page-readability-redesign-/) |
| 104 | Fix snapshot freshness — clear ESPN cache on forceFresh, add scoringPeriodId | 2026-03-24 | 139f644 | [104-fix-snapshot-freshness-clear-espn-cache-](./quick/104-fix-snapshot-freshness-clear-espn-cache-/) |
| 105 | Fix FAAB — extract remaining budget from ESPN team data | 2026-03-24 | e7a5ec9 | [105-fix-faab-extract-remaining-budget-from-e](./quick/105-fix-faab-extract-remaining-budget-from-e/) |
| 106 | Fix ASV filter — default missing players to $1 instead of skipping | 2026-03-24 | 6192346 | [106-fix-asv-filter-default-missing-players-](./quick/106-fix-asv-filter-default-missing-players-/) |

## Session Continuity

Last session: 2026-03-26T20:36:54.692Z
Stopped at: Completed 76-01-PLAN.md
Resume file: None
