# Phase 98: Application Composition Module — Context

**Gathered:** 2026-05-15
**Status:** Ready
**Milestone:** v10.0 Architecture Improvements

<domain>
## Phase Boundary

Extract a central `container.ts` Fastify plugin that owns:

- Process-scope singletons: `ESPNAdapter`, `PitcherlistAdapter`, `AdvancedStatsAdapter`
- Request-scope factory functions for all agents

Eliminates the current pattern where route handlers call `new ESPNAdapter(request.log)` and `new TradeRecommendationAgent(db, request.log)` on every request.

## Evidence (from architectural analysis)

- `new ESPNAdapter(request.log)` appears in: `draft.ts` (L487, L745, L1095), `leagues.ts` (L94, L836), `recommendations.ts` (L27)
- `new TradeRecommendationAgent(db, request.log)` appears at lines 647, 700 in recommendations.ts
- `new FaabTrackerAgent(db, request.log)` appears 3x in faab.ts (L29, L53, L78)
- `new DraftRankingsAgent(db, request.log)` appears 7x in draft.ts
- `new GsPacingAgent(db, request.log)` appears 4x in pitching-usage.ts
- `new TransactionImpactAgent(db, request.log)` appears 3x in transaction-impact.ts
  </domain>

<decisions>
## Implementation Strategy

1. Create `packages/backend/src/container.ts` as a Fastify plugin using `fp()` (fastify-plugin)
2. Decorate `fastify` with `fastify.container` exposing: `adapters` (singletons) + `agents` (factory fns)
3. Update each route file to use `fastify.container.adapters.espn` instead of `new ESPNAdapter(...)`
4. Factory fns accept `(db, log)` and return new agent instances — request scope preserved

## Files to Modify

- `packages/backend/src/container.ts` — NEW
- `packages/backend/src/index.ts` — register plugin
- `packages/backend/src/api/recommendations.ts` — use container
- `packages/backend/src/api/draft.ts` — use container
- `packages/backend/src/api/leagues.ts` — use container
- `packages/backend/src/api/faab.ts` — use container
- `packages/backend/src/api/pitching-usage.ts` — use container
- `packages/backend/src/api/transaction-impact.ts` — use container
  </decisions>
