# Phase 108: Scenario-Driven Trade & Waiver Evaluation - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning
**Source:** Post-simulation trade and waiver logic review

<phase_boundary>

## Phase Boundary

Use the v11 simulation engine as the single scenario evaluation path for trade and waiver recommendations. Replace heuristic delta math, one-sided trade scoring, and positional legality shortcuts with snapshot-bound deterministic evaluation and targeted Monte Carlo reranking.

This phase covers backend scenario evaluation and additive API contract changes needed by the existing trade and waiver pages. It does not include a new frontend probability dashboard.
</phase_boundary>

<evidence>
## Evidence and Current Defects

- `packages/backend/src/agents/standings-projection.ts` already uses lineup-aware allocation, but `packages/backend/src/agents/roster-simulator.ts` still scores scenarios by adding and subtracting raw player projections from projected totals
- `packages/backend/src/agents/trade-recommendation.ts` simulates only the requesting team; partner-team deltas and fairness are not grounded in both sides of the move
- `packages/backend/src/agents/waiver-recommendation.ts` filters moves with `canReplacePosition()` before authoritative lineup or gap evaluation
- Recommendation helpers mix snapshot data with latest raw ESPN payload and wall-clock assumptions, which breaks historical or backtest-style evaluation
- `packages/backend/src/simulation/state-builder.ts` derives remaining horizon from `new Date()` instead of `snapshotDate`, which conflicts with reproducible historical evaluation
- Current tests pass without covering lineup congestion, GS-cap effects, partner impact, or snapshot-bound reproducibility
  </evidence>

<decisions>
## Locked Decisions

- Reuse `SeasonSimulationAgent`, `buildSimulationState`, and `runMonteCarlo` as the scenario platform; do not build a second independent simulation branch
- Add deterministic scenario evaluation first; Monte Carlo is a bounded rerank or uncertainty layer for top scenarios, not the screening path for every candidate
- Trade evaluation must mutate both teams inside one league snapshot and return user delta plus partner delta
- Waiver and trade legality must come from allocator or gap-detection results, not position-overlap heuristics
- Scenario evaluation must be snapshot-bound: use `snapshotDate`, snapshot-scoped data, and known projection runs before falling back to latest raw payloads
- Keep current trade and waiver endpoints working; additive response fields are allowed, breaking removals are not

## Planner Discretion

- Exact module placement for shared scenario mutation helpers
- Whether deterministic scenario evaluation lives inside the existing season-simulation agent or a dedicated evaluator module that wraps the simulation primitives
- Candidate screening thresholds and top-K Monte Carlo rerank limits
- Final fairness or likelihood mapping once bilateral trade deltas are available
  </decisions>

<requirements>
## Requirements in Scope

- `SCEN-01` through `SCEN-06` in `.planning/REQUIREMENTS.md`
- Existing promise from `MC-02`: simulation outputs are reusable by trade and waiver evaluators without route-specific recomputation logic
  </requirements>

<canonical_refs>

## Canonical References

### Planning

- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `CLAUDE.md`

### Core backend code

- `packages/backend/src/agents/trade-recommendation.ts`
- `packages/backend/src/agents/waiver-recommendation.ts`
- `packages/backend/src/agents/roster-simulator.ts`
- `packages/backend/src/agents/season-simulation.ts`
- `packages/backend/src/agents/standings-projection.ts`
- `packages/backend/src/simulation/state-builder.ts`
- `packages/backend/src/simulation/monte-carlo.ts`
- `packages/backend/src/projection/allocator.ts`
- `packages/backend/src/projection/slot-eligibility.ts`
- `packages/backend/src/db/snapshot-repository.ts`

### Historical intent worth preserving but correcting

- `.planning/milestones/v6.0-phases/67-net-waiver-analysis-category-opportunity/67-VERIFICATION.md`
- `.planning/milestones/v6.0-phases/69-trade-finder/69-RESEARCH.md`
- `.planning/milestones/v6.0-phases/69-trade-finder/69-VERIFICATION.md`
  </canonical_refs>

<specific_ideas>

## Specific Ideas to Evaluate

- Introduce a mutation-based scenario input type that supports add/drop and trade operations over canonical simulation state
- Have deterministic scenario scoring return per-category deltas, overall roto delta, blocking roster gaps, degraded reasons, and optional notes about replacement coverage
- Use deterministic scoring to screen large candidate sets, then rerun only the best subset through Monte Carlo for probability-aware reranking
- Replace `canReplacePosition()` gating with gap-aware legality computed from the same allocator or gap-detection path that powers the scenario score
- Replace user-centric fairness normalization with a bilateral trade acceptance heuristic that uses both team deltas and market value only as secondary input
  </specific_ideas>

<deferred>
## Deferred from This Phase

- New frontend probability visualizations or distribution dashboards
- Schedule-strength and opponent-aware scenario adjustments
- Multi-player trade search beyond the existing one-for-one surface unless it falls out naturally from the shared evaluator
  </deferred>
