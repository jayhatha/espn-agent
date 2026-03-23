# Project Research Summary

**Project:** ESPN Fantasy Baseball Assistant — In-Season Command Center (v6.0)
**Domain:** In-season rotisserie fantasy baseball analytics
**Researched:** 2026-03-23
**Confidence:** HIGH

## Executive Summary

The v6.0 milestone transforms an existing ESPN fantasy baseball app from a standings viewer into a decision-making command center for in-season roto management. The backend computation foundation is already built: snapshot pipeline, StandingsProjectionAgent (component-based rate math), WaiverRecommendationAgent (with working simulateSwap), TradeRecommendationAgent, and TransactionImpactAgent. What's missing is a coherent decision layer on top — marginal gain calculations, category opportunity mapping, FAAB/GS pacing — and a UI shell (dark mode, left nav) that makes the data navigable. Net new production packages are minimal: 3 frontend additions (next-themes, @tanstack/react-table, @tanstack/react-virtual), 1 upgrade (recharts 2.x to 3.x), and zero new backend packages.

The recommended approach is to build in strict dependency order: pure shared utilities first (roto interpolation), then the marginal gain query layer that every category feature depends on, then parallel tracks for FAAB/GS pacing (which are independent of each other), then net waiver analysis that builds on marginal gain, and finally the N-for-M trade finder last (most computationally expensive, depends on the waiver delta model being correct). The frontend shell (dark mode, left nav layout) can be built in parallel with any backend work since it has no backend dependencies. The single highest-risk dependency is that the free agent pool is never fetched from ESPN — this is a known blocker for the category opportunity map (CLAUDE.md Known Issue #1).

The most critical pitfalls are: stale projections silently producing wrong roto points (add projection freshness timestamps immediately); rate stat denominator NaN/Infinity in waiver simulation when cross-type add/drop reduces IP to zero (add floor guards before shipping); FAAB balance derived from transactions being wrong vs. the correct ESPN mRoster view source; dark mode being shipped half-complete because Tailwind dark: variants require a full audit; and trade finder combinatorial explosion when 2-for-2 support is added without re-calibrating the simulation cap. All pitfalls have clear prevention strategies and are addressable before they become production incidents.

---

## Key Findings

### Recommended Stack

The existing Fastify + Next.js 14 + Kysely + TanStack Query v5 + Tailwind stack requires no backend additions. Three frontend packages are needed: `next-themes` for SSR-safe dark mode persistence (replaces the common FOUC-prone localStorage approach), `@tanstack/react-table` v8 for headless sortable tables (the trade scanner and roto tracker have too many rows and sort permutations for manual implementations), and `@tanstack/react-virtual` v3 for virtualized row rendering in the trade scanner (up to 7,200 candidate pairs for a 12-team league). Recharts should be upgraded from 2.x to 3.x — v3 fixes the infinite re-render and tooltip flicker bugs that are visible in the current trends page, and the breaking changes list has zero impact on this codebase. Sparklines in table rows should use an inline SVG polyline (10 lines, zero dependency) not an external library.

**Core technologies:**
- `next-themes@^0.4.6`: Dark mode toggle with SSR-safe localStorage persistence — required to avoid hydration flash in Next.js App Router
- `@tanstack/react-table@^8.21.3`: Headless sortable/filterable tables — 5.3M weekly downloads, integrates with Tailwind dark: classes natively
- `@tanstack/react-virtual@^3.13.23`: Row virtualization for trade scanner — designed to compose with TanStack Table, no conflicts with sticky headers
- `recharts@^3.8.0`: Upgrade from 2.x fixes known bugs in multi-series charts; breaking changes are zero-impact on this codebase
- `JetBrains_Mono` via `next/font/google`: Numeric monospace font — wires to existing `--font-mono` CSS variable already in tailwind.config.js, zero npm install needed

### Expected Features

The feature set is organized around two key insights: (1) the waiver roto-delta fix is a prerequisite for multiple higher-value features, and (2) "gap to +1 roto point per category" is the mathematical foundation that every category decision feature builds on.

**Must have (table stakes — P1):**
- Gap to +1 roto point per category — core decision framework; without this the app doesn't answer "what should I do?"
- Waiver roto-point delta fix (net of drop) — the current hardcoded 0.5 deltaOverallPoints is a correctness bug that blocks other features
- Category opportunity map — synthesizes gap + FA availability into a prioritized action list
- FAAB budget tracker with spending history — data exists in league_transaction_event; low effort, high daily utility
- GS/K pacing with SP start planner — direct answer to a weekly question; builds on existing StreamingPitcherAgent

**Should have (competitive — P2):**
- Trade finder with roto-point optimization — requires waiver delta fix to be trusted first
- 7-day hot/cold player trends — table stakes by industry standards; defer until player_period_stats feeding is confirmed stable
- FAAB ROI scoring per acquisition — TransactionImpactAgent already built; wire it to bid amounts
- Suggested FAAB bid — personalizes bid value to your specific standings position

**Defer (v2+):**
- Standings points at risk summary — requires injury + schedule + projection adjustment in combination; highest integration complexity
- Lineup efficiency / bench production tracking — requires snapshot schema extension; not urgent

### Architecture Approach

No new agent classes are needed from scratch except GsPaceAgent (which needs MLB Stats API, a different data source from the existing projection/snapshot flow). All other features extend existing agents: getMarginalGains() lives on StandingsProjectionAgent (it reads what that agent already writes), WaiverRecommendationAgent gets an optional targetCategories parameter and marginal gain cross-reference, and TradeRecommendationAgent gets a generateMultiPlayerCandidates() method. The frontend gets a new league-level layout.tsx that all existing /leagues/[id]/* sub-pages inherit automatically. The key architectural constraint is that all computation goes through the Fastify API — no direct DB access from Next.js Server Components, because rate stat formulas and degraded state handling live in the agents.

**Major components:**
1. `interpolateRotoPoints()` in `packages/shared/src/formulas.ts` — pure function, zero DB access, no dependencies; builds first
2. `StandingsProjectionAgent.getMarginalGains()` — new method reading team_daily_projected_category with a self-join; unlocks all category features
3. `GsPaceAgent` — the only truly new agent class; uses the existing MLBStatsAPIAdapter already used by StreamingPitcherAgent
4. `LeagueShell` + `LeagueNav` at `packages/frontend/src/app/leagues/[id]/layout.tsx` — all sub-pages inherit left nav automatically via Next.js layout nesting
5. `ThemeProvider` (next-themes) + Tailwind `darkMode: 'class'` — dark mode infrastructure; must audit all color utilities before exposing toggle to users

### Critical Pitfalls

1. **Stale projections silently corrupt roto interpolation** — `league_daily_snapshot.is_degraded` can be false while `projections_run.created_at` is days old. Projected roto points are only valid relative to all 13 teams being on the same projection run. Prevention: display "Projections as of [date]" badge prominently on dashboard; gate marginal gain features on freshness check before shipping.

2. **Rate stat denominator goes to zero in cross-type add/drop** — Dropping a pitcher while adding a hitter reduces IP in projected_components_json; if remaining IP approaches zero, ERA/WHIP becomes Infinity or NaN, corrupting all downstream ranking. Prevention: add `IP > 0` and `AB > 0` floor guards in simulateSwap() before shipping net waiver analysis; write the unit test "drop SP, add OF, verify ERA impact is finite."

3. **FAAB balance from the wrong ESPN endpoint** — The standard mTeam view does not include FAAB remaining; it's in the mRoster view (`?view=mRoster`). Deriving from transaction sums is wrong when bids are voided or budgets are adjusted mid-season. Prevention: verify the mRoster view fields before writing any FAAB storage logic; never derive from transactions.

4. **Dark mode shipped half-complete** — Zero dark: utility classes exist in the codebase. Adding `darkMode: 'class'` to Tailwind config does nothing without per-component dark variants. Prevention: inventory all color utilities first (grep all bg-/text-/border- classes), build a design token layer, apply dark: variants systematically; do not expose the toggle until all pages are covered.

5. **Trade finder 2-for-2 combinatorial explosion** — The existing `maxSimulations = 500` cap is calibrated for 1-for-1 only (not labeled as such). A 15-player roster doing 2-for-2 against 12 partners produces 2,700 pairs before any simulation runs. Prevention: label the cap explicitly as "1-for-1 calibrated" in code; require a separate reduced cap and endpoint-level Redis caching before enabling 2-for-2.

---

## Implications for Roadmap

### Phase 1: Foundation + Dark Mode Shell
**Rationale:** The frontend shell (dark mode, left nav) and the roto interpolation pure function have zero dependencies on each other or on new backend work. Building them first establishes the UI shell that every subsequent feature populates, and validates the core math before adding DB integration. Dark mode is infrastructure — completing it before any feature page ships avoids the half-dark UI pitfall.
**Delivers:** Fully dark command center shell with left sidebar nav; JetBrains Mono wired to --font-mono; roto interpolation pure function in shared/formulas.ts with tests
**Addresses:** Dark mode theming, Linear-style left nav layout, interpolateRotoPoints() utility
**Avoids:** Pitfall 6 (dark mode half-migration) — complete the color utility audit and design token layer in this phase before building any feature pages into the shell

### Phase 2: Marginal Gain Calculator + Category Gap API
**Rationale:** getMarginalGains() is the mathematical foundation that the category opportunity map, suggested FAAB bids, and smart waiver filtering all depend on. It reads pre-computed data from team_daily_projected_category (no new writes, no schema changes), making it low-risk to build and test. This phase produces a testable API endpoint that downstream phases depend on directly.
**Delivers:** `GET /api/leagues/:id/teams/:teamId/marginal-gains` endpoint; priority list UI on the dashboard showing category gaps with current projected rank per category
**Addresses:** Gap to +1 roto point per category (P1 must-have)
**Avoids:** Pitfall 3 (marginal gain misleading at extremes) — always show current projected rank alongside gap estimate; flag categories where team is already ranked 1st or is too far behind

### Phase 3: Net Waiver Analysis (Roto-Delta Fix)
**Rationale:** The current hardcoded deltaOverallPoints = 0.5 is a correctness bug that makes every waiver recommendation unreliable. This is a blocking issue for FAAB bid suggestions, the category opportunity map, and the trade finder. Fix it before building anything that depends on it. The drop side of the waiver equation is currently ignored entirely.
**Delivers:** Accurate net roto-point delta for add/drop (including the drop side); category-targeted waiver filtering using marginal gain cross-reference; waiver UI updated with category impact breakdown
**Addresses:** Waiver roto-point delta fix (P1 must-have); unblocks trade finder and suggested FAAB bid
**Avoids:** Pitfall 2 (denominator floor) — write the unit test "drop SP, add OF, verify ERA impact is finite and bounded" before shipping; add IP > 0 and AB > 0 guards

### Phase 4: FAAB Tracking + GS/K Pacing (Parallel Tracks)
**Rationale:** These two features are independent of each other and independent of the waiver delta fix. They can be built in parallel. FAAB tracking must use the ESPN mRoster view for the balance (not derived from transactions), which needs verification first. GS pacing requires a new GsPaceAgent using the existing MLBStatsAPIAdapter.
**Delivers:** `GET /api/leagues/:id/faab` endpoint; FAAB budget tracker UI with spending history per team; `GET /api/leagues/:id/teams/:teamId/pace` endpoint; GS/K pacing table with weekly cap progress per pitcher
**Addresses:** FAAB budget tracker (P1 must-have); GS/K pacing with SP start planner (P1 must-have)
**Avoids:** Pitfall 4 (FAAB from wrong endpoint) — verify mRoster view field names against live ESPN API before writing storage logic; Pitfall 5 (GS not in schema) — derive from team_roster_snapshot.slot = 'SP' at snapshot time, store computed weekly GS count, do not compute on read

### Phase 5: Category Opportunity Map
**Rationale:** Depends on Phases 2 and 3 being stable (marginal gain query layer + accurate waiver delta). This is the highest-value P1 feature but has the most dependencies. It also hits the critical blocker: the free agent pool is never fetched from ESPN (CLAUDE.md Known Issue #1). This phase must fix that blocker or implement graceful degradation when FA data is unavailable.
**Delivers:** Category opportunity map dashboard widget: priority-ranked list of categories to target, with gap size, difficulty score, and available FA contribution per category; free agent pool fetch from ESPN implemented
**Addresses:** Category opportunity map (P1 must-have); free agent pool fetch fix (Known Issue #1)
**Avoids:** Pitfall 9 (dashboard performance) — pre-compute category opportunity analysis at snapshot time; do not trigger live waiver simulation on page load; use TanStack Query staleTime of 15 minutes on recommendation endpoints

### Phase 6: Trade Finder with Roto-Point Optimization
**Rationale:** Comes last because it's computationally expensive, depends on the waiver delta model being reliable (Phase 3), and rate stat adjustments in TradeRecommendationAgent must be correct before trade impact is meaningful. Start with 1-for-1 optimized for roto-point framing, then add 2-for-2 behind a feature flag with a separate reduced simulation cap and endpoint caching.
**Delivers:** Trade finder UI with roto-point delta framing ("fix ERA without costing HR points"); 1-for-1 candidates ranked by standings gap improvement; 2-for-2 candidates behind feature flag; endpoint-level caching
**Addresses:** Trade finder with roto-point optimization (P2 should-have)
**Avoids:** Pitfall 7 (combinatorial explosion) — label maxSimulations = 500 as "1-for-1 calibrated" in code; add Redis cache before enabling 2-for-2; pre-load all projections into memory before the combinatorial loop (not DB queries in the inner loop)

### Phase 7: P2 Features (Hot/Cold Trends, FAAB ROI, Suggested FAAB Bid)
**Rationale:** These features require the gap and delta model from earlier phases to be trusted in production for several weeks before building on top. Hot/cold trends need the ESPN period stats feeding mechanism confirmed stable. FAAB ROI needs TransactionImpactAgent wired to bid amounts from the transaction table. Suggested FAAB bid requires both the gap calculator and the delta model validated.
**Delivers:** 7-day hot/cold player trend indicators in the waiver UI; FAAB ROI scoring per acquisition in budget history view; suggested FAAB bid personalized to the team's current standings gap
**Addresses:** All P2 should-have features

### Phase Ordering Rationale

- Phases 1 and 2 have zero external dependencies and establish foundations; Phase 1 is purely frontend infrastructure, Phase 2 is purely a new read query on existing data
- Phase 3 (waiver delta fix) is a blocking correctness issue that must ship before FAAB bid, category map, or trade finder produce reliable output
- Phase 4 (FAAB + GS) runs in parallel because these are independent data-fetch features that share no dependencies with the waiver delta work
- Phase 5 (category map) cannot ship without Phase 2 (marginal gain) and Phase 3 (waiver delta) both being stable
- Phase 6 (trade finder) comes last — highest compute cost, deepest dependency chain, requires the delta model to be production-validated
- Phase 7 requires production use of Phases 2 and 3 to validate the decision framework before building personalized bid suggestions on top

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (FAAB):** The correct ESPN API view for FAAB remaining balance (mRoster vs mTeamId) is MEDIUM confidence — needs verification against live ESPN API response before writing any storage logic
- **Phase 4 (GS Pacing):** The exact MLB Stats API endpoint for season GS totals per pitcher needs verification via MLBStatsAPIAdapter; StreamingPitcherAgent uses a subset of the API for weekly probable starters only
- **Phase 5 (Category Map):** Free agent pool fetch from ESPN is an unresolved known issue; the ESPN API endpoint and authentication pattern for free agents needs research before this phase begins
- **Phase 7 (Hot/Cold):** ESPN period stats endpoint for rolling 7-day windows needs verification; player_period_stats table exists in schema but ESPN feeding is unconfirmed

Phases with standard patterns (skip research-phase):
- **Phase 1 (Dark Mode + Shell):** Tailwind class dark mode + next-themes is a well-documented established pattern; STACK.md provides complete implementation detail including exact config changes
- **Phase 2 (Marginal Gain):** Pure DB read query on a pre-existing indexed table; self-join pattern is standard SQL; no novel integration
- **Phase 3 (Waiver Delta Fix):** Extension to existing simulateSwap() with known code paths; PITFALLS.md identifies the exact lines to change; no new architecture
- **Phase 6 (Trade Finder):** Extending existing TradeRecommendationAgent; combinatorial pattern is documented in ARCHITECTURE.md with the in-memory preload solution already specified

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified against npm registry; version compatibility confirmed; recharts 3.x breaking changes confirmed zero-impact on this codebase |
| Features | HIGH for categorization, MEDIUM for complexity | Ecosystem and competitor landscape well-understood; complexity estimates are codebase-specific inferences based on code inspection |
| Architecture | HIGH for existing system, MEDIUM for ESPN API fields | Existing agents read directly from first-party codebase with line-level citations; ESPN API field names (acquisitionBudgetRemaining, mRoster view) are MEDIUM confidence — need live verification |
| Pitfalls | HIGH | All 9 pitfalls derived from first-party codebase inspection with specific file and line references; no speculative inference |

**Overall confidence:** HIGH

### Gaps to Address

- **ESPN mRoster view field name for FAAB:** `acquisitionBudgetRemaining` is inferred from known ESPN API structure and the `waiverBudgetSpent` reference in espn.ts line 1185; verify against a live API response before writing storage logic in Phase 4
- **ESPN free agent pool endpoint:** Known blocker (CLAUDE.md Known Issue #1); research the correct ESPN API call for available free agents before Phase 5 begins; the waiver agent notes "free agent pool defaults to empty"
- **ESPN period stats endpoint for 7-day rolling windows:** Required for hot/cold trends (Phase 7); player_period_stats table exists in schema but the ESPN feeding mechanism is unconfirmed
- **GS cap storage in league_settings_version:** Settings JSONB stores acquisition_rules but the GS cap field name/format from ESPN is unverified; check what ESPN exposes before GS pacing is built in Phase 4
- **FAAB bid amounts in raw_event_json:** The ESPNTransaction.bidAmount field is present in the adapter; verify that transaction ingestion is consistently populating this field before FAAB ROI is built in Phase 7

---

## Sources

### Primary (HIGH confidence)
- `packages/backend/src/agents/standings-projection.ts` — computeProjectedStandings, rankAndStore, calculateFinalRate paths
- `packages/backend/src/agents/waiver-recommendation.ts` — simulateSwap full implementation, rate stat recalculation, cross-type add/drop paths
- `packages/backend/src/agents/trade-recommendation.ts` — generateCandidates, maxSimulations = 500 cap, topPairsForTeam pruning, getPlayerValue zero-fallback
- `packages/backend/src/adapters/espn.ts` — normalizeLeagueData, ESPNTransaction.bidAmount, acquisitionSettings fields at lines 1184–1186
- `packages/backend/src/db/schema.ts` — 24 table interfaces; absence of GS/FAAB columns confirmed
- `packages/shared/src/formulas.ts` — calculateWHIP, calculateFinalRate, combineComponents
- `packages/shared/src/types.ts` — LeagueSettings.acquisition_rules shape
- [next-themes npm registry](https://www.npmjs.com/package/next-themes) — version 0.4.6 confirmed, last published ~1 year ago
- [recharts 3.0 migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide) — breaking changes list verified against codebase usage
- [@tanstack/react-table npm registry](https://www.npmjs.com/package/@tanstack/react-table) — version 8.21.3, 5.3M weekly downloads
- [@tanstack/react-virtual npm registry](https://www.npmjs.com/package/@tanstack/react-virtual) — version 3.13.23, last published 7 days ago
- [Tailwind CSS Dark Mode docs](https://tailwindcss.com/docs/dark-mode) — class strategy configuration
- [TanStack Table v8 docs](https://tanstack.com/table/v8) — headless API, sorting and filtering patterns
- [Next.js Font Optimization docs](https://nextjs.org/docs/14/app/building-your-application/optimizing/fonts) — next/font/google variable font usage

### Secondary (MEDIUM confidence)
- [shadcn/ui Dark Mode — Next.js guide](https://ui.shadcn.com/docs/dark-mode/next) — ThemeProvider "use client" wrapper pattern
- ESPN API mRoster view field names — inferred from known API structure and waiverBudgetSpent reference in espn.ts line 1185; needs live verification
- Smart Fantasy Baseball SGP methodology — feature framing for gap-to-next-rank as the core roto decision unit
- FanGraphs Rotographs — in-season roto management patterns, competitor tool feature sets
- FantasyPros League Analyzer — competitor feature comparison for category gap and waiver analysis

### Tertiary (LOW confidence)
- [Inter + JetBrains Mono pairing score](https://fontalternatives.com/pairings/inter-and-jetbrains-mono/) — 88/100 pairing rating (subjective marketing source, not load-bearing for implementation)

---
*Research completed: 2026-03-23*
*Ready for roadmap: yes*
