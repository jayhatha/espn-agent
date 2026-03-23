# Milestones

## v1.0 MVP (Shipped: 2026-02-21)

**Phases completed:** 5 phases, 18 plans
**Timeline:** 3 days (2026-02-19 to 2026-02-21)
**Requirements:** 29/29 complete
**Codebase:** 24,177 lines TypeScript, 109 files changed

**Key accomplishments:**
- Secured ESPN cookie storage with AES-256-GCM encryption and enforced JWT auth with league ownership on all routes
- Built authentication system with email/password, HttpOnly cookie tokens, refresh rotation, and guided 4-step onboarding wizard
- Created team dashboard with health overview, Recharts category trend charts, scarcity badges, and daily action items with ESPN deep links
- Implemented waiver recommendations using real free agent pool and 1-for-1 trade candidates with component-math impact analysis
- Built draft assistant with VBD/SGP rankings, auction valuations, lineup optimizer, and streaming pitcher suggestions via MLB StatsAPI
- Added admin dashboard with system health KPIs, user management with role toggle, batch projections upload, and league health monitoring

---


## v2.0 Position Shopping List (Shipped: 2026-03-14)

**Phases completed:** 35 phases, 108 plans
**Timeline:** 18 days (2026-02-24 to 2026-03-13)
**Scope:** Phases 6-38 (v1.1 through v2.0 — trades, history, draft engine, redesign, shopping list, audits)

**Key accomplishments:**
- Built Chrome extension with deterministic draft engine: inflation tracking, positional scarcity, category gap analysis, budget curves, build archetype detection, and Monte Carlo roster optimization
- Position-organized shopping list with combined priority scoring (scarcity + roster needs + budget fit) and per-position top N targets with max bids
- Full-season projected standings engine for all teams during live auction drafts
- AI narrator layer interpreting engine signals with tactical commentary via OpenAI
- Forward-looking draft simulation with win probability and trap nomination strategy
- Mobile draft companion page via WebSocket for phone-based draft monitoring
- Site redesign with typography-driven editorial composition design system
- Performance audit fixing N+1 queries, DOM observer bottlenecks, and infrastructure config
- Code quality audit addressing correctness bugs, error boundaries, and type safety
- UX audit with BidVerdict cards, hierarchical navigation, tooltip glossary, and waiver grouping

---


## v3.0 Draft Automation & Mobile Command Center (Shipped: 2026-03-14)

**Phases completed:** 4 phases, 12 plans
**Scope:** Phases 39-42

**Key accomplishments:**
- Chrome DevTools MCP for live ESPN DOM selector verification
- Auto-nomination reworked with MCP-verified selectors (15+ broken selectors fixed)
- Mobile command center with full draft controls, engine signals, tabbed layout
- Phase-aware nomination queue strategy (poison pills early, own targets late)

---


## v4.0 Personal Season Setup (Shipped: 2026-03-15)

**Phases completed:** 4 phases, 4 plans
**Scope:** Phases 43-46

**Key accomplishments:**
- Stripped auth for single-user mode (middleware no-ops, mock admin user)
- Hardcoded league 112523 settings with OPS categories in shared config
- Fixed draft extension detection with config-first pattern and dropdown column mapping
- Added league bootstrap endpoint and env var ESPN credentials

---


## v5.0 Draft Engine Spec Alignment (Shipped: 2026-03-23)

**Phases completed:** 16 phases (48-64), ~35 plans
**Scope:** Phases 48-64 (Phases 47, 51 dropped)
**Timeline:** 8 days (2026-03-15 to 2026-03-23)

**Key accomplishments:**
- Priority-scored auction engine with EV-based scoring, category scarcity weights, team need tracking, surplus pool, replacement cliff detection, player tags
- Dynamic SGP recalculation during draft (recompute values as pool shrinks)
- SP tier caps, RP composition targeting (7SP+5RP), rank-based tier pricing
- Positional need multiplier suppressing bids on filled positions
- Inflation bands with bid ceiling adjustments
- Dynamic budget allocation with surplus multiplier (1.0-1.5x), $1/slot reserve, unconditional endgame flush
- Comprehensive test suite: unit, simulation, scenario tests for auction engine
- Extension sidebar UI: Grafana dark theme, signal strip, category heatmap, position supply, next nominee
- Mobile draft companion with manual bid/nominate controls
- Overpriced-first nomination strategy to drain opponent budgets

**Dropped:**
- Phase 47 (Endgame Mode) — superseded by priority scoring engine
- Phase 51 (Data Pipeline) — CSV upload sufficient for season

---

