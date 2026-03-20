# Phase 61 Context: Dynamic SGP Recalculation During Draft

## Decisions (LOCKED)

### Anchored Dynamic SGP
1. **Start with static SGP as baseline.** The pre-draft SGP values (computed from the full pool) are the anchor. Dynamic recalculation adjusts FROM this baseline as the draft progresses — it doesn't replace it.

2. **Recompute SGP denominators as pool shrinks.** As players are drafted, the remaining pool's category distributions change. Replacement levels shift. SGP denominators must update to reflect what's actually available, not what existed at draft start.

3. **Keep the 60/40 SGP/ASV blend with $33 threshold.** The blend formula stays: SGP*0.4 + ASV*0.6 for normal, raw SGP when SGP > ASV and ASV <= $33. Dynamic SGP changes the SGP input to the blend, not the blend itself.

4. **Hitter ASV floor stays.** Always willing to bid at least ASV for hitters. Dynamic SGP may push our value higher than ASV for some players (good — we'll bid more), but never below ASV.

5. **SP tier caps are final for ranked SPs.** Dynamic SGP does not override the SP tier cap system. For top-60 PL-ranked SPs, tier cap = floor AND ceiling regardless of what dynamic SGP says.

### Simulator Fixes (Must Ship With This Phase)
6. **Opponents nominate top ~10 available by ASV** (not random). Already implemented in simulator.

7. **Skip hitters with ASV < $3 while real hitters available.** Already implemented. Must verify bench filling works when pool thins.

8. **Simulator must draft RPs.** Current sim has 5.0 avg RPs but they're all showing as SPs in the mode roster. Verify RP detection and bidding.

9. **Validate roster completion.** Sim must fill all 28 slots — 16 hitters (including 2 bench), 12 pitchers (including 3 bench). Current sim sometimes leaves hitter slots empty.

## Reference: Attached Strategy Document (Critically Adapted)

The user provided a "Roto Auction Strategy" document. Key concepts to adopt, adapted to our system:

### What We Should Adopt
- **Live replacement level updates** — as top players are drafted, replacement level shifts. Our static replacement level (computed once from full pool) gets stale mid-draft.
- **Category gap targeting with need multiplier** — track progress toward category targets, weight bids toward categories where we have gaps. Our system has category targets (CATEGORY_RANK_TARGETS) but doesn't use them in bid computation.
- **Per-pick pool recalculation** — after each pick, remove player, recompute SGP, update inflation. The real-time loop concept.

### What We Already Have (Don't Rebuild)
- **SGP calculation** — our `computeSGP()` in both engine and simulator already does this. Just needs to run per-pick instead of once.
- **Inflation tracking** — we already compute `inflationFactor` per-pick in the simulator. Engine has it too.
- **Dollar conversion** — our SGP-to-dollar conversion already works.
- **Positional adjustment** — we have positional weights (+1 to +4) already.

### What's Wrong With The Document (Don't Copy Blindly)
- **Budget split 65-70% hitters** — our league data says 73-77% hitter spend. The doc's split is generic, not calibrated to our 13-team OPS league.
- **Simple inflation formula** — `remaining_budget / remaining_value` is naive. Need to handle edge cases (remaining_value near 0, early draft inflation spikes).
- **"Need multiplier" is vague** — needs specific implementation: how much to boost/suppress, which categories, what's the curve. Can't just say "if gap is large, multiply > 1".
- **No concept of SP tier caps** — the doc treats all pitchers the same. Our system has a sophisticated SP tier system that must be preserved.
- **No concept of hitter ASV floor** — the doc would let us underbid on hitters the market values. Our floor prevents that.

### What's Currently Broken In Our System
- **Static SGP computed once** — `computeSGP()` runs on the full pool at draft start and never updates. As 200+ players get drafted, the denominators are stale.
- **No category need weighting** — we have CATEGORY_RANK_TARGETS but don't use them to influence bids. A team with 0 SB should bid more for SB contributors.
- **Simulator drafts too many cheap hitters** — the $0 ASV hitter problem. Fixed with the $3 threshold but needs validation.
- **Simulator may not be drafting RPs properly** — need to verify RP detection and composition.
- **Bench hitter filling** — sometimes ends draft with < 2 bench hitters.

## Claude's Discretion

- How to structure the recalculation loop (every pick, every N picks, per-wave)
- Whether to recompute in the simulator only (easier) or also in the live engine
- How to implement the need multiplier curve (linear, logarithmic, step function)
- Whether dynamic SGP changes should apply to the engine's bid-optimizer.ts or only strategy-caps.ts
- Test strategy — how to validate dynamic SGP improves outcomes vs static

## Deferred Ideas

- Live opponent modeling (tracking what categories opponents are targeting)
- Full Monte Carlo re-simulation after each pick (too slow for live draft)
- Category-aware nomination strategy (nominate players in categories opponents need)
