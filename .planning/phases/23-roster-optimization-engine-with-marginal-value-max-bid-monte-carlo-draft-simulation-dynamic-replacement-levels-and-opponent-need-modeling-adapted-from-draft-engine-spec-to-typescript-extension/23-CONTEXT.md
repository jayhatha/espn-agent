# Phase 23 Context: Roster Optimization Engine

## Source

User-provided specification: "Fantasy Baseball Draft Engine 2.md" — Claude Implementation Specification for optimal fantasy baseball draft strategy.

## Decisions (LOCKED)

### Architecture: TypeScript Extension Module
- Adapt the Python spec to TypeScript running in the Chrome extension (packages/extension/)
- Must integrate with existing draft engine at `packages/extension/lib/engine/`
- Performance target: <100ms per draft event recalculation

### Core Algorithms to Implement
1. **SGP (Standings Gain Points) Model** — Convert projections to roto value using `(player_stat - replacement_stat) / category_spread`
2. **Dynamic Replacement Levels** — Recompute based on remaining player pool after each pick
3. **Positional Scarcity Adjustment** — `scarcity_factor = remaining_slots / remaining_players`, aggressive for C/SS/2B
4. **Roster Optimization (MIP)** — Maximize `Σ value_i * x_i` subject to budget + roster constraints
5. **Auction Bid Optimizer** — Binary search for max profitable bid by solving roster optimizer at each price point
6. **Opponent Need Modeling** — Track budget_remaining + roster_needs per team, compute competition/inflation factors
7. **Monte Carlo Draft Simulation** — Simulate remaining draft outcomes (reduced from 5000 to feasible count for browser)

### Data Model
- Player: player_id, name, positions, team, projected_stats, adp, auction_value
- DraftState: drafted_players, teams, team_rosters, team_budgets, available_players, current_nomination
- LeagueSettings: roster_slots, categories, budget, teams

### League Categories (from spec)
- Hitters: R, HR, RBI, SB, AVG
- Pitchers: W, K, ERA, WHIP, SV

### Roster Slots (from spec)
- Hitters: 1B, 2B, SS, 3B, C, CI, MI, OF×4, UTIL×3
- Pitchers: P×9
- Bench: BN×5

### Performance Strategies
- Cache replacement levels and SGP constants
- Reuse solver objects
- Limit optimizer pool to top 200 remaining players

## Claude's Discretion

- Choice of MIP solver (OR-Tools CP-SAT port vs. pure TS solver vs. greedy heuristic)
- Monte Carlo simulation count (spec says 5000, browser may need fewer)
- How to structure TypeScript modules within packages/extension/lib/engine/
- Whether to use Web Workers for heavy computation
- Integration pattern with existing engine signals (alerts, scarcity, archetype)

## Deferred Ideas (Out of Scope)

- Snake draft pick optimizer (focus on auction for this phase)
- ML-based opponent models
- Live ADP updating
- Trade recommendation engine integration
- UI dashboard (separate phase)
- Python implementation (adapting to TypeScript)
- FastAPI/Streamlit (using existing extension UI)
