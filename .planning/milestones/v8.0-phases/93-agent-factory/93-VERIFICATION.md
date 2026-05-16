# Phase 93: AgentFactory Centralization — Verification

## Success Criteria

1. ✅ `agent-factory.ts` exports: `createSnapshotOrchestrator`, `createWaiverAgent`, `createTradeAgent`, `createStandingsAgent`, `createProjectionsIngestAgent`
2. ✅ All route handlers in `api/` use factory — no `new WaiverRecommendationAgent/TradeRecommendationAgent/StandingsProjectionAgent` remain
3. ✅ All worker files use factory — no `new SnapshotOrchestratorAgent` remain in `workers/`
4. ✅ Adding a new agent dep requires editing only `agent-factory.ts`
5. ✅ `npx tsc --noEmit` → 0 errors

## Files Changed

- `packages/backend/src/agents/agent-factory.ts` — NEW: 5 factory functions
- `packages/backend/src/api/recommendations.ts` — replaced 2x waiver + 2x trade construction
- `packages/backend/src/api/leagues.ts` — replaced 2x snapshot orchestrator construction
- `packages/backend/src/api/projections.ts` — replaced 1x orchestrator + 2x ingest agent construction; removed dead dynamic import
- `packages/backend/src/workers/snapshot-worker.ts` — replaced 1x orchestrator construction
