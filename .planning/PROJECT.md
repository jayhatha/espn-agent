# ESPN Fantasy Baseball Command Center

## What This Is

A web app and Chrome extension for fantasy baseball managers. The web app connects to ESPN leagues and provides projected standings, team health analysis, daily action items, waiver/trade recommendations, and category trend charts. The Chrome extension overlays ESPN's live auction draft page with a deterministic draft engine (inflation tracking, positional scarcity, category gap analysis, budget curves, roster optimization, projected standings, win probability) and an AI narrator for tactical commentary. Powered by FanGraphs RoS projections and component-based stat math.

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
- ✓ Team dashboard with health overview, scarcity badges, category mini-charts — v1.0
- ✓ Draft rankings with VBD/SGP positional scarcity analysis — v1.0
- ✓ Auction valuations based on projected stats and budget constraints — v1.0
- ✓ Admin dashboard with system health KPIs, user management, batch upload — v1.0
- ✓ Multi-player trade evaluation (N-for-M) with component math — v1.1
- ✓ Historical backfill from ESPN API with rate limiting and dedup — v1.1
- ✓ Season timeline with week-by-week standings and transaction annotations — v1.1
- ✓ Chrome extension with live auction draft overlay — v1.2
- ✓ Deterministic draft engine (inflation, scarcity, category gaps, budget curves) — v1.4
- ✓ Build archetype detection and pivot logic — v1.4
- ✓ AI narrator with tactical commentary via OpenAI — v1.4
- ✓ Monte Carlo roster optimization with SGP-based max bids — v1.4
- ✓ Projected standings for all teams during draft — v1.4
- ✓ Position-organized shopping list with priority scoring — v2.0
- ✓ Forward-looking draft simulation with win probability — v2.0
- ✓ Mobile draft companion page via WebSocket — v2.0
- ✓ Typography-driven editorial site redesign — v2.0
- ✓ Auto-nomination from ESPN queue — v2.0
- ✓ Category floor enforcement (no punt categories) — v2.0

### Active

#### Current Milestone: v3.0 Draft Automation & Mobile Command Center

**Goal:** Make auto-nomination reliable with verified ESPN selectors (via Chrome DevTools MCP) and rework the mobile draft companion into a full-control command center.

- [ ] Chrome DevTools MCP server setup for live ESPN DOM inspection
- [ ] Auto-nomination selector overhaul using verified ESPN DOM selectors
- [ ] Auto-nomination flow rework (search, queue, turn detection reliability)
- [ ] Mobile draft companion full redesign with all engine signals
- [ ] Mobile full draft control (queue management, bid limits, strategy anchors)
- [ ] Mobile responsive layout optimized for phone screens

### Deferred

- [ ] Mastra AI agent with tools for draft engine signals, player data, and league state
- [ ] Agent memory for draft session context
- [ ] Streaming agent responses in extension sidebar
- [ ] Trade retrospectives (actual vs projected outcomes)
- [ ] Interactive trade builder with live impact preview
- [ ] Snake draft support
- [ ] Points/H2H league support

## Context

Shipped v2.0 with ~30,000+ lines of TypeScript across a monorepo (Turbo + pnpm). Backend: Fastify 4, Kysely (PostgreSQL), BullMQ (Redis). Frontend: Next.js 14 (App Router), TanStack Query v5, Tailwind CSS, Recharts. Chrome extension: WXT + React. Shared package: types, component-based stat formulas, VBD/SGP draft math.

11 backend agents, 4 API route modules, Chrome extension with deterministic draft engine (6 models), AI narrator, mobile WebSocket companion. Editorial design system with DM Serif Display typography.

## Constraints

- **Tech stack**: Monorepo (Turbo + pnpm), Fastify backend, Next.js frontend, PostgreSQL, Redis
- **ESPN API**: Read-only, undocumented, cookie-based auth — retry with exponential backoff
- **Projections**: FanGraphs CSV upload (manual) — ToS prevents automated fetching
- **Rate stats**: Must use component math from `packages/shared/src/formulas.ts` — never average rates
- **Roto only**: Category-based roto leagues — points/H2H are different paradigms

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Recommendations only, no ESPN write actions | ESPN has no official write API | ✓ Good |
| Deep links to ESPN.com for user action | Low complexity, reliable | ✓ Good |
| Component-based rate stat math | Mathematically correct projections | ✓ Good |
| VBD with population std dev for SGP | Complete player pool, not sample | ✓ Good |
| Deterministic engine + AI narrator layering | Engine computes, AI interprets — separation of concerns | ✓ Good |
| Client-side draft engine (not server) | Low latency, works offline, no network dependency during draft | ✓ Good |
| Greedy roster optimization over ILP | Good enough results within 100ms budget | ✓ Good |
| Monte Carlo for bid uncertainty | Captures draft outcome variance | ✓ Good |
| WebSocket hub for mobile companion | Extension → Fastify → phone, works on LAN | ✓ Good |
| Mastra over raw OpenAI SDK | Typed tools, memory, streaming, model-agnostic | — Pending |
| Chrome DevTools MCP for selector discovery | Live DOM inspection beats guessing at ESPN selectors | — Pending |
| Keep mobile as Next.js route (not standalone) | Shares design system, components, proper build pipeline | — Pending |

---
*Last updated: 2026-03-14 after v3.0 milestone start*
