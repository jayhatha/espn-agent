# ESPN Fantasy Baseball Command Center

## What This Is

A public web app where fantasy baseball managers sign up, connect their ESPN league, and get a full command center for managing their team — projected standings, team health analysis, daily action items (waiver grabs, trade proposals, lineup suggestions), and category trend analysis. Powered by FanGraphs RoS projections and component-based stat math.

## Core Value

Give fantasy baseball managers an information edge that saves time and leads to better decisions — see things other managers don't, act faster, finish higher.

## Requirements

### Validated

<!-- Shipped and confirmed valuable — inferred from existing codebase. -->

- ✓ ESPN league connection with SWID/espn_s2 auth — existing
- ✓ Daily snapshot pipeline (fetch ESPN → normalize → archive → store) — existing
- ✓ FanGraphs CSV projection upload and ingest — existing
- ✓ Projected final standings using component-based rate stat math — existing
- ✓ Basic waiver add/drop recommendation engine — existing
- ✓ Basic trade impact analysis and 1-for-1 candidate generation — existing
- ✓ Time series data for standings, category ranks, projected overall — existing
- ✓ JWT auth with registration and login — existing
- ✓ OAuth stubs for Google and GitHub — existing
- ✓ Slack integration for notifications (feature-flagged) — existing
- ✓ Database schema with 20+ tables covering snapshots, projections, transactions — existing

### Active

<!-- Current scope — building toward these. -->

- [ ] Polished frontend with real data visualization (charts, not just tables)
- [ ] Team dashboard showing health, strengths, weaknesses, action items
- [ ] League-wide insights — every team's standing, category gaps, trends
- [ ] Daily action items — what to do today (waivers, trades, lineup)
- [ ] Lineup optimization recommendations
- [ ] Fix rate stat trade impact (currently returns 0 delta)
- [ ] Wire PlayerIdentityResolution into projections ingest
- [ ] Fetch and use ESPN free agent pool for waiver recommendations
- [ ] Deep links to ESPN.com for recommended actions
- [ ] Draft assistant with positional scarcity and auction valuations
- [ ] Transaction ingestion and timeline annotations
- [ ] Current-season history tracking from moment of connection
- [ ] Multi-tenant auth flow with proper onboarding
- [ ] Responsive, production-quality UI with shared component library

### Out of Scope

- Automated roster moves via ESPN API — ESPN has no official write API; defer until feasibility proven
- Past season backfill — v2 feature; track going forward first
- What-if counterfactual analysis — v2 feature; requires historical backfill
- Mobile native app — web-first, responsive design covers mobile
- Real-time live scoring — ESPN doesn't expose real-time feeds reliably
- Points league support — roto category leagues only for v1

## Context

This is a brownfield project with a working backend (Fastify + PostgreSQL + BullMQ) and a basic frontend (Next.js 14). The backend agents compute useful data but the frontend barely surfaces it — pages are duplicated, use no shared components, hardcode localhost:3001, and render tables instead of charts despite Recharts being installed.

Key backend gaps: free agent pool always empty, player identity matching disconnected, rate stat trade simulation returns zeros, no transaction ingestion, no job locking on snapshot orchestrator.

The ESPN Fantasy API is read-only and undocumented. Auth uses SWID + espn_s2 cookies from private leagues. Data freshness depends on daily snapshot jobs.

FanGraphs Depth Charts RoS projections are uploaded as CSV and are global (not league-specific). Component math (H/AB for AVG, etc.) is critical — never average rates directly.

## Constraints

- **Tech stack**: Existing monorepo (Turbo + pnpm), Fastify backend, Next.js frontend, PostgreSQL, Redis — build on what exists
- **ESPN API**: Read-only, undocumented, cookie-based auth — fragile, needs retry/backoff
- **Projections**: FanGraphs CSV upload (manual), not auto-fetched — user must upload periodically
- **Rate stats**: Must use component math from `packages/shared/src/formulas.ts` — never average rates
- **Multi-tenant**: Public product — all data must be scoped per user/league, auth must be production-grade

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Recommendations only, no ESPN write actions | ESPN has no official write API; reverse-engineering is fragile | — Pending |
| Deep links to ESPN.com for user action | Low complexity, reliable, good UX | — Pending |
| Current-season history first, backfill later | Nail current experience before investing in historical data | — Pending |
| Build on existing stack (Fastify + Next.js) | Large working codebase, no reason to rewrite | — Pending |
| Roto category leagues only for v1 | Simplifies scoring model; points/H2H are different paradigms | — Pending |

---
*Last updated: 2026-02-19 after initialization*
