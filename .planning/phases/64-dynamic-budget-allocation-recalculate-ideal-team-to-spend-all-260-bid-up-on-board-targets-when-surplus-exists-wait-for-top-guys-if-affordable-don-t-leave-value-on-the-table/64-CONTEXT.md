# Phase 64 Context: Dynamic Budget Allocation

## Decisions (LOCKED)

### Core Problem
1. **We're ending drafts with unspent money.** The $3/slot reserve and FG$ × 1.25 cap are too conservative. Every unspent dollar is wasted value — a dollar we could have used to win a better player.

### Dynamic Ideal Team
2. **After every pick, recalculate the ideal remaining team from the board.** Sum up the FG$ of the best available board player at each unfilled position. This is the "ideal remaining spend." Compare to actual remaining budget.

3. **If budget > ideal remaining spend, we have surplus.** Distribute that surplus across our top remaining targets by bidding above FG$ × 1.25. The further we are above ideal spend, the more aggressive we can be.

4. **If budget < ideal remaining spend, we need to be selective.** Can't afford everyone — pick the highest-priority targets and let the rest go.

### Bid Adjustments
5. **Surplus boost: bid up to FG$ × (1 + surplus_ratio).** Where `surplus_ratio = (budget - ideal_spend) / ideal_spend`. If we have $50 surplus on $200 ideal spend, that's 25% — bid up to FG$ × 1.25 (already our current cap, so effectively no change). But if surplus is $100 on $150 ideal, that's 67% — bid up to FG$ × 1.67.

6. **Cap surplus boost at FG$ × 1.5.** Never pay more than 150% of model value regardless of surplus.

7. **Wait for top guys.** If a board target at a needed position hasn't been nominated yet and we can afford them, don't spend the surplus on lower-priority players. Reserve it for the top target.

### Budget Floor
8. **Minimum $1 per remaining slot (not $3).** The $3 reserve was too conservative. Most late-round picks go for $1 anyway. Reserve $1 per slot and let the surplus flow to better players.

### Endgame
9. **Last 5 picks: spend everything.** No reserve. Whatever budget remains, distribute across the final picks. Better to overpay for a $3 player than leave money unspent.

## Claude's Discretion

- How to implement the ideal team calculation (new function vs extending draft-board-engine)
- Whether to cache the ideal team or recompute each nomination
- How to handle the "wait for top guys" logic — which players to reserve for
- Whether this needs new tests or can extend existing ones
- Engine only — no simulator changes

## Deferred Ideas

- Opponent budget modeling (tracking what other teams can afford)
- Draft pace optimization (nominating strategically to force opponent spending)
