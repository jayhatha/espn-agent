# Architecture Research: Fantasy Baseball Dashboard

**Research Date:** 2026-02-19
**Domain:** Fantasy Baseball Management Tools
**Context:** Evolving existing Fastify + Next.js monorepo into polished multi-tenant dashboard product

---

## Current Architecture Assessment

The existing system follows a **layered monorepo** pattern that's solid for this domain:

```
[Next.js Frontend] → [Fastify API] → [Agent Layer] → [PostgreSQL + Redis]
                                         ↓
                                    [BullMQ Workers]
```

**What works well:**
- Agent-based business logic (each agent has single responsibility)
- Shared types package prevents drift between frontend/backend
- Component-based rate stat math centralized in formulas.ts
- Raw payload archival for ESPN API debugging

**What needs evolution:**
- Frontend has no component architecture (empty components/ dir)
- No API client abstraction (pages hardcode localhost:3001)
- No caching layer between API and database
- No real-time update mechanism

---

## Recommended Architecture for Dashboard Product

### Component Boundaries

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND                          │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Shared   │  │ Page     │  │ Data Layer       │  │
│  │ Component│  │ Layouts  │  │ (TanStack Query) │  │
│  │ Library  │  │          │  │                  │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                       │                             │
│                  API Client (lib/api.ts)             │
└───────────────────────┼─────────────────────────────┘
                        │ HTTP/JSON
┌───────────────────────┼─────────────────────────────┐
│                    BACKEND                           │
│                       │                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Auth     │  │ API      │  │ Agent Layer      │  │
│  │ Middleware│  │ Routes   │  │ (Business Logic) │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                      │              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Cache    │  │ Database │  │ Queue            │  │
│  │ (Redis)  │  │ (Kysely) │  │ (BullMQ)         │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────┐
│                  EXTERNAL                            │
│                       │                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ ESPN API │  │ FanGraphs│  │ OAuth Providers  │  │
│  │ (Read)   │  │ (CSV)    │  │ (Google/GitHub)  │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Data Flow Patterns

**1. Daily Snapshot Pipeline (existing, enhance)**
```
Cron (3 AM) → BullMQ → SnapshotOrchestrator
  → ESPN API (with retry/backoff)
  → Archive raw payload
  → Normalize → Write snapshot tables
  → StandingsProjection → Write projected tables
  → Invalidate Redis cache
```

**2. User Request Flow (enhance)**
```
Frontend Page → TanStack Query → API Client (lib/api.ts)
  → Fastify Route (with auth middleware)
  → Check Redis cache
  → If miss: Agent computation → PostgreSQL query → Cache result
  → JSON response → TanStack Query cache → React render
```

**3. Recommendation Flow (enhance)**
```
User views team dashboard
  → Parallel fetch: standings + roster + projections + free agents
  → WaiverAgent computes recommendations (with real free agent pool)
  → TradeAgent computes candidates (with fixed rate stats)
  → LineupAgent computes optimal lineup (NEW)
  → Dashboard renders actionable cards with ESPN deep links
```

**4. Projection Upload Flow (existing, enhance)**
```
Admin uploads CSV → ProjectionsIngest
  → PlayerIdentityResolution (NEW: wire in fuzzy matching)
  → Write player_projection rows
  → Trigger re-snapshot for all leagues
  → Invalidate all projection caches
```

### Frontend Architecture

**Component hierarchy for dashboard product:**

```
App Shell (layout.tsx)
├── Navigation (league selector, team selector, user menu)
├── Page Layouts
│   ├── DashboardLayout (sidebar + main content)
│   ├── FullWidthLayout (standings, trends)
│   └── SplitLayout (trade builder: two rosters side by side)
├── Shared Components
│   ├── Data Display: StatCard, RankBadge, DeltaIndicator, ProjectionBar
│   ├── Charts: StandingsChart, CategoryTrendChart, RosterHeatmap
│   ├── Tables: PlayerTable, StandingsTable, TradeImpactTable
│   ├── Actions: ActionCard, DeepLinkButton, RecommendationList
│   └── Feedback: LoadingSkeleton, ErrorBoundary, EmptyState, DegradedBanner
└── Feature Modules
    ├── Dashboard: TeamHealthCard, DailyActions, CategoryOverview
    ├── Standings: CurrentStandings, ProjectedStandings, StandingsTimeline
    ├── Waivers: WaiverRecommendations, FreeAgentBrowser, AddDropSimulator
    ├── Trades: TradeBuilder, TradeImpactView, TradeCandidates
    ├── Trends: CategoryTrends, PlayerTrends, LeagueTrends
    └── Draft: DraftBoard, AuctionCalculator, ScarcityChart
```

### Caching Strategy

**Layer 1: TanStack Query (frontend)**
- Stale time: 5 min for standings, 1 min for live data
- Background refetch on window focus

**Layer 2: Redis (backend)**
- Projected standings: cache per league, invalidate on snapshot
- Free agent list: cache per league, TTL 15 min
- Player projections: cache per run, invalidate on upload

**Layer 3: PostgreSQL (source of truth)**
- All snapshot data, projections, transactions

### Multi-Tenant Architecture

```
Request → JWT validation → Extract userId
  → Verify league ownership (userId ↔ leagueId via league table)
  → Scoped query: WHERE league_id = ? AND user_id = ?
  → Response (only user's data)
```

**Key principle:** Every database query must be scoped by the authenticated user. No league data accessible without ownership verification.

---

## Suggested Build Order

Based on dependencies between components:

### Phase 1: Foundation (Backend Fixes + Frontend Infrastructure)
**Must come first — everything else depends on these.**
- Fix auth middleware enforcement on all routes
- Fix API client (replace hardcoded localhost)
- Build shared component library (5-10 core components)
- Fix rate stat trade simulation
- Wire PlayerIdentityResolution into projections
- Fetch real free agent pool from ESPN

### Phase 2: Dashboard Core (Team-Centric Views)
**Depends on Phase 1 components and fixed data.**
- Team dashboard with health/strengths/weaknesses
- Category trend charts (activate Recharts)
- Projected standings visualization
- Daily action items view

### Phase 3: Recommendations & Actions
**Depends on Phase 2 UI components and Phase 1 data fixes.**
- Waiver recommendation cards with ESPN deep links
- Trade builder and impact analysis
- Lineup optimization
- Transaction timeline

### Phase 4: Public Product Polish
**Depends on all prior phases being stable.**
- Onboarding flow for new users
- Draft assistant
- Error handling and degraded state UI
- Performance optimization (caching, query batching)

### Phase 5: Historical & Advanced (v2)
**Optional, depends on stable v1.**
- Past season backfill
- What-if analysis
- Season replay timeline
- Advanced stat support (QS, K/9, OPS+)

---

## Key Architecture Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Real-time updates | SSE (Server-Sent Events) | Simpler than WebSockets; polling-based data model fits SSE well |
| Component library | shadcn/ui + Radix | Accessible, customizable, works with Tailwind |
| Charts | Recharts (already installed) | Sufficient for sports data viz; avoid adding new deps |
| State management | TanStack Query only | Server state only; no complex client state needed |
| API client | Centralized lib/api.ts | Single source of truth for API calls, auth headers, error handling |
| Caching | Redis for API responses | Already available via @fastify/redis; replaces in-memory Map cache |

---

**Confidence Level:** HIGH (85%) — This architecture builds on proven patterns for sports analytics dashboards and leverages the existing codebase structure rather than fighting it.

---

*Last Updated: 2026-02-19*
