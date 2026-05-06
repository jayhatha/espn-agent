# Phase 91: RosterSimulator Extraction - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Extract a `RosterSimulator` module from the shared simulation logic in `TradeRecommendationAgent` (~1700 lines) and `WaiverRecommendationAgent` (~800 lines). Both agents currently implement parallel versions of:

- Roster-change simulation (swap projected stats between two rosters)
- Post-change category gap detection (`detectPostTradeGaps`, `detectPostSwapGaps`)
- Outcome ranking by projected standings delta
- Natural-language explanation generation (`generateTradeExplanation`, `generateExplanation`)

The new module lives at `packages/backend/src/agents/roster-simulator.ts`. Both agents import from it.

</domain>

<decisions>
## Implementation Decisions

### Module Interface

- File: `packages/backend/src/agents/roster-simulator.ts`
- Class: `RosterSimulator` — pure, no DB, no ESPN adapter
- Constructor: `constructor(private standingsAgent: StandingsProjectionAgent)` — needed for projections context
- Two public methods matching ROADMAP criteria:
  - `simulateTrade(roster: TeamRoster, tradeProposal: TradeProposal, leagueContext: LeagueContext): Promise<TradeSimulation>`
  - `simulateAddDrop(roster: TeamRoster, add: Player, drop: Player, leagueContext: LeagueContext): Promise<AddDropSimulation>`

### Gap Detection Unification

- `detectPostTradeGaps` and `detectPostSwapGaps` become private methods of `RosterSimulator`
- Both agents call through the public simulate methods — gap detection is an implementation detail of the simulator

### Explanation Generation

- `generateTradeExplanation` and `generateExplanation` merge into a single `generateExplanation(simulation: TradeSimulation | AddDropSimulation, context: LeagueContext): string` private method
- Both agents call through the simulate methods which include explanation in the returned result

### Agent Refactoring

- `TradeRecommendationAgent`: remove duplicate simulation methods, add `private simulator: RosterSimulator` constructed in constructor
- `WaiverRecommendationAgent`: same pattern
- Both agents' public methods remain unchanged

### the agent's Discretion

- Exact type definitions for TradeProposal, LeagueContext, TradeSimulation, AddDropSimulation — derive from existing code
- Whether to use union types or overloads for the explanation method

</decisions>

<code_context>

## Existing Code Insights

### Reusable Assets

- `packages/backend/src/agents/trade-recommendation.ts` — source of simulateTradeImpact, detectPostTradeGaps, generateTradeExplanation, assessTradeLikelihood
- `packages/backend/src/agents/waiver-recommendation.ts` — source of simulateSwapFromCache, detectPostSwapGaps, generateExplanation
- `packages/backend/src/agents/standings-projection.ts` — StandingsProjectionAgent (already imported by both agents)
- `packages/backend/src/db/snapshot-repository.ts` — Phase 90 output, used by both agents

### Established Patterns

- Class-based agents with constructor injection
- StandingsProjectionAgent used for roto-point projections context
- Both agents already import StandingsProjectionAgent

### Integration Points

- TradeRecommendationAgent.analyzeProposedTrade → will call simulator.simulateTrade
- TradeRecommendationAgent.getTradeRecommendations → will call simulator.simulateTrade for each candidate
- WaiverRecommendationAgent.getRecommendations → will call simulator.simulateAddDrop

</code_context>

<specifics>
## Specific Ideas

Success criteria require: TradeRecommendationAgent ≤900 lines, WaiverRecommendationAgent ≤500 lines after extraction.

</specifics>

<deferred>
## Deferred Ideas

- Monte Carlo simulation mode (separate concern)
- Caching simulation results (separate concern)

</deferred>
