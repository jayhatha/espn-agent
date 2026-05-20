# Phase 108: Scenario-Driven Trade & Waiver Evaluation - Research

- **Researched:** 2026-05-16
- **Domain:** Snapshot-bound trade and waiver scenario evaluation on top of v11 simulation engine
- **Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Source for all bullets in this subsection: `108-CONTEXT.md`. [VERIFIED: .planning/phases/108-scenario-driven-trade-and-waiver-evaluation/108-CONTEXT.md]
- Reuse `SeasonSimulationAgent`, `buildSimulationState`, and `runMonteCarlo` as the scenario platform; do not build a second independent simulation branch
- Add deterministic scenario evaluation first; Monte Carlo is a bounded rerank or uncertainty layer for top scenarios, not the screening path for every candidate
- Trade evaluation must mutate both teams inside one league snapshot and return user delta plus partner delta
- Waiver and trade legality must come from allocator or gap-detection results, not position-overlap heuristics
- Scenario evaluation must be snapshot-bound: use `snapshotDate`, snapshot-scoped data, and known projection runs before falling back to latest raw payloads
- Keep current trade and waiver endpoints working; additive response fields are allowed, breaking removals are not

### Planner Discretion

- Source for all bullets in this subsection: `108-CONTEXT.md`. [VERIFIED: .planning/phases/108-scenario-driven-trade-and-waiver-evaluation/108-CONTEXT.md]
- Exact module placement for shared scenario mutation helpers
- Whether deterministic scenario evaluation lives inside the existing season-simulation agent or a dedicated evaluator module that wraps the simulation primitives
- Candidate screening thresholds and top-K Monte Carlo rerank limits
- Final fairness or likelihood mapping once bilateral trade deltas are available

### Deferred Ideas (OUT OF SCOPE)

- Source for all bullets in this subsection: `108-CONTEXT.md`. [VERIFIED: .planning/phases/108-scenario-driven-trade-and-waiver-evaluation/108-CONTEXT.md]
- New frontend probability visualizations or distribution dashboards
- Schedule-strength and opponent-aware scenario adjustments
- Multi-player trade search beyond the existing one-for-one surface unless it falls out naturally from the shared evaluator
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                      | Research Support                                                                                                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SCEN-01 | Trade and waiver scoring mutates canonical simulation state instead of route-specific delta math | Use snapshot-bound `ScenarioEvaluationAgent` backed by `buildSimulationState`, `buildTeamOpportunityStream`, and `simulateTeamRun`. [VERIFIED: packages/backend/src/agents/season-simulation.ts; packages/backend/src/simulation/state-builder.ts; packages/backend/src/simulation/opportunity.ts; packages/backend/src/simulation/daily-simulator.ts] |
| SCEN-02 | Trade evaluation returns user delta plus partner delta                                           | Recompute both mutated teams inside one league state and rank both against cached unaffected teams. [VERIFIED: packages/backend/src/agents/trade-recommendation.ts; packages/backend/src/simulation/monte-carlo.ts]                                                                                                                                    |
| SCEN-03 | Legality comes from allocator or gap detection, not heuristics                                   | Reuse `allocateProjections`, `detectGaps`, and `slot-eligibility`; remove `canReplacePosition()` gating. [VERIFIED: packages/backend/src/agents/waiver-recommendation.ts; packages/backend/src/projection/allocator.ts; packages/backend/src/projection/slot-eligibility.ts]                                                                           |
| SCEN-04 | Deterministic screening first, bounded Monte Carlo rerank second                                 | Cache baseline deterministic run once; rerank only top legal scenarios with `runMonteCarlo`. [VERIFIED: packages/backend/src/simulation/monte-carlo.ts; .planning/phases/108-scenario-driven-trade-and-waiver-evaluation/108-CONTEXT.md]                                                                                                               |
| SCEN-05 | Scenario evaluation is snapshot-bound and reproducible                                           | Fix `daysRemaining` to derive from `snapshotDate`; stop reading latest raw payload when snapshot-scoped data exists. [VERIFIED: packages/backend/src/simulation/state-builder.ts; packages/backend/src/agents/waiver-recommendation.ts; packages/backend/src/agents/trade-recommendation.ts; packages/backend/src/agents/standings-projection.ts]      |
| SCEN-06 | Focused automated tests cover legality, GS cap, partner impact, reproducibility                  | Extend allocator tests, add scenario-evaluator tests, add waiver/trade regression tests, add state-builder reproducibility tests. [VERIFIED: packages/backend/src/projection/__tests__/allocator.test.ts; packages/backend/src/agents/__tests__/trade-recommendation.test.ts; packages/backend/package.json]                                           |

