---
phase: 108
slug: scenario-driven-trade-and-waiver-evaluation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-17
---

# Phase 108 Validation

- Framework: Vitest 1.1.1 in `packages/backend`
- Config: `packages/backend/vitest.config.ts`
- Quick run: `pnpm --filter @espn-fantasy/backend exec vitest run src/simulation/__tests__/state-builder.test.ts src/simulation/__tests__/scenario-evaluator.test.ts src/api/__tests__/recommendations.test.ts src/agents/__tests__/trade-recommendation.test.ts src/agents/__tests__/waiver-recommendation.test.ts src/utils/__tests__/validation.test.ts`
- Full run: `pnpm --filter @espn-fantasy/backend exec vitest run && pnpm --filter @espn-fantasy/backend typecheck`
- Sampling: run focused task verify after every substantive task edit
- Sampling: run wave verify after each plan summary boundary
- Sampling: run full suite before `/gsd-execute-phase 108` handoff closes
- Feedback latency target: under 30 seconds for focused task checks
- Task 108-01-01: requirements `SCEN-03`, `SCEN-05`, `SCEN-06`; command `pnpm --filter @espn-fantasy/backend exec vitest run src/simulation/__tests__/state-builder.test.ts src/simulation/__tests__/scenario-evaluator.test.ts`
- Task 108-01-02: requirements `SCEN-05`, `SCEN-06`; command `pnpm --filter @espn-fantasy/backend exec vitest run src/simulation/__tests__/state-builder.test.ts src/projection/__tests__/allocator.test.ts`
- Task 108-01-03: requirements `SCEN-01`, `SCEN-02`, `SCEN-03`, `SCEN-06`; command `pnpm --filter @espn-fantasy/backend exec vitest run src/simulation/__tests__/scenario-evaluator.test.ts src/simulation/__tests__/state-builder.test.ts src/projection/__tests__/allocator.test.ts && pnpm --filter @espn-fantasy/backend typecheck`
- Task 108-02-01: requirements `SCEN-02`, `SCEN-03`, `SCEN-06`; command `pnpm --filter @espn-fantasy/backend exec vitest run src/api/__tests__/recommendations.test.ts src/agents/__tests__/trade-recommendation.test.ts src/agents/__tests__/waiver-recommendation.test.ts src/utils/__tests__/validation.test.ts`
- Task 108-02-02: requirements `SCEN-01`, `SCEN-02`, `SCEN-03`, `SCEN-04`, `SCEN-06`; command `pnpm --filter @espn-fantasy/backend exec vitest run src/agents/__tests__/trade-recommendation.test.ts src/agents/__tests__/waiver-recommendation.test.ts && pnpm --filter @espn-fantasy/backend typecheck`
- Task 108-02-03: requirements `SCEN-01`, `SCEN-03`, `SCEN-04`, `SCEN-06`; command `pnpm --filter @espn-fantasy/backend exec vitest run src/api/__tests__/recommendations.test.ts src/utils/__tests__/validation.test.ts src/agents/__tests__/trade-recommendation.test.ts src/agents/__tests__/waiver-recommendation.test.ts && pnpm --filter @espn-fantasy/backend typecheck`
- Wave 0 planned file: `packages/backend/src/simulation/__tests__/scenario-evaluator.test.ts`
- Wave 0 planned file: `packages/backend/src/simulation/__tests__/state-builder.test.ts`
- Wave 0 planned file: `packages/backend/src/agents/__tests__/waiver-recommendation.test.ts`
- Wave 0 planned file: `packages/backend/src/api/__tests__/recommendations.test.ts`
- Nyquist check: every task has explicit automated verify
- Nyquist check: no watch-mode flags present
- Nyquist check: no `<automated>MISSING</automated>` placeholders present
- Nyquist check: no wave has three consecutive implementation tasks without automated verification
- Manual-only verification: none required for phase gate
- Approval: ready
