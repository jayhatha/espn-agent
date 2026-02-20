# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions
**Current focus:** Phase 3 - Core Dashboard & Recommendations

## Current Position

Phase: 3 of 4 (Core Dashboard & Recommendations)
Plan: 0 of TBD completed
Status: Not started
Last activity: 2026-02-19 — Completed Phase 2 (Authentication & Onboarding)

Progress: [----------] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: 9 minutes
- Total execution time: 84 minutes

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 6 | 74min | 12min |
| 02 | 3 | 10min | 3min |

**Recent Executions:**
- Phase 02 Plan 03: 3min (2 tasks, 2 files)
- Phase 02 Plan 02: 3min (2 tasks, 6 files)
- Phase 02 Plan 01: 4min (2 tasks, 9 files)
- Phase 01 Plan 06: 18min (2 tasks, 13 files)
- Phase 01 Plan 04: 5min (3 tasks, 3 files)
- Phase 01 Plan 05: 11min (3 tasks, 8 files)
- Phase 01 Plan 03: 11min (2 tasks, 4 files)
- Phase 01 Plan 02: 17min (2 tasks, 11 files)
- Phase 01 Plan 01: 17min (2 tasks, 8 files)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Build on existing stack (Fastify + Next.js) — large working codebase, no reason to rewrite
- Recommendations only, no ESPN write actions — ESPN has no official write API
- Current-season history first, backfill later — nail current experience before investing in historical data
- Roto category leagues only for v1 — simplifies scoring model
- [Phase 01-02]: Generic ENCRYPTION_KEY instead of service-specific keys for easier configuration
- [Phase 01-02]: Graceful degradation with hasEncryptionKey() for development without encryption
- [Phase 01-02]: Middleware reads leagueId/teamId from request.params instead of closure pattern
- [Phase 01-02]: Filter GET /api/leagues to user's leagues instead of global list
- [Phase 01-04]: ESPN free agent filter passed as x-fantasy-filter URL parameter with filterSlotIds
- [Phase 01-04]: Fuzzy match confidence threshold 0.8 in projections ingest, 0.7 in identity agent
- [Phase 01-04]: Transaction deduplication via SHA-256 payload hash on unique constraint
- [Phase 01-06]: Two-tier component structure: ui/ for generic primitives, league/ for domain-specific
- [Phase 01-06]: Export helper functions (formatStatValue, getRankColor) from components for cross-page reuse
- [Phase 01-06]: TeamSelector handles localStorage persistence internally to reduce page boilerplate
- [Phase 02-01]: Shared auth-cookies utility in utils/ instead of exporting from auth.ts to avoid circular dependencies
- [Phase 02-01]: Bcrypt 10 rounds for refresh token hashing (speed) vs 13 rounds for passwords (security)
- [Phase 02-01]: Graceful logout clears cookies even with invalid/expired JWT
- [Phase 02-02]: Navigation displays user.displayName with email fallback instead of just email
- [Phase 02-03]: Wizard state is in-memory only -- navigating away resets to step 0 (simplicity over persistence)
- [Phase 02-03]: Feature card hrefs on landing page point to /signup instead of /leagues for unauthenticated users

### Pending Todos

None yet.

### Blockers/Concerns

**From Research (Phase 1 Critical Items):**
- ~~Free agent pool never fetched from ESPN~~ — RESOLVED in 01-04 (fetchFreeAgents with filterSlotIds and position filtering)
- ~~ESPN cookies stored plaintext~~ — RESOLVED in 01-02 (encryption at rest with AES-256-GCM)
- ~~Multi-tenant data leakage risk~~ — RESOLVED in 01-02 (JWT auth on all routes, league membership verification)
- ~~Rate stat simulation math broken~~ — RESOLVED in 01-03 (component-based calculations for all 6 rate stats with TDD)
- ~~Frontend hardcoded localhost URLs~~ — RESOLVED in 01-05 (centralized API client with environment-based base URL)

**Research Flags for Future Phases:**
- Phase 3: Multi-player trade combinatorics may need constraint solver research
- Phase 3: Matchup analysis requires external data sources (MLB schedule API, park factors)
- Phase 4: Draft assistant ADP data sourcing strategy needs research

## Session Continuity

Last session: 2026-02-19 (plan execution)
Stopped at: Completed 02-03-PLAN.md (Onboarding Flow) -- Phase 2 complete
Resume file: None

---
*Next step: Research and plan Phase 3 (Advanced Analysis & Trade Engine)*
