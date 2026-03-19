# Phase 60 Context: SP Logic in Bid Engine

## Decisions (LOCKED)

### SP Tier System

| PL Rank | Tier | Cap | Role |
|---------|------|-----|------|
| 1-20 | SP1 | $18 | Ace — worth the investment |
| 21-30 | SP2 | $12 | Solid #2 |
| 31-40 | SP3 | $10 | Mid-rotation |
| 41-60 | SP4 | $5 | Back-end value |
| 61+ / unranked | SP5 | $3 | Filler |

### Key Rules

1. **Rank determines tier, not draft order.** A PL #28 is an SP2-tier pitcher ($12 cap) whether he's the first or seventh SP you draft. You save the $18 slot for a top-20 arm whenever one comes up.

2. **Tier cap is both floor AND ceiling for ranked SPs (top 60).** The SGP blend undervalues pitchers in an OPS league ($3-$5 for arms worth $18), so we commit to spending the tier amount on quality arms. For unranked/filler SPs, the cap only limits down.

3. **SP savings reallocation.** If you get an SP below their tier cap (e.g., SP3-tier for $6 instead of $10), the $4 savings rolls up to the next ranked SP bid. If all 5 starting SP slots are filled, savings flow to RPs instead. Savings only apply to top-60 ranked SPs — filler stays at $3.

4. **Target composition: 7 SP + 5 RP.** SP1-5 fill starting P slots, SP6-7 go to bench. The ideal roster labels slots as SP1-SP5 (sorted by PL rank) and RP1-RP4 for starters, with SP6, SP7, RP5 on bench.

5. **RP hard cap: $15.** Relievers are replaceable — even with SP savings flowing to them, they never exceed $15.

6. **No pitcher SGP multiplier.** We removed the 0.5x pitcher SGP dampening. Individual pitchers are valued at their true SGP. The budget split (75/25 hitter/pitcher) is enforced structurally by the hitter budget cap ($220) and SP tier caps, not by devaluing every pitcher's SGP.

## Claude's Discretion

- How to verify each rule against the current codebase
- Whether to split into audit + fix or do it in one pass
- Test strategy

## Deferred Ideas

- None
