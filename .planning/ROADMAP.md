# Roadmap: ESPN Fantasy Baseball Command Center

## Overview

Transform a working but broken backend into a production-ready fantasy baseball command center. Phase 1 fixes critical data and security gaps (free agents, rate stats, auth, encryption). Phase 2 adds multi-tenant auth with onboarding. Phase 3 delivers the core dashboard with visualizations and recommendations. Phase 4 adds advanced features (lineup optimizer, draft assistant) for retention and seasonal acquisition.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Critical Fixes** - Fix broken data systems and security vulnerabilities before building features
- [ ] **Phase 2: Authentication & Onboarding** - Enable user accounts with OAuth and guided first-run experience
- [ ] **Phase 3: Core Dashboard & Recommendations** - Deliver main value with visualizations and AI-powered insights
- [ ] **Phase 4: Advanced Features & Polish** - Add lineup optimizer, draft assistant, and engagement features

## Phase Details

### Phase 1: Foundation & Critical Fixes
**Goal**: Fix all critical blockers preventing public launch — secure data storage, working free agents, accurate trade math, shared components
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, INFR-01, INFR-02, INFR-03, DASH-05, DASH-06
**Success Criteria** (what must be TRUE):
  1. User's ESPN cookies are encrypted at rest in database (not plaintext)
  2. Free agent pool fetches successfully from ESPN API and populates recommendations
  3. Trade simulation math uses component formulas (AVG = H/AB, not averaged rates) and returns correct deltas
  4. Frontend pages use centralized API client with environment-based URLs (no hardcoded localhost:3001)
  5. All API routes require authentication and verify league ownership (no data leakage)
**Plans**: 6 plans

Plans:
- [ ] 01-01-PLAN.md — Backend infrastructure: ESPN API retry, rate limiting, snapshot job dedup
- [ ] 01-02-PLAN.md — Security: ESPN cookie encryption at rest, auth enforcement on all routes
- [ ] 01-03-PLAN.md — Rate stat component math in trade simulations (TDD)
- [ ] 01-04-PLAN.md — ESPN data gaps: free agents, transactions, player identity wiring
- [ ] 01-05-PLAN.md — Frontend API client migration (eliminate hardcoded localhost)
- [ ] 01-06-PLAN.md — Frontend shared component library extraction

### Phase 2: Authentication & Onboarding
**Goal**: Enable user registration, login with OAuth providers, and guided onboarding flow for new users
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. User can create account with email/password and log in across sessions
  2. User can log in via Google OAuth without creating separate password
  3. User can log in via GitHub OAuth without creating separate password
  4. New user sees guided onboarding (connect league → upload projections → view dashboard)
  5. User stays logged in across browser sessions with JWT token refresh
**Plans**: TBD

Plans:
- TBD

### Phase 3: Core Dashboard & Recommendations
**Goal**: Deliver main product value through team dashboard with trend charts, category analysis, and actionable recommendations
**Depends on**: Phase 2
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, RECC-01, RECC-02
**Success Criteria** (what must be TRUE):
  1. User sees team dashboard showing health overview, category strengths/weaknesses, and surplus/deficit analysis
  2. User sees category trend charts (Recharts line/area charts, not tables) for standings over time
  3. User sees daily action items with ESPN deep links for recommended actions
  4. User sees waiver recommendations using real free agent pool with projected standings impact
  5. User sees 1-for-1 trade candidates with accurate delta calculations using fixed rate stat math
**Plans**: TBD

Plans:
- TBD

### Phase 4: Advanced Features & Polish
**Goal**: Add engagement features (lineup optimizer, streaming suggestions) and seasonal acquisition tools (draft assistant)
**Depends on**: Phase 3
**Requirements**: RECC-03, RECC-04, DRFT-01, DRFT-02
**Success Criteria** (what must be TRUE):
  1. User sees daily lineup optimization (start/sit recommendations) based on matchups and projections
  2. User sees streaming pitcher suggestions for favorable matchups with projected impact
  3. User sees pre-draft rankings with positional scarcity analysis (VBD methodology)
  4. User sees auction valuations based on projected stats and budget constraints
**Plans**: TBD

Plans:
- TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Critical Fixes | 4/6 | In Progress|  |
| 2. Authentication & Onboarding | 0/TBD | Not started | - |
| 3. Core Dashboard & Recommendations | 0/TBD | Not started | - |
| 4. Advanced Features & Polish | 0/TBD | Not started | - |
