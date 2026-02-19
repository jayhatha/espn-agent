# Project Research Summary

**Project:** ESPN Fantasy Baseball Assistant Enhancement
**Domain:** Fantasy Sports Analytics Dashboard
**Researched:** 2026-02-19
**Confidence:** HIGH

## Executive Summary

This project is a fantasy baseball analytics dashboard that integrates with ESPN's Fantasy Baseball API to provide projections-based insights for roto category leagues. Research shows that successful fantasy sports tools converge on three pillars: reliable third-party API integration with graceful degradation, component-based statistical calculations for rate stats, and actionable AI-powered recommendations over static data displays. The recommended approach leverages the existing solid foundation (Fastify + Next.js + Agent pattern + Kysely) while addressing critical gaps in auth/security, frontend architecture, and ESPN API reliability.

The primary technical risk is ESPN API instability (undocumented, breaking changes without notice). Mitigation: raw payload archival (already implemented), circuit breakers, schema fingerprint monitoring, and graceful degraded states. The primary product risk is launching with incomplete table stakes features (broken free agent fetching, missing player news, unfixed rate stat math). Mitigation: Phase 1 must complete all critical blockers before building differentiating features. The recommended stack additions are minimal and strategic: activate existing Recharts, add shadcn/ui for composable components, integrate TanStack Table for complex data grids, and implement Server-Sent Events for real-time updates.

Key insight from competitive analysis: most fantasy tools provide static rankings and data displays. This app's competitive advantage lies in category-aware simulation (trades/waivers ranked by projected standings impact) and FanGraphs RoS projection quality. Focus differentiation on actionable daily insights ("Pick up Smith, drop Jones, gain 0.8 roto points") rather than generic player rankings.

## Key Findings

### Recommended Stack

The current stack (Fastify, Next.js 14, TanStack Query v5, Kysely, BullMQ, Recharts, Tailwind) is already aligned with 2025 best practices for sports dashboards. Research recommends activating unused tools rather than adding new dependencies. The priority is filling component and real-time gaps, not replacing core technologies.

**Core technologies:**
- **shadcn/ui + Radix UI**: Accessible, composable dashboard components (Card, Table, Tabs, Dialog, Select, Badge, Tooltip) — fastest-growing pattern for data-heavy apps, Tailwind-native, no library dependency
- **TanStack Table v8**: Headless data tables with sorting/filtering/grouping for free agent browser and roster management — gold standard for sports stat tables, seamless integration with existing TanStack Query
- **Recharts 2.12+**: Sports visualization (line charts for trends, bar charts for standings, scatter plots for trade analysis) — already installed but unused, upgrade and activate
- **Server-Sent Events (SSE)**: Real-time snapshot completion and transaction alerts — simpler than WebSockets for poll-based ESPN API, native browser support
- **React Hook Form + Zod**: Form validation reusing backend Zod schemas — type-safe, minimal re-renders, extends existing Zod usage to frontend
- **sonner**: Toast notifications for mutations and alerts — beautiful defaults, promise support for loading states

**Backend enhancements:**
- **@lifeomic/attempt**: Retry logic with exponential backoff for ESPN API reliability
- **Redis caching**: Replace in-memory cache, already available via @fastify/redis
- **Cookie encryption at rest**: Critical security gap, use AWS KMS or equivalent

### Expected Features

**Must have (table stakes):**
- League integration with daily roster sync — COMPLETED ✓
- Standings view with historical time series — COMPLETED ✓
- Rest-of-season projections with projected standings — COMPLETED ✓
- Free agent pool fetching — BROKEN, CRITICAL BLOCKER
- Player stats display with current performance — Partial, missing news feed
- Basic waiver wire with add/drop comparison — Degraded, simulation returns hardcoded values

