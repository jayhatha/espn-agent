# Phase 54: Auction Engine Test Suite - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Write tests for the extension's auction draft engine. Unit tests for core logic (bid ceiling, inflation, SGP, roster optimizer), simulation tests for strategy validation, and scenario tests for edge cases. Tests run in Node.js against the engine modules — no browser/DOM required.

</domain>

<decisions>
## Implementation Decisions

### Test Framework
- Use Vitest (already in the project for extension tests)
- Tests live in packages/extension/lib/engine/__tests__/
- Import engine modules directly — they're pure functions, no DOM dependency

### Unit Tests (Core Logic)
- **Bid ceiling**: price < model_value → BID, price > model_value → PASS, inflation/need adjustments
- **Inflation calculation**: inflation = money_remaining / value_remaining, band classification
- **SGP computation**: per-category SGP, replacement level, rate stat handling (OPS from components)
- **Roster optimizer**: budget constraint, slot filling, SP tier caps, no Phase 4 upgrades
- **Roster constraints**: cannot exceed roster size, cannot exceed budget, must fill all positions

### Simulation Tests (Strategy Validation)
- Run N simulated drafts using the existing draft-simulator
- Track: avg roster value, avg profit captured, category balance
- Compare value-drafting strategy against baseline

### Scenario Tests (Edge Cases)
- Early value run (bot should buy 1-2 bargains)
- Late auction inflation (bid ceilings increase)
- Position scarcity (priority increases for scarce positions)
- Endgame mode (budget ≤ $20 triggers value_per_dollar scoring)

### Claude's Discretion
- Exact test data fixtures (player pools, mock projections)
- How many simulation iterations for CI speed vs accuracy tradeoff
- Whether to use snapshot testing for SGP vectors
- Test naming conventions

</decisions>

<specifics>
## Specific Ideas

- Reference spec: auction_bot_test_suite.md in project root
- Reference system spec: fantasy_auction_draft_system_spec.md
- Focus on testing the engine modules that were recently changed (OPS fix, roster optimizer value-drafting, SP tier caps)
- Keep tests fast — no DOM, no network, pure computation

</specifics>

<deferred>
## Deferred Ideas

- Real auction replay tests (need historical logs — not available yet)
- Nightly simulation runs (CI setup — separate phase)
- Parameter sweep optimization (separate phase)

</deferred>

---

*Phase: 54-auction-engine-test-suite*
*Context gathered: 2026-03-17*
