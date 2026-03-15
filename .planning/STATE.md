# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions — see things other managers don't, act faster, finish higher.
**Current focus:** v4.0 Personal Season Setup — Phase 43: Strip Auth & Env Config

## Current Position

Phase: 43 of 46 (Strip Auth & Env Config)
Plan: Ready to plan
Status: Ready to plan
Last activity: 2026-03-15 — Roadmap created for v4.0

Progress: [░░░░░░░░░░] 0% (v4.0)

## Performance Metrics

**Velocity (v3.0 completed — 12 plans across phases 39-42):**
- Typical plan duration: 1-10 min
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

- [v4.0 start]: Remove auth entirely (no JWT, no users table, no login) — re-enable later for multi-user
- [v4.0 start]: League 112523, Team 13, 13 teams hardcoded as primary config
- [v4.0 start]: Categories: R, RBI, HR, SB, OPS / K, W, SV, ERA, WHIP (5x5 with OPS)
- [v4.0 start]: ESPN creds via .env (SWID + espn_s2) primary, encrypted DB as fallback
- [v4.0 start]: Keep all existing code for later expansion — don't delete, just bypass
- [Phase 44]: OPS replaces AVG as default hitting rate stat; shared league-defaults.ts as single source of truth

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-15
Stopped at: Roadmap created for v4.0, ready to plan Phase 43
Resume file: None