**Should have (competitive differentiators):**
- AI-powered waiver recommendations with category impact simulation — Partial, needs real free agent data
- Trade recommendations (1-for-1) with projected standings delta — Partial, rate stats broken
- Category scarcity analysis (surplus/deficit dashboard) — Not implemented, data exists
- Trend charts UI (category rank over time) — Data exists, UI renders tables not charts
- Lineup optimizer (daily start/sit recommendations) — Not implemented
- Streaming suggestions (pick up pitcher for today's starts) — Not implemented

**Defer (v2+):**
- Draft assistant (pre-draft rankings, live draft sync) — Off-season feature
- Multi-player trades (2-for-2, 3-for-1 scenarios) — Very high complexity
- Dynasty/keeper league support — Different target audience
- Points leagues support — Different scoring model
- Cross-platform league management (Yahoo, Fantrax) — Scope creep
- Mobile native apps — Responsive web sufficient, PWA acceptable

### Architecture Approach

The existing layered monorepo with agent-based business logic is appropriate for this domain. Research validates the agent pattern (single responsibility, degraded state handling) and component-based rate stat formulas. Evolution needed: frontend component architecture (currently empty components/ directory), API client abstraction (pages hardcode localhost:3001), Redis caching layer (replace in-memory), and real-time SSE integration.

**Major components:**

1. **Frontend Component Library** — Shared shadcn/ui components (StatCard, RankBadge, DeltaIndicator, PlayerTable, ActionCard, DegradedBanner) replacing per-page duplication
2. **Centralized API Client** — Single lib/api.ts with auth headers, error handling, retry logic, environment-based URLs replacing hardcoded localhost:3001
3. **Redis Caching Layer** — Cache projected standings (invalidate on snapshot), free agent pool (TTL 15 min), player projections (invalidate on upload) reducing database load
4. **SSE Event Stream** — Real-time snapshot completion, transaction alerts, projection updates via /api/leagues/:id/events endpoint
5. **Auth Middleware** — Session/JWT validation, league ownership verification, rate limiting on all routes preventing data leakage across tenants
6. **Enhanced ESPN Adapter** — Circuit breakers, exponential backoff retry, schema fingerprint monitoring, free agent endpoint implementation, cookie encryption at rest

### Critical Pitfalls

From analysis of 24 identified pitfalls, the top 5 blocking public launch:

1. **Plaintext Cookie Storage (Pitfall #2)** — ESPN auth cookies stored unencrypted violates user trust and compliance. Encrypt at rest using AWS KMS/GCP Secret Manager, never log cookie values, implement cookie expiration detection with user re-auth flow. CRITICAL VULNERABILITY: 1 week effort

2. **Free Agent Pool Never Fetched (Pitfall #3)** — ESPN API endpoint returns empty by default, requires complex filtering/pagination params. Waiver recommendations are useless without FA pool. Reverse-engineer ESPN params, cache daily, pre-populate from FanGraphs player universe. BLOCKING FEATURE: 2 weeks effort

3. **Rate Stat Projection Math Errors (Pitfall #4)** — Trade simulation averages rate stats instead of using component-based math (AVG = H/AB), producing incorrect results. Extend formulas.ts component math to all simulation code, add integration tests. CRITICAL BUG: 3 days effort

4. **Multi-Tenant Data Leakage (Pitfall #9)** — No authentication enforcement on API routes allows User A to access User B's private leagues. Implement auth middleware with JWT, league ownership verification, database-level Row Level Security, UUID league IDs. CRITICAL VULNERABILITY: 2 weeks effort

5. **Frontend Hardcoded API URLs (Pitfall #14)** — All pages hardcode localhost:3001 instead of using lib/api.ts with environment variables. Production deployment will instantly break with CORS errors. Migrate to centralized api.ts with NEXT_PUBLIC_API_URL. BLOCKING DEPLOYMENT: 2 days effort

Additional critical items: missing rate limiting (Pitfall #11), no monitoring/alerting (Pitfall #21), no database backups (Pitfall #22), broken navigation links (Pitfall #18), disconnected player identity resolution (Pitfall #6).

## Implications for Roadmap

Based on research, suggested 4-phase structure with Phase 1 addressing all critical blockers:

### Phase 1: Foundation & Critical Fixes (6-7 weeks)
**Rationale:** 10 critical/blocking pitfalls must be resolved before any public-facing features can safely launch. This phase fixes data leakage vulnerabilities, broken core features, and deployment blockers.

**Delivers:**
- Secure multi-tenant system with auth middleware and encrypted cookie storage
- Working free agent pool fetching from ESPN API
- Fixed rate stat simulation math in trade recommendations
- Centralized API client with environment-based URLs
- Shared component library (5-10 core components)
- Player identity resolution wired into projections ingest
- Database backups and monitoring infrastructure

**Addresses Features:**
- Free agent pool fetching (table stakes, CRITICAL)
- Player identity matching (enables accurate projections)
- Trade recommendations rate stat fix (differentiator repair)

**Avoids Pitfalls:**
- #2 Plaintext cookies → encrypt at rest
- #3 Free agent data → implement ESPN endpoint
- #4 Rate stat math → component-based formulas
- #6 Player matching → wire identity resolution
- #9 Multi-tenant leakage → auth middleware
- #11 Rate limiting → per-user quotas
- #14 Hardcoded URLs → centralized api.ts
- #18 Broken navigation → fix routes
- #21 No monitoring → alerting setup
- #22 No backups → automated daily backups

**Stack Usage:** @lifeomic/attempt (retry), Redis caching, shadcn/ui components, Zod schema sharing

**Research Flag:** SKIP — well-documented security/auth patterns, standard ESPN API reverse engineering

### Phase 2: Core Dashboard UI & Differentiators (4 weeks)
**Rationale:** With foundation secure and data reliable, build the team-centric dashboard that delivers unique value through category-aware insights and trend visualization.

**Delivers:**
- Team dashboard with category health, strengths/weaknesses
- Category trend charts (activate Recharts for line/bar/area charts)
- Projected vs current standings visualization
- Daily action items view ("3 things to do today")
- Category scarcity analysis (surplus/deficit by position)
- Waiver recommendation cards with ESPN deep links
- TanStack Table-powered free agent browser with sorting/filtering

**Addresses Features:**
- Trend charts UI (differentiator, data already exists)
- Category scarcity analysis (differentiator, HIGH competitive advantage)
- Waiver recommendations (differentiator, needs Phase 1 free agent fix)
- Shared component library (fixes tech debt)

**Avoids Pitfalls:**
- #15 No shared UI components → full component library
- #17 Recharts unused → activate charts
- #19 No onboarding → empty states, guided flow

**Stack Usage:** Recharts 2.12+, shadcn/ui, TanStack Table v8, React Hook Form

**Architecture:** Frontend Component Library, Redis Caching Layer, API Client

**Research Flag:** SKIP — standard dashboard patterns, Recharts well-documented

### Phase 3: Advanced Recommendations & Real-Time (4 weeks)
**Rationale:** Deepen engagement with advanced simulation features and real-time updates. Requires Phase 1 foundation and Phase 2 UI components.

**Delivers:**
- Lineup optimizer (daily start/sit recommendations)
- Streaming suggestions (pick up pitcher for today's starts)
- Multi-player trade finder (2-for-2, 3-for-1 scenarios)
- SSE real-time snapshot completion events
- Daily digest email ("Here are your 3 action items")
- Custom alerts (player hits waivers, category rank drops)
- Matchup analysis (pitcher vs team, park factors)

**Addresses Features:**
- Lineup optimizer (differentiator, HIGH priority per FEATURES.md)
- Streaming suggestions (differentiator, MEDIUM priority)
- Multi-player trades (differentiator, VERY HIGH complexity)
- Real-time updates (UX enhancement)

**Avoids Pitfalls:**
- #1 ESPN API instability → circuit breakers, schema monitoring
- #7 Stale projections → staleness detection, UI warnings
- #8 Injury updates → zero-out IL player projections
- #12 N+1 queries → batch loading, query optimization
- #13 Snapshot concurrency → job staggering, worker limits
- #16 localStorage team selection → server-side preferences

**Stack Usage:** Server-Sent Events, @fastify/sse, sonner toasts, optimistic updates

**Architecture:** SSE Event Stream, Enhanced ESPN Adapter

**Research Flag:** MEDIUM — Multi-player trade combinatorics may need algorithm research (traveling salesman variant), matchup analysis requires external data sources (MLB schedule API, park factors)

### Phase 4: Off-Season & Polish (3 weeks, pre-season timing)
**Rationale:** Draft assistant is critical for user acquisition but only relevant pre-season (Feb-March). Polish and advanced features for retention.

**Delivers:**
- Draft assistant (pre-draft rankings, live draft sync, auction valuations)
- Onboarding flow with interactive tutorial
- Feature flags for gradual rollout
- Performance optimization (query batching, pagination)
- Advanced stat support (QS, K/9, OPS+, custom categories)
- Mobile PWA optimizations

**Addresses Features:**
- Draft assistant (table stakes for launch, seasonal timing)
- Onboarding flow (UX, reduces drop-off)
- Custom category support (expands addressable market)

**Avoids Pitfalls:**
- #5 Incomplete stat categories → dynamic category parsing
- #19 No onboarding → guided setup wizard
- #20 Seasonality → draft tools ready for Feb launch
- #24 No feature flags → gradual rollout system

**Stack Usage:** Feature flag system (LaunchDarkly or custom), PWA manifest

**Research Flag:** MEDIUM — Draft assistant ADP data sourcing, auction valuation algorithms need research

### Phase Ordering Rationale

- **Security first:** Phase 1 blocks all vulnerabilities before exposing to public users
- **Data integrity second:** Phase 1 fixes free agents and rate stats before building on broken foundation
- **Core value third:** Phase 2 delivers unique category-aware insights that justify switching from competitors
- **Engagement fourth:** Phase 3 adds depth features that increase daily usage
- **Acquisition fifth:** Phase 4 draft tools aligned with seasonal user influx (Feb-March)

This order avoids building differentiating features (Phase 2-3) on a broken foundation (Phase 1 unfixed), prevents launching without table stakes features complete (free agents, navigation), and aligns with fantasy baseball seasonality (draft assistant ready by February).

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 3 (Multi-Player Trades):** Combinatorial optimization for 2-for-2, 3-for-1 scenarios with rate stat constraints is algorithmically complex. May need constraint solver or heuristic approach research.
- **Phase 3 (Matchup Analysis):** Requires external data sources (MLB schedule API, park factors database, weather API, pitcher/batter splits). API discovery and integration patterns need research.
- **Phase 4 (Draft Assistant ADP):** Average Draft Position data sourcing (scrape FantasyPros? partner with data provider? crowdsource from users?). Auction valuation algorithms (linear programming? market-based?).

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Security/Auth):** Well-documented JWT middleware, database RLS, cookie encryption patterns. Straightforward implementation.
- **Phase 2 (Dashboard UI):** Standard React component architecture, Recharts examples abundant for sports charts, TanStack Table well-documented.
- **Phase 3 (SSE):** Standard browser EventSource API, Fastify SSE plugin available, polling-based model is simple.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH (95%)** | Current stack validated by 2025 industry standards, recommended additions are proven (TanStack Table, shadcn/ui, Recharts). Only uncertainty: SSE vs WebSockets, but SSE fits ESPN polling model better. |
| Features | **HIGH (90%)** | Competitive landscape analysis clear on table stakes vs differentiators. Uncertainty: exact ESPN API params for free agents (reverse engineering required), multi-player trade algorithm complexity (may hit performance limits). |
| Architecture | **HIGH (85%)** | Agent pattern validated for domain, component boundaries clear. Uncertainty: optimal caching strategy TTLs (needs production load testing), Redis concurrency limits with 1000+ leagues. |
| Pitfalls | **MEDIUM-HIGH (80%)** | 24 pitfalls identified from fantasy sports domain knowledge and brownfield code analysis. Uncertainty: undiscovered ESPN API edge cases (schema changes, rate limit thresholds), actual user auth flow drop-off rates (affects cookie encryption UX). |

**Overall confidence:** HIGH (88%)

### Gaps to Address

Research identified gaps requiring validation during implementation:

- **ESPN API Free Agent Endpoint:** Reverse engineering required to discover correct filter/pagination params. Warning signs: empty arrays, undocumented params. Mitigation: monitor ESPN web app network traffic, trial-and-error with known leagues, community forum research.

- **Player Identity Matching Accuracy:** FanGraphs vs ESPN name variations (accents, suffixes, nicknames). Current fuzzy matching may have false positives/negatives. Mitigation: confidence score thresholds, admin review queue for low-confidence matches, manual mapping UI.

- **Multi-Player Trade Performance:** Combinatorial explosion for 3-for-2, 4-for-1 trades in 12-team league (roster size ~25 players). May require heuristic cutoffs or limited search space. Mitigation: Phase 3 research task, prototype with constraint solver, benchmark against user patience thresholds.

- **ESPN API Rate Limits:** Undocumented, may vary by IP/account. Current implementation has no backoff. Mitigation: Phase 1 monitoring setup, exponential backoff, circuit breakers, community data sharing on observed limits.

- **Projection Staleness Thresholds:** 14-day threshold is estimate, optimal value unknown. Mitigation: A/B test warning messaging, user feedback on acceptability, FanGraphs update frequency monitoring.

- **Real-Time Update Frequency:** SSE event volume with 1000+ leagues (snapshot completion rate, transaction feed size). May overwhelm frontend or Redis pub/sub. Mitigation: Phase 3 load testing, event throttling, user-specific event filtering.

## Sources

### Primary (HIGH confidence)
- **CLAUDE.md** — Existing codebase architecture, agent implementations, known issues (gaps: free agents, player identity, rate stats, hardcoded URLs)
- **Fantasy sports domain knowledge (2015-2025)** — ESPN Fantasy Baseball user experience, FantasyPros/Pitcher List/RotoWire competitive features, Reddit r/fantasybaseball community discussions
- **2025 React ecosystem standards** — TanStack ecosystem (Query v5, Table v8), shadcn/ui adoption trends, Recharts sports dashboard examples, Next.js 14 App Router patterns

### Secondary (MEDIUM confidence)
- **ESPN Fantasy API reverse engineering** — Community forum documentation (undocumented API), browser DevTools network inspection for endpoint discovery (free agents, activity feed)
- **Component-based rate stat formulas** — Baseball statistics methodology (AVG = H/AB, ERA = 9*ER/IP, WHIP = (H+BB)/IP), projection aggregation math (never average rates)
- **Multi-tenant SaaS patterns** — JWT middleware, database RLS, cookie encryption (AWS KMS), rate limiting strategies (Redis-based, per-user quotas)

### Tertiary (LOW confidence)
- **ESPN API rate limits** — No official documentation, community reports vary (may be IP-based, time-windowed, account-tiered)
- **Multi-player trade algorithm performance** — No benchmarks for fantasy baseball domain, constraint solver feasibility unknown (needs Phase 3 research)
- **FanGraphs API availability** — Projections currently CSV upload only, unclear if automated fetch is feasible (Terms of Service, scraping policy)

---
*Research completed: 2026-02-19*
*Ready for roadmap: yes*