</phase_requirements>

## Summary

- Current waiver and trade scoring still bypass the v11 engine: `WaiverRecommendationAgent` screens on `team_daily_projected_category` plus `canReplacePosition()`, and `TradeRecommendationAgent` scores only the requesting team from persisted projected tables. [VERIFIED: packages/backend/src/agents/waiver-recommendation.ts; packages/backend/src/agents/trade-recommendation.ts]
- `SeasonSimulationAgent` already exposes canonical state loading and seeded Monte Carlo, and the simulation layer already exposes pure helpers (`buildTeamOpportunityStream`, `simulateTeamRun`) that can support deterministic candidate scoring without a second math branch. [VERIFIED: packages/backend/src/agents/season-simulation.ts; packages/backend/src/simulation/opportunity.ts; packages/backend/src/simulation/daily-simulator.ts]
- Primary recommendation: add a shared `ScenarioEvaluationAgent` that loads one snapshot-bound baseline context, applies roster mutations, recomputes only affected teams with the v11 pipeline, and returns legality, per-category deltas, user delta, partner delta, degraded reasons, and optional bounded Monte Carlo rerank fields. [VERIFIED: packages/backend/src/simulation/types.ts; packages/backend/src/simulation/monte-carlo.ts; .planning/phases/108-scenario-driven-trade-and-waiver-evaluation/108-CONTEXT.md]
- Keep `TradeRecommendationAgent` and `WaiverRecommendationAgent` as candidate-generation and response-shaping layers only; remove scoring ownership from `RosterSimulator.simulateTrade()` and `simulateAddDrop()`. [VERIFIED: packages/backend/src/agents/roster-simulator.ts; packages/backend/src/agents/trade-recommendation.ts; packages/backend/src/agents/waiver-recommendation.ts]

## Architectural Responsibility Map

| Capability                           | Primary Tier       | Secondary Tier     | Rationale                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snapshot-bound simulation state load | API / Backend      | Database / Storage | State comes from `league_daily_snapshot`, settings, roster snapshots, category totals, and projection rows. [VERIFIED: packages/backend/src/simulation/state-builder.ts; packages/backend/src/db/snapshot-repository.ts]                                                |
| Scenario mutation and legality       | API / Backend      | Database / Storage | Add/drop and trade legality depend on roster mutation plus allocator/gap detection over stored roster/projection state. [VERIFIED: packages/backend/src/projection/allocator.ts; packages/backend/src/projection/slot-eligibility.ts]                                   |
| Deterministic delta scoring          | API / Backend      | —                  | Deltas should reuse simulation helpers, not frontend or persisted projected tables. [VERIFIED: packages/backend/src/simulation/opportunity.ts; packages/backend/src/simulation/daily-simulator.ts; packages/backend/src/agents/trade-recommendation.ts]                 |
| Monte Carlo rerank                   | API / Backend      | —                  | `runMonteCarlo` already consumes prebuilt `SimulationState` and returns reusable team distributions. [VERIFIED: packages/backend/src/simulation/monte-carlo.ts]                                                                                                         |
| Scenario inputs and baseline data    | Database / Storage | API / Backend      | Free-agent snapshots, roster snapshots, category totals, and archived payloads define historical inputs. [VERIFIED: packages/backend/src/db/schema.ts; packages/backend/src/db/migrations/001_initial_schema.sql; packages/backend/src/agents/snapshot-orchestrator.ts] |

