# ESPN Fantasy Baseball Command Center

## What This Is

A public web app where fantasy baseball managers sign up, connect their ESPN league, and get a full command center for managing their team — projected standings, team health analysis, daily action items (waiver grabs, trade proposals, lineup suggestions), draft rankings, and category trend analysis. Powered by FanGraphs RoS projections and component-based stat math.

## Core Value

Give fantasy baseball managers an information edge that saves time and leads to better decisions — see things other managers don't, act faster, finish higher.

## Requirements

### Validated

- ✓ ESPN league connection with SWID/espn_s2 auth (encrypted at rest) — v1.0
- ✓ Daily snapshot pipeline with retry/backoff, rate limiting, job dedup — v1.0
- ✓ FanGraphs CSV projection upload with player identity fuzzy matching — v1.0
- ✓ Projected final standings using component-based rate stat math — v1.0
- ✓ Waiver add/drop recommendations using real ESPN free agent pool — v1.0
- ✓ Trade impact analysis and 1-for-1 candidate generation with accurate deltas — v1.0
- ✓ Time series data with transaction timeline annotations — v1.0
- ✓ JWT auth with email/password, HttpOnly cookies, refresh token rotation — v1.0
- ✓ OAuth stubs for Google and GitHub — v1.0
- ✓ Guided 4-step onboarding wizard for new users — v1.0
- ✓ Team dashboard with health overview, scarcity badges, category mini-charts — v1.0
- ✓ Recharts trend visualizations (not tables) for standings over time — v1.0
- ✓ Daily action items with ESPN deep links — v1.0
- ✓ Lineup optimizer with greedy slot-filling algorithm — v1.0
- ✓ Streaming pitcher suggestions via MLB StatsAPI matchup analysis — v1.0
- ✓ Draft rankings with VBD/SGP positional scarcity analysis — v1.0
- ✓ Auction valuations based on projected stats and budget constraints — v1.0
- ✓ Shared component library (ui/ + league/ two-tier structure) — v1.0
- ✓ Centralized API client with environment-based URLs — v1.0
- ✓ Multi-tenant auth with league membership verification on all routes — v1.0
- ✓ Admin dashboard with system health KPIs, user management, batch upload, league health — v1.0

### Active

- [ ] Position-organized shopping list replacing Top Targets in draft sidebar
- [ ] Combined priority scoring (scarcity + roster needs + budget fit) for position ordering
- [ ] Per-position top N targets with max bid and expected market price
- [ ] Dynamic adjustment as players are drafted

### Deferred

- [ ] Mastra AI agent with tools for draft engine signals, player data, and league state
- [ ] Agent memory for draft session context (remembers earlier advice, strategy evolution)
- [ ] Streaming agent responses in extension sidebar
- [ ] Multi-player trade evaluation (user proposes N-for-N trades, sees projected standings impact)
- [ ] Season replay (week-by-week standings evolution from collected snapshots and backfilled data)
- [ ] Trade retrospectives (how past trades impacted standings based on actual outcomes)
- [ ] Historical data backfill from ESPN API (pull season data from before league connection)

## Current Milestone: v2.0 Position Shopping List

**Goal:** Replace the generic Top Targets section with a position-organized shopping list that shows the best available players at each unfilled position, with max bids and market prices, prioritized by a combined scarcity + roster needs + budget fit score

**Target features:**
- Position-by-position target recommendations replacing Top Targets in sidebar
- Combined priority scoring blending scarcity urgency, empty roster slots, and budget constraints
- Top N available players per position with max bid (binary search) and expected market price (opponent model)
- Dynamic updates as draft progresses — positions re-prioritize as roster fills and pool shrinks

### Out of Scope

- AI/LLM agent integration — deferred to v2.1 (research complete in .planning/research/)
- Web app changes — extension sidebar only
- New data sources — uses existing FanGraphs projections and engine signals
- Snake draft support — auction only for now

## Context

Shipped v1.0 with 24,177 lines of TypeScript across a monorepo (Turbo + pnpm). Backend: Fastify 4, Kysely (PostgreSQL), BullMQ (Redis). Frontend: Next.js 14 (App Router), TanStack Query v5, Tailwind CSS, Recharts. Shared package: types, component-based stat formulas (AVG, OBP, SLG, OPS, ERA, WHIP), VBD/SGP draft math.

7 backend agents: ESPNAdapter, ProjectionsIngestAgent, PlayerIdentityResolutionAgent, StandingsProjectionAgent, WaiverRecommendationAgent, TradeRecommendationAgent, SnapshotOrchestratorAgent. Plus: DraftRankingsAgent, AuctionValuationAgent, LineupOptimizerAgent, StreamingPitcherAgent. Admin API with user management, system stats, league health, and batch upload.

Chrome extension (WXT + React) with deterministic draft engine: inflation tracking, enhanced scarcity, category gap analysis, budget curves, build archetype detection, projected standings, roster optimization (SGP-based max bid, Monte Carlo simulation, opponent modeling). Current AI layer: stateless narrator (Phase 22-24) calling GPT with engine signals as prompt context — no tools, no memory, no reasoning chain.

ESPN Fantasy API is read-only and undocumented. Auth uses SWID + espn_s2 cookies (encrypted at rest with AES-256-GCM). MLB StatsAPI (free, no auth) used for game schedules and probable pitchers.

## Constraints

- **Tech stack**: Monorepo (Turbo + pnpm), Fastify backend, Next.js frontend, PostgreSQL, Redis
- **ESPN API**: Read-only, undocumented, cookie-based auth — retry with exponential backoff
- **Projections**: FanGraphs CSV upload (manual) — ToS prevents automated fetching
- **Rate stats**: Must use component math from `packages/shared/src/formulas.ts` — never average rates
- **Multi-tenant**: All data scoped per user/league, JWT auth with league membership verification
- **Roto only**: Category-based roto leagues for v1 — points/H2H are different paradigms

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Recommendations only, no ESPN write actions | ESPN has no official write API; reverse-engineering is fragile | ✓ Good — deep links to ESPN.com work well |
| Deep links to ESPN.com for user action | Low complexity, reliable, good UX | ✓ Good |
| Current-season history first, backfill later | Nail current experience before investing in historical data | ✓ Good — v1 ships without backfill |
| Build on existing stack (Fastify + Next.js) | Large working codebase, no reason to rewrite | ✓ Good — saved significant time |
| Roto category leagues only for v1 | Simplifies scoring model; points/H2H are different paradigms | ✓ Good — focused scope |
| AES-256-GCM for ESPN cookie encryption | Industry standard, graceful degradation without ENCRYPTION_KEY | ✓ Good |
| Component-based rate stat math (never average rates) | Mathematically correct projections | ✓ Good — fixed broken trade simulations |
| VBD with population std dev for SGP | Complete player pool, not sample | ✓ Good |
| MLB StatsAPI for schedules (free, no auth) | Reliable, well-documented, no cost | ✓ Good |
| Manual FanGraphs CSV upload only | ToS compliance — no automated scraping | ✓ Good — batch upload UX acceptable |
| Two-tier component structure (ui/ + league/) | Generic primitives vs domain-specific separation | ✓ Good |
| HttpOnly cookies for JWT (not localStorage) | XSS protection, automatic inclusion | ✓ Good |
| Mastra over raw OpenAI SDK | Typed tools, memory, streaming, model-agnostic — proper agent framework vs ad-hoc prompts | — Pending |
| Agent on backend (not extension) | Extension can't hold long-lived agent state; backend can persist memory, manage API keys | — Pending |

---
*Last updated: 2026-03-05 after v2.0 milestone start*
