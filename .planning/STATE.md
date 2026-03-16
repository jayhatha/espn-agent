# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions — see things other managers don't, act faster, finish higher.
**Current focus:** v5.0 Draft Engine Spec Alignment — Phase 52

## Current Position

Phase: 52 of 52 (Extension Sidebar UI Update)
Plan: 02 (plan 01 complete)
Status: In Progress
Last activity: 2026-03-16 — Completed 52-01-PLAN.md

Progress: [████████░░] 80% (v5.0 — 4/6 phases complete)

## Accumulated Context

### Decisions

- [v5.0 start]: Keep simulation-based BID/PASS (more sophisticated than spec formula)
- [v5.0 start]: Keep SGP bid optimizer (more accurate than model_value - 2)
- [v5.0 start]: Add spec gaps as enhancements, not replacements
- [Phase 47]: Endgame at $20 remaining, 30% bid dampening, value_per_dollar filtering, budget bands as tracking (not constraints)
- [Phase 48]: Overpricing-based nomination scoring: 60% overpricing, 20% opponent need, 20% my non-need
- [Phase 49]: Positional weights added after dampening; SP tier caps clamp bid ceiling by drafted SP count; GS cap is advisory only
- [Phase 50]: Inflation bands use clamped factor; +2 adjustment after endgame dampening; CATEGORY_RANK_TARGETS separate from stat total targets
- [Phase 51]: Client-side CSV parsing for FanGraphs/ESPN data import in extension popup
- [Phase 52]: Grafana tokens use explicit hex values, no dark: variants (Shadow DOM constraint)
- [Phase 52]: pitcherHitterSplit default changed to 75 with v6 migration; autoMode defaults to true but is session-only

### Roadmap Evolution

- Phase 52 added: Extension sidebar UI update for v5.0 engine signals

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-16
Stopped at: Completed 52-01-PLAN.md
Resume file: None