## Standard Stack

| Module                                               | Role in Phase 108                                               | Planner Action                                                                                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SeasonSimulationAgent.buildState()`                 | Canonical snapshot-bound state loader                           | Reuse directly as entry point. [VERIFIED: packages/backend/src/agents/season-simulation.ts]                                                                                                                 |
| `buildSimulationState()`                             | Actual DB materialization of simulation state                   | Reuse after fixing snapshotDate-derived horizon and snapshot-bound raw-data lookup. [VERIFIED: packages/backend/src/simulation/state-builder.ts]                                                            |
| `buildTeamOpportunityStream()` + `simulateTeamRun()` | Deterministic scoring path for mutated teams                    | Reuse directly inside shared evaluator; do not re-implement delta math from category tables. [VERIFIED: packages/backend/src/simulation/opportunity.ts; packages/backend/src/simulation/daily-simulator.ts] |
| `runMonteCarlo()`                                    | Seeded uncertainty rerank for top scenarios                     | Reuse for bounded rerank only. [VERIFIED: packages/backend/src/simulation/monte-carlo.ts]                                                                                                                   |
| `allocateProjections()` + `slot-eligibility`         | Authoritative lineup allocation, GS-cap handling, gap detection | Reuse as legality source for waiver and trade scenarios. [VERIFIED: packages/backend/src/projection/allocator.ts; packages/backend/src/projection/slot-eligibility.ts]                                      |
| `TradeRecommendationAgent`                           | Candidate enumeration, equivalent-value filtering, API shaping  | Narrow; remove scoring/fairness ownership. [VERIFIED: packages/backend/src/agents/trade-recommendation.ts]                                                                                                  |
| `WaiverRecommendationAgent`                          | Free-agent pool resolution and API shaping                      | Narrow; remove legality/scoring ownership. [VERIFIED: packages/backend/src/agents/waiver-recommendation.ts]                                                                                                 |
| `RosterSimulator`                                    | Explanations, depth heuristics, optional display text           | Keep explanation helpers; bypass `simulateTrade()` and `simulateAddDrop()` for scoring. [VERIFIED: packages/backend/src/agents/roster-simulator.ts]                                                         |
| `StandingsProjectionAgent`                           | Snapshot persistence path for projected standings               | Keep as upstream parity/oracle; do not call it inside scenario scoring. [VERIFIED: packages/backend/src/agents/standings-projection.ts]                                                                     |
| `SnapshotRepository`                                 | Shared snapshot-scoped reads                                    | Extend for missing snapshot-bound raw/GS helpers instead of duplicating DB reads in agents. [VERIFIED: packages/backend/src/db/snapshot-repository.ts]                                                      |

## Recommended Architecture

- Shared abstraction: add `ScenarioEvaluationAgent` as the single backend entry point for exact-scenario scoring, with a pure core under `packages/backend/src/simulation/` for mutation and deterministic/MC evaluation. `SeasonSimulationAgent` should stay focused on whole-snapshot orchestration. [VERIFIED: packages/backend/src/agents/season-simulation.ts; .planning/phases/108-scenario-driven-trade-and-waiver-evaluation/108-CONTEXT.md]
- Baseline context should contain one `SimulationState`, one deterministic baseline league result, cached per-team category values/ranks, and snapshot-scoped helper data needed for candidate generation. This satisfies `MC-02` without route-specific recomputation logic. [VERIFIED: .planning/REQUIREMENTS.md; packages/backend/src/simulation/types.ts; packages/backend/src/simulation/monte-carlo.ts]
- Mutation should target `TeamSimInput.roster` and `TeamSimInput.playerProjections`, not persisted `team_daily_projected_category` rows. Persisted projected tables are already downstream of allocation and cannot express lineup congestion or bilateral mutations. [VERIFIED: packages/backend/src/simulation/types.ts; packages/backend/src/agents/trade-recommendation.ts; packages/backend/src/agents/waiver-recommendation.ts]
- Deterministic evaluation should recompute only affected teams with `buildTeamOpportunityStream()` and `simulateTeamRun()`, then rerank them against cached untouched-team baseline outputs. This is the narrowest path that still uses the v11 engine. [VERIFIED: packages/backend/src/simulation/opportunity.ts; packages/backend/src/simulation/daily-simulator.ts; packages/backend/src/simulation/monte-carlo.ts]
- Monte Carlo rerank should clone the mutated `SimulationState` for the top legal deterministic scenarios only, call `runMonteCarlo()` with a seed, and append uncertainty fields without changing legality or base delta ownership. [VERIFIED: packages/backend/src/simulation/monte-carlo.ts; .planning/phases/108-scenario-driven-trade-and-waiver-evaluation/108-CONTEXT.md]
- Exact-scenario routes should call the shared evaluator directly. Current `waivers/evaluate` incorrectly piggybacks on recommendation search, so negative or illegal exact swaps cannot return full evaluator output. [VERIFIED: packages/backend/src/api/recommendations.ts]

```ts
type ScenarioMutation =
  | {
      kind: "waiver";
      teamId: number;
      addPlayerId: number;
      dropPlayerId: number;
    }
  | {
      kind: "trade";
      teamId: number;
      partnerTeamId: number;
      givePlayerIds: number[];
      receivePlayerIds: number[];
    };

