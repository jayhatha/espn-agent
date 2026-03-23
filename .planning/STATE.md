# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-23)

**Core value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions — see things other managers don't, act faster, finish higher.
**Current focus:** v6.0 In-Season Command Center — Phase 65: Dark Mode Shell

## Current Position

Phase: 65 of 70 (Dark Mode Shell)
Plan: 0 of ? in current phase
Status: Ready to plan
Last activity: 2026-03-23 — v6.0 roadmap created, 35 requirements mapped to 6 phases

Progress: [░░░░░░░░░░] 0% (v6.0)

## Performance Metrics

**Velocity:**
- Total plans completed (v5.0): ~35 plans
- v6.0 plans: 0 started

*Updated after each plan completion*

## Accumulated Context

### Decisions

- [v6.0 roadmap]: Phase 65 (shell) is pure frontend — build first, all other phases populate into it
- [v6.0 roadmap]: Phase 66 (roto math) uses interpolateRotoPoints() in shared/formulas.ts — pure function, no DB writes
- [v6.0 roadmap]: Phase 67 depends on Phase 66: marginal gain engine must exist before category opportunity map
- [v6.0 roadmap]: Phase 68 (FAAB + GS) and Phase 70 (trends) depend only on the shell — independent tracks
- [v6.0 roadmap]: Phase 69 (trade finder) comes last — depends on Phase 67 waiver delta being production-trusted
- [v6.0 roadmap]: FAAB balance must come from ESPN mRoster view (acquisitionBudgetRemaining) — not derived from transaction sums
- [v6.0 roadmap]: next-themes for SSR-safe dark mode, @tanstack/react-table for sortable trade scanner, @tanstack/react-virtual for virtualized rows

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

## Session Continuity

Last session: 2026-03-23
Stopped at: v6.0 roadmap written — 35 requirements mapped to phases 65-70. Ready to plan Phase 65.
Resume file: None
