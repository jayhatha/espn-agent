# Phase 56 Context: Draft Logic Audit

## Decisions (LOCKED)

### Audit Scope
- Audit ALL draft logic (engine, bid controller, UI components) for consistency with value draft strategy
- Evaluate compliance with the auction draft system spec (attached below)
- **CRITICAL OVERRIDE**: League has 13 teams, not 12. Total league budget = 13 * $260 = $3,380
- Check that constants, formulas, UI displays, and bid decisions are all internally consistent

### Spec Reference (Authoritative)

League configuration: 13 teams, $260 budget, $3,380 total league budget, OPS roto, 13 hitters, 9 pitchers, 5 bench, 3 UTIL, 200 GS cap.

**Inflation**: money_remaining / value_remaining. Bands: <1.00 overspending, 1.00-1.05 neutral, 1.05-1.15 buying window, >1.15 strong value.

**Positional weights**: SS +4, OF +3, 3B +3, 1B +2, 2B +2, C +1. Avoid paying heavily for catcher, prioritize elite SS, stack OF/DH for UTIL.

**SP tier caps**: SP1 $12-18, SP2 $8-12, SP3 $6-10, SP4 $3-5, SP5 $1-3. Prefer high K rate, breakout upside.

**Budget allocation**: Hitters $185-205, Pitchers $55-70, Bench $5. If inflation > 1.10, increase hitter bid ceilings.

**Bid ceiling**: model_dollar_value - 2 (baseline). +2 if inflation > 1.10, +1 if position_need high. Clamped by max_bid_allowed = budget_remaining - (remaining_roster_spots - 1).

**Bid decision**: current_price > bid_ceiling -> PASS. profit >= 5 -> BID aggressively. price >= value - 2 -> STOP.

**Nomination**: nomination_score = espn_price - model_value. Nominate highest score (most overpriced) to force league overspending.

**Endgame**: budget_remaining <= $20. Switch to value_per_dollar = sgp_value / price. Prioritize breakout hitters, cheap OF, K pitchers. Avoid backup C, weak OPS.

**Category targets**: OPS top 3, HR top 3, SB top 4, Saves top 4, K top 5.

**Evaluation targets**: roster value >= $320, profit >= $70, top-4 category finishes >= 60%.

### Prior Decisions to Respect
- Keep simulation-based BID/PASS (more sophisticated than spec formula) — spec formula is reference, not replacement
- Keep SGP bid optimizer (more accurate than model_value - 2) — spec baseline is reference
- Add spec gaps as enhancements, not replacements
- Pure value strategy, no tier-based bid paths
- ESPN ASV for ideal roster pricing
- $200 hitter cap, max 1 catcher

## Claude's Discretion
- How to organize the audit (by file, by concept, by component)
- How many plans to break the audit into
- Whether to fix issues in-place or create a findings report first

## Deferred Ideas
- None