interface ScenarioContext {
  state: SimulationState;
  baselineTeams: Map<number, TeamRunResult>;
  baselineRanks: Map<
    number,
    { overall: number; categories: Map<string, number> }
  >;
  degradedReasons: string[];
}

interface ScenarioEvaluation {
  isLegal: boolean;
  blockingIssues: string[];
  rosterGapsByTeam: Map<number, RosterGap[]>;
  teamDeltas: Map<
    number,
    { overallDelta: number; categoryDeltas: CategoryImpact[] }
  >;
  mc?: {
    seeded: boolean;
    runs: number;
    probabilityDelta?: Record<string, number>;
  };
}
```

## Deterministic Scoring Boundary

- Deterministic scoring should own legality, degraded reasons, roster gaps, per-category deltas, overall roto delta, and bilateral trade deltas for every candidate. [VERIFIED: .planning/phases/108-scenario-driven-trade-and-waiver-evaluation/108-CONTEXT.md]
- Candidate generation should stop at deterministic ranking for the broad search space; Monte Carlo should start only after equivalent-value/free-agent prefilters and only on the top legal scenarios. [VERIFIED: .planning/phases/108-scenario-driven-trade-and-waiver-evaluation/108-CONTEXT.md; packages/backend/src/agents/trade-recommendation.ts; packages/backend/src/agents/waiver-recommendation.ts]
- Monte Carlo should never decide legality, never screen the full search space, and never rebuild unrelated candidate state that was already cached in the deterministic baseline context. [VERIFIED: .planning/REQUIREMENTS.md; packages/backend/src/simulation/monte-carlo.ts]
- Trade likelihood should be derived from bilateral deterministic delta first and equivalent-value signals second; current `fairnessScore = userDelta / 5` is the wrong boundary because it ignores partner impact entirely. [VERIFIED: packages/backend/src/agents/trade-recommendation.ts; packages/backend/src/agents/roster-simulator.ts]

## Fix-First Mismatches And Reproducibility Issues

- `buildSimulationState()` derives `daysRemaining` from `new Date()` instead of `snapshotDate`, so historical evaluation changes as wall-clock time advances. Fix this before any scenario work. [VERIFIED: packages/backend/src/simulation/state-builder.ts]
- `buildSimulationState()`, `StandingsProjectionAgent`, `TradeRecommendationAgent.getGsData()`, and `WaiverRecommendationAgent.getGsData()` all read the latest `league_raw_payload`, so GS-cap behavior for old snapshots is not reproducible. Add snapshot-bound repository access or persist snapshot-bound GS-used data. [VERIFIED: packages/backend/src/simulation/state-builder.ts; packages/backend/src/agents/standings-projection.ts; packages/backend/src/agents/trade-recommendation.ts; packages/backend/src/agents/waiver-recommendation.ts; packages/backend/src/db/migrations/001_initial_schema.sql]
- `league_free_agent_snapshot` already exists and is written during snapshot orchestration, so waiver evaluation should treat it as authoritative and mark raw-payload parsing as degraded fallback only. [VERIFIED: packages/backend/src/db/schema.ts; packages/backend/src/agents/snapshot-orchestrator.ts; packages/backend/src/agents/waiver-recommendation.ts]
- `TradeRecommendationAgent.getCurrentStandings()` uses persisted projected tables as scoring input; those rows are downstream artifacts, not canonical simulation state. Scenario deltas should be computed from deterministic simulation baseline instead. [VERIFIED: packages/backend/src/agents/trade-recommendation.ts]
- `getLatestLeagueDraftCosts()` reads the newest ESPN raw payload, so trade likelihood can drift for old snapshots. Keep draft-cost usage secondary and snapshot-bind it when available; otherwise mark the likelihood signal degraded. [VERIFIED: packages/backend/src/agents/trade-recommendation.ts; .planning/phases/108-scenario-driven-trade-and-waiver-evaluation/108-CONTEXT.md]
- Request validation is mismatched today: `ProposedTradeSchema` still expects `playersGiven` and `playersReceived`, but the trade route and frontend send `givePlayers` and `receivePlayers`. Additive API work in this phase should align schemas before new fields are added. [VERIFIED: packages/backend/src/utils/validation.ts; packages/backend/src/api/recommendations.ts; packages/frontend/src/lib/api.ts]

## High-Risk Pitfalls And Anti-Patterns

- **Trade legality false positives:** current trade analysis computes `rosterGaps` only for the requesting team and current validation helper only checks one side at a time. Bilateral trade evaluation must run legality on both mutated rosters before scoring or ranking. [VERIFIED: packages/backend/src/agents/trade-recommendation.ts]
- **Waiver legality false positives and false negatives:** `canReplacePosition()` accepts any same hitter/pitcher type swap and rejects some legal flex replacements. Remove it entirely from recommendation gating. [VERIFIED: packages/backend/src/agents/waiver-recommendation.ts]
- **Partner-aware delta blind spot:** `fairnessScore` and `assessTradeLikelihood()` currently depend on user delta and market overpay, not partner delta. Reusing that logic after bilateral scoring would preserve the wrong behavior. [VERIFIED: packages/backend/src/agents/trade-recommendation.ts; packages/backend/src/agents/roster-simulator.ts]
- **Lineup congestion drift:** projected-category delta math cannot see that a newly added hitter may push another hitter to bench or that a traded-away SP can change who occupies a `P` slot. Only the allocator plus opportunity stream path can catch this. [VERIFIED: packages/backend/src/projection/allocator.ts; packages/backend/src/simulation/opportunity.ts]
- **GS-cap misclassification:** pitchers in `P` slots are classified as SP or RP based on projected GS/IP. Scenario scoring must rerun that classification after mutation; subtracting raw category values misses this edge. [VERIFIED: packages/backend/src/projection/allocator.ts; packages/backend/src/projection/__tests__/allocator.test.ts]
- **Exact-scenario route leakage:** `waivers/evaluate` currently finds a swap by rerunning recommendation search; illegal or negative moves can collapse into generic zero-delta responses. The planner should require a direct evaluator path for exact move analysis. [VERIFIED: packages/backend/src/api/recommendations.ts]

## Don't Hand-Roll

- Do not hand-roll a second deterministic trade/waiver math path from `team_daily_projected_category`; use v11 simulation helpers for both screening and rerank baselines. [VERIFIED: packages/backend/src/agents/trade-recommendation.ts; packages/backend/src/agents/waiver-recommendation.ts; packages/backend/src/simulation/opportunity.ts]
- Do not hand-roll legality heuristics from shared positions; use allocator/gap output and surface blocking issues directly. [VERIFIED: packages/backend/src/agents/waiver-recommendation.ts; packages/backend/src/projection/allocator.ts]
- Do not hand-roll partner fairness from market values alone; market values are secondary to bilateral simulated deltas. [VERIFIED: packages/backend/src/agents/trade-recommendation.ts]
- Do not hand-roll snapshot fallback reads in route handlers; extend `SnapshotRepository` and load once into scenario context. [VERIFIED: packages/backend/src/db/snapshot-repository.ts; packages/backend/src/api/recommendations.ts]

## Validation Architecture

| Property           | Value                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | Vitest 1.1.1 in `packages/backend` [VERIFIED: packages/backend/package.json]                                                                                                                               |
| Config file        | `packages/backend/vitest.config.ts` with global tests enabled [VERIFIED: packages/backend/vitest.config.ts]                                                                                                |
| Quick run command  | `pnpm --filter @espn-fantasy/backend exec vitest run src/projection/__tests__/allocator.test.ts src/agents/__tests__/trade-recommendation.test.ts` [VERIFIED: package.json; packages/backend/package.json] |
| Full suite command | `pnpm --filter @espn-fantasy/backend exec vitest run && pnpm --filter @espn-fantasy/backend typecheck` [VERIFIED: package.json; packages/backend/package.json]                                             |

| Req ID  | Behavior                                                                                   | Test Type        | Automated Command                                                                                                                                                                                              | File Exists?        |
| ------- | ------------------------------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| SCEN-01 | Deterministic scorer mutates canonical state for waiver and trade                          | unit/integration | `pnpm --filter @espn-fantasy/backend exec vitest run src/simulation/__tests__/scenario-evaluator.test.ts`                                                                                                      | ❌ Wave 0           |
| SCEN-02 | Trade evaluation returns user and partner deltas from one mutated league snapshot          | unit/integration | `pnpm --filter @espn-fantasy/backend exec vitest run src/simulation/__tests__/scenario-evaluator.test.ts src/agents/__tests__/trade-recommendation.test.ts`                                                    | ❌ expand           |
| SCEN-03 | Allocator-derived legality blocks illegal waiver and trade scenarios                       | unit/integration | `pnpm --filter @espn-fantasy/backend exec vitest run src/agents/__tests__/waiver-recommendation.test.ts src/projection/__tests__/allocator.test.ts`                                                            | ❌ waive / ✅ alloc |
| SCEN-04 | Deterministic screen reranks bounded top scenarios with seeded Monte Carlo                 | unit             | `pnpm --filter @espn-fantasy/backend exec vitest run src/simulation/__tests__/scenario-evaluator.test.ts`                                                                                                      | ❌ Wave 0           |
| SCEN-05 | Historical scenarios remain reproducible from `snapshotDate`                               | unit             | `pnpm --filter @espn-fantasy/backend exec vitest run src/simulation/__tests__/state-builder.test.ts`                                                                                                           | ❌ Wave 0           |
| SCEN-06 | Focused matrix covers lineup congestion, GS cap, partner impact, legality, reproducibility | integration      | `pnpm --filter @espn-fantasy/backend exec vitest run src/simulation/__tests__/scenario-evaluator.test.ts src/agents/__tests__/waiver-recommendation.test.ts src/agents/__tests__/trade-recommendation.test.ts` | ❌ partial          |

- **Wave 0 gaps:** add `src/simulation/__tests__/scenario-evaluator.test.ts` for mutated-team recompute, bilateral deltas, deterministic-vs-MC boundary, and seeded reproducibility. [VERIFIED: packages/backend/src/simulation/monte-carlo.ts; packages/backend/src/simulation/opportunity.ts]
- **Wave 0 gaps:** add `src/simulation/__tests__/state-builder.test.ts` for `snapshotDate`-derived `daysRemaining` and snapshot-bound raw/GS fallback behavior. [VERIFIED: packages/backend/src/simulation/state-builder.ts]
- **Wave 0 gaps:** add `src/agents/__tests__/waiver-recommendation.test.ts` for legal/illegal exact evaluations and gap surfacing; no such coverage exists now. [VERIFIED: packages/backend/src/agents/waiver-recommendation.ts; packages/backend/src/utils/__tests__/validation.test.ts]
- **Wave 0 gaps:** extend `src/agents/__tests__/trade-recommendation.test.ts` with partner delta assertions and likelihood derived from bilateral deltas instead of `userDelta / 5`. [VERIFIED: packages/backend/src/agents/__tests__/trade-recommendation.test.ts; packages/backend/src/agents/trade-recommendation.ts]
- **Reuse existing coverage:** keep `allocator.test.ts` as the GS-cap and lineup-legality oracle instead of recreating those cases in route tests. [VERIFIED: packages/backend/src/projection/__tests__/allocator.test.ts]

## Security Domain

| ASVS Category             | Applies | Standard Control                                                                                                                                                                                                                                                          |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V4 Access Control         | yes     | Keep existing authenticated route surface unchanged; scenario evaluator must not bypass team/league route ownership checks already enforced in route layer. [VERIFIED: packages/backend/src/api/recommendations.ts; CLAUDE.md]                                            |
| V5 Input Validation       | yes     | Align Zod request schemas with actual trade/waiver request bodies before adding new additive fields. [VERIFIED: packages/backend/src/utils/validation.ts; packages/backend/src/api/recommendations.ts]                                                                    |
| V10 Malicious Input / DoS | yes     | Bound candidate search, bound Monte Carlo top-K rerank, and keep seeded deterministic path for broad screening to avoid request-amplified compute spikes. [VERIFIED: packages/backend/src/agents/trade-recommendation.ts; packages/backend/src/simulation/monte-carlo.ts] |

## Assumptions Log

- None. Operational claims above are grounded in current code or planning artifacts; exact top-K and run-count knobs remain planner discretion by explicit phase context. [VERIFIED: .planning/phases/108-scenario-driven-trade-and-waiver-evaluation/108-CONTEXT.md]

## Sources

- Primary: `packages/backend/src/agents/trade-recommendation.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/agents/waiver-recommendation.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/agents/roster-simulator.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/agents/season-simulation.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/simulation/state-builder.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/simulation/opportunity.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/simulation/daily-simulator.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/simulation/monte-carlo.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/agents/standings-projection.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/projection/allocator.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/projection/slot-eligibility.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/db/snapshot-repository.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/api/recommendations.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/utils/validation.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/projection/__tests__/allocator.test.ts` [VERIFIED: codebase]
- Primary: `packages/backend/src/agents/__tests__/trade-recommendation.test.ts` [VERIFIED: codebase]
- Context: `CLAUDE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `108-CONTEXT.md` [VERIFIED: codebase]
- Historical context only: `67-VERIFICATION.md`, `69-RESEARCH.md`, `69-VERIFICATION.md` [VERIFIED: codebase]

## Metadata

- **Confidence breakdown:** Standard stack HIGH; architecture HIGH; data-source pitfalls HIGH; runtime budget tuning MEDIUM because current codebase has no per-scenario performance benchmarks. [VERIFIED: packages/backend/src/simulation/monte-carlo.ts; packages/backend/src/agents/trade-recommendation.ts]
- **Research date:** 2026-05-16
- **Valid until:** 2026-06-16
