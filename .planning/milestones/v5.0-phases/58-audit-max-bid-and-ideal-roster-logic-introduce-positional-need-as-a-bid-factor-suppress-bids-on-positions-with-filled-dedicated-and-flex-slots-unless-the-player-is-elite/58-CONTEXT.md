# Phase 58 Context: Positional Need as Bid Factor

## Decisions (LOCKED)

### Problem
The engine bids the same amount on a 3B whether you need one or already have 3B + CI filled. Positional weight (+3 for 3B) is now suppressed when dedicated slots are full (Phase 56 fix), but the BASE bid (SGP-dollar blend) doesn't account for positional need at all. A player going to UTIL should be valued less than one filling a dedicated slot.

### What we want
- If a player fills a dedicated slot (or flex MI/CI): full bid value
- If a player would go to UTIL: reduce bid (they're competing with ALL hitters for generic slots)
- If a player would go to BN: reduce bid further (they won't start)
- Exception: if the player is elite (top ~10% SGP), bid full value anyway — elite talent is worth a UTIL slot

### Current architecture (from Phase 56 session)
- `computeMaxBid` in bid-optimizer.ts: SGP-dollar proportional valuation + ASV blend
- `computeStrategyBidCap` in strategy-caps.ts: positional weight, SP tier, hitter budget, endgame, inflation
- `use-draft-engine.ts`: merges async bid result, applies strategy cap
- Remaining slots available at `baseSignals.remainingSlots` (Record<string, number>)
- Positional weight already suppressed when dedicated slots full (recent fix)

### Implementation approach
- Add a "positional need multiplier" to `computeStrategyBidCap` (or as a separate step)
- Compute where the player would land: dedicated slot > flex (MI/CI) > UTIL > BN
- Apply multiplier: dedicated = 1.0x, flex = 0.9x, UTIL = 0.7x, BN = 0.5x
- Elite override: if player's SGP is in top 10% of pool, skip the reduction (elite hitters are worth UTIL slots)
- The ideal roster optimizer already handles this naturally (it picks best SGP/$ for each slot)

### League config
- 28 slots: C/1B/2B/SS/3B/MI/CI/4OF/3UTIL/9P/5BN
- 13 teams, $260 budget, OPS roto

## Claude's Discretion
- Exact multiplier values (0.7x UTIL vs 0.75x etc)
- Whether "elite" threshold is top 10%, top 15%, or based on SGP dollars
- Whether to implement as a separate function or inline in computeStrategyBidCap
- Whether ideal roster needs changes or already handles this via slot assignment

## Deferred Ideas
- None
