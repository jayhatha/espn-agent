# Phase 61: Dynamic SGP Recalculation During Draft — Research

**Researched:** 2026-03-20
**Domain:** SGP valuation engine, auction draft simulator, replacement level theory
**Confidence:** HIGH (all findings based on direct codebase inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### What We Should Adopt (from reference doc)
- Live replacement level updates
- Category gap targeting with need multiplier
- Per-pick pool recalculation

### What We Already Have (Don't Rebuild)
- SGP calculation (computeSGP() in both engine and simulator)
- Inflation tracking
- Dollar conversion
- Positional adjustment (weights +1 to +4)

### What's Currently Broken In Our System
- Static SGP computed once — never updates as pool shrinks
- No category need weighting in bids
- Simulator may not draft RPs properly
- Bench hitter filling issues

### Claude's Discretion
- How to structure the recalculation loop (every pick, every N picks, per-wave)
- Whether to recompute in the simulator only (easier) or also in the live engine
- How to implement the need multiplier curve
- Whether dynamic SGP changes should apply to bid-optimizer.ts or only strategy-caps.ts
- Test strategy

### Deferred Ideas (OUT OF SCOPE)
- Live opponent modeling
- Full Monte Carlo re-simulation after each pick
- Category-aware nomination strategy
</user_constraints>

---

## Summary

Phase 61 has two distinct workstreams: (1) dynamic SGP recalculation and (2) simulator correctness fixes. These are deeply interconnected — the simulator is both the test harness for dynamic SGP and the system with broken RP/hitter behavior.

The core SGP computation (`computeSGP()` in `tools/simulate-auction.ts`, `buildSGPVectors()` in `packages/extension/lib/engine/sgp.ts`) is pure and stateless — it takes a player array and returns a parallel SGP array. Dynamic SGP is therefore a matter of calling this function again with a filtered player array (only undrafted players) at the right moments, then using the new SGP values to compute `sgpDollars` in the bid function.

The live engine (`packages/extension/lib/engine/index.ts`) already has a two-level cache keyed on `allPicks.length`. The SGP cache key (`sgpCacheKey`) invalidates whenever picks are made. This architecture means dynamic SGP is already partially supported at the structural level — we need to change what player array is passed to `buildSGPVectors()` (filter out drafted players) rather than rebuild the pipeline.

The simulator bugs (RP mode roster appearing as SPs, bench hitter slots not filling) are separate from dynamic SGP but must be verified and fixed in this phase per the locked decisions.

**Primary recommendation:** Implement dynamic SGP in the simulator first (one file, easy to test), verify with simulation results, then mirror the approach in the live engine's bid-optimizer-worker.

---

## Standard Stack

### Core (no new libraries needed)
| Component | Location | Purpose |
|-----------|----------|---------|
| `computeSGP()` | `tools/simulate-auction.ts` | Simulator's inline SGP — pure function, reuse as-is |
| `buildSGPVectors()` | `packages/extension/lib/engine/sgp.ts` | Live engine SGP — pure function, takes PoolPlayer[] |
| `bid-optimizer-worker.ts` | `packages/extension/lib/engine/` | Worker that calls buildSGPVectors + computeMaxBid |
| SGP cache in `index.ts` | `packages/extension/lib/engine/index.ts` | Already keyed on `allPicks.length` — updates each pick |

No new npm packages required. This is all pure TypeScript manipulation of existing data structures.

---

## Architecture Patterns

### How SGP Currently Flows (Static — Today)

```
Main (simulate-auction.ts):
  players = buildPlayerPool()         // full pool, all players
  sgpValues = computeSGP(players)     // computed ONCE, never updated

  loop (each nomination):
    sgpDollars = (sgpValues[nomIdx] / totalPositiveSGP) * totalLeagueBudget
    // sgpValues[nomIdx] never changes — replacement level is always the full-pool level
```

```
Live engine (index.ts → bid-optimizer-worker.ts):
  cachedSGPVectors — keyed on allPicks.length
  buildSGPVectors(allPlayers, ...)    // "allPlayers" = full pool including drafted players
  // Drafted players are in the pool — replacement level includes them
```

**The problem:** Replacement level is computed from the full pool. As the 200th-best player gets drafted, the 201st becomes the new replacement level — but the old SGP denominator still uses the 200th player. The SGP spread narrows correctly in the model only if we recompute with the remaining pool.

### Pattern 1: Per-Pick Dynamic SGP (Simulator)

**What:** Recompute `computeSGP(available players only)` before each nomination.
**When to use:** Inside `simulateAuction()`, at the top of the while loop.
**Frequency:** Every pick (pool shrinks by 1 each time — O(n) is acceptable since n starts ~400).

```typescript
// In simulateAuction(), inside the while loop:
const availablePlayersArr = Array.from(available).map(i => players[i]);
const dynamicSGP = computeSGP(availablePlayersArr);

// Build index map: original player index → dynamic SGP value
const dynamicSGPByOrigIdx = new Map<number, number>();
for (let j = 0; j < availablePlayersArr.length; j++) {
  const origIdx = Array.from(available)[j];  // or pre-build an array
  dynamicSGPByOrigIdx.set(origIdx, dynamicSGP[j]);
}

const totalPositiveSGP = dynamicSGP.reduce((s, v) => s + Math.max(0, v), 0);

// Then in the nomination/bid section:
const playerSGP = Math.max(0, dynamicSGPByOrigIdx.get(nomIdx) ?? 0);
const sgpDollars = totalPositiveSGP > 0
  ? (playerSGP / totalPositiveSGP) * totalLeagueBudget
  : player.dollars;
```

**Performance note:** `computeSGP` is O(n × cats) = O(400 × 10) = 4000 ops. With 400 picks per sim and 2000 sims, that's 400 × 2000 = 800,000 calls, each 4000 ops = 3.2 billion simple ops. This will be slow — see Pitfall 2 below for the mitigation strategy.

### Pattern 2: Anchor Blending (Static baseline + dynamic delta)

Per the locked decision, dynamic SGP adjusts FROM the static baseline:

```typescript
// Pre-compute static SGP from full pool (once, before loop)
const staticSGP = computeSGP(players);
const staticTotalPosSGP = staticSGP.reduce((s, v) => s + Math.max(0, v), 0);

// In loop, compute dynamic:
const dynamicSGP = computeSGP(availablePlayersArr);
const dynamicTotalPosSGP = dynamicSGP.reduce((s, v) => s + Math.max(0, v), 0);

// For each player: blend static dollars with dynamic dollars
// e.g. 70% static anchor, 30% dynamic adjustment
const staticDollars = (Math.max(0, staticSGP[origIdx]) / staticTotalPosSGP) * totalLeagueBudget;
const dynamicDollars = (Math.max(0, dynamicSGPByOrigIdx.get(origIdx) ?? 0) / dynamicTotalPosSGP) * totalLeagueBudget;
const sgpDollars = staticDollars * 0.7 + dynamicDollars * 0.3;
```

**Recommendation:** Start with pure dynamic (Pattern 1) first. The "anchor from static baseline" decision means we don't hard-reset to static — it means we don't discard the static context. Pure dynamic actually handles this naturally: early in the draft, available pool ≈ full pool, so dynamic ≈ static. As pool thins, dynamic diverges correctly.

### Pattern 3: N-Pick Interval Recomputation (Performance Optimization)

Recompute every N picks instead of every pick:

```typescript
const RECOMPUTE_INTERVAL = 5; // recompute every 5 picks
let lastRecomputePickCount = 0;

if (available.size % RECOMPUTE_INTERVAL === 0 || dynamicSGPByOrigIdx.size === 0) {
  // recompute
}
```

**Tradeoff:** Less accurate (5-pick lag in replacement levels), but 5× faster. Given 400 picks per sim, this reduces recomputations from 400 to 80. **Recommended starting point.**

### Pattern 4: Category Need Multiplier

From locked decisions — category gap targeting with need multiplier:

```typescript
// After computing sgpDollars, apply need multiplier based on category gaps
// Example: if we're weak in SB, boost SB-contributor bids by 10-20%
function computeNeedMultiplier(
  player: PoolPlayer,
  myRoster: PoolPlayer[],
  categories: Category[]
): number {
  // For each category, measure our z-score relative to opponents
  // If we're weak in a category the player helps, boost value
  // If we're strong, no boost
  // Returns 1.0 (neutral) to 1.2 (20% boost)
  return 1.0; // placeholder — implement based on CATEGORY_RANK_TARGETS
}

const needMultiplier = computeNeedMultiplier(player, myRoster, CATEGORIES);
const adjustedSgpDollars = sgpDollars * needMultiplier;
```

**Scope clarification:** The need multiplier is listed under "What We Should Adopt" but CATEGORY_RANK_TARGETS already exists in `draft-constants.ts`. The multiplier adjusts `sgpDollars` before the ASV blend. It does NOT touch SP tier caps.

### Anti-Patterns to Avoid

- **Recomputing SGP every pick without caching the available array:** The `Array.from(available)` call inside a hot loop creates a new array every time. Pre-build an array of available indices and update it incrementally.
- **Applying dynamic SGP to SP tier cap logic:** Locked decision — SP tier caps are immutable for top-60 SPs. Dynamic SGP feeds the SGP/ASV blend, not the tier cap.
- **Computing totalPositiveSGP from the original `sgpValues` array after pool shrinks:** This over-counts SGP (drafted players still included). Must recompute from dynamic SGP array.

---

## Simulator Bugs — Root Cause Analysis

### Bug 1: RPs showing as SPs in mode roster

**Root cause (confirmed by code inspection):**

The `isSP()` function in the simulator:
```typescript
function isSP(player: PoolPlayer): boolean {
  return player.isPitcher && player.positions.some(p => p.toUpperCase() === "SP");
}

function isRP(player: PoolPlayer): boolean {
  return player.isPitcher && !isSP(player);
}
```

The mode roster display groups by `d.slot`, and ALL pitchers go to the `"P"` slot:
```typescript
function assignSlot(...): string | null {
  if (isPitcher) {
    if ((slots["P"] ?? 0) > 0) { slots["P"]--; return "P"; }
    if ((slots["BN"] ?? 0) > 0 && ...) { slots["BN"]--; ...; return "BN"; }
    return null;
  }
```

The simulator uses a single `"P"` slot for all pitchers (no SP/RP distinction at the slot level). The mode roster output shows "P" slots, so all 9 pitchers appear under "P". This means the mode roster display doesn't distinguish SP from RP — which may be the actual complaint. RPs ARE being drafted (confirmed: `rpDrafted` tracked, `rpCount` tracked in TeamState) — but they appear as "P" in the mode roster, not as separate "SP"/"RP" lines.

**Verification needed:** Run the sim and check whether `meanRPs` is near 5.0. If so, RP drafting is correct but display lumps them all under "P".

**Fix options:**
1. In `assignSlot()`, detect SP vs RP and assign "SP" or "RP" slot strings (just for display tracking).
2. Add a separate RP display section in the mode roster output.

### Bug 2: Bench hitter slots not filling

**Root cause (confirmed by code inspection):**

`canFillSlot()` for hitters checks:
```typescript
if ((slots["BN"] ?? 0) > 0 && (benchHitters ?? 0) < 2) return true;
```

`assignSlot()` for hitters:
```typescript
if ((slots["BN"] ?? 0) > 0 && (!team || team.benchHitters < 2)) {
  slots["BN"]--; team.benchHitters++; return "BN";
}
```

`computeOurBid()` checks `hitterSlotsRemaining`:
```typescript
const needBenchHitters = team.benchHitters < 2 && (team.slotsRemaining["BN"] ?? 0) > 0;
const hitterSlotsRemaining = hitterSlotsLeft + (needBenchHitters ? 1 : 0);
if (!player.isPitcher && asv < 3 && pricedHittersAvailable && hitterSlotsRemaining > 3) {
  return 0; // skip cheap hitters while good ones available
}
```

**The issue:** The "skip cheap hitters" guard (`asv < 3`) fires correctly early in the draft, but late in the draft when `pricedHittersAvailable` becomes false, we should start accepting cheap hitters. The condition `hitterSlotsRemaining > 3` is the throttle — when we have exactly 2 bench hitter slots left (BN), `hitterSlotsRemaining = 2` (≤ 3), so we stop skipping. This looks correct on paper.

**More likely issue:** The `HITTER_BUDGET_MAX` cap kicks in too aggressively. If `hitterSpent + bid > 220`, the bid gets clamped to `max(1, 220 - hitterSpent)`. Late in the draft, if hitterSpent is near 220 and there are still 2 bench hitter slots, bids will be $1 each — and in a competitive auction, $1 bids lose to any opponent who wants the player.

**Another likely issue:** The bench hitter count limit is 2 in both `canFillSlot` and `assignSlot`, but the ROSTER_SLOTS definition has `BN: 5`. The 5 BN slots are shared between hitters (max 2) and pitchers (max 3). If 3 pitchers fill BN before the 2 hitter spots, BN goes to 2, and we try to fill 2 more hitter BN spots but get `team.benchHitters = 0` and `slots["BN"] = 2` — this should work. But if the pitchers are drafting late, we might hit the "BN = 0" condition before hitters can fill their bench.

**Verification needed:** Add per-sim logging of final bench state to confirm which case is occurring.

### Bug 3: RP cap at 5 blocks bench RP when needed

```typescript
if (isRP(player)) {
  if (team.rpCount >= 5) return 0;  // hard cap
```

5 RPs + 7 SPs = 12 pitchers, which exactly fills 9 P slots + 3 BN pitcher slots. The cap seems correct for the target composition (7SP + 5RP). But if we end up with fewer than 7 SPs (e.g., couldn't win bids on them), we might need more RPs to fill the P slots — and the hard cap prevents it.

**Fix:** Make the RP cap conditional on total pitcher count: `if (isRP(player) && team.rpCount >= 5 && pitcherCount >= 12) return 0;`

---

## Code Examples

### Dynamic SGP in Simulator (minimal change)

The cleanest implementation adds a helper and changes `sgpValues[nomIdx]` to use fresh computation:

```typescript
// Before the while loop:
const staticSGPValues = computeSGP(players); // used as anchor/baseline
let dynamicSGPValues = staticSGPValues;     // starts identical to static
let lastAvailableSize = available.size;

// In the while loop, recompute when pool shrinks by N:
const RECOMPUTE_EVERY = 5;
if (lastAvailableSize - available.size >= RECOMPUTE_EVERY) {
  const availArr = Array.from(available);
  const availPlayers = availArr.map(i => players[i]);
  const freshSGP = computeSGP(availPlayers);
  // Map back to original indices
  dynamicSGPValues = new Array(players.length).fill(0);
  for (let j = 0; j < availArr.length; j++) {
    dynamicSGPValues[availArr[j]] = freshSGP[j];
  }
  lastAvailableSize = available.size;
}

// Replace: const playerSGP = Math.max(0, sgpValues[nomIdx]);
// With:
const playerSGP = Math.max(0, dynamicSGPValues[nomIdx]);
const totalPositiveSGP = dynamicSGPValues.reduce((s, v) => s + Math.max(0, v), 0);
```

**Critical:** `totalPositiveSGP` must also update — it currently uses the stale pre-loop value.

### Dynamic SGP in Live Engine

The live engine already has the infrastructure:

```typescript
// In index.ts, the SGP cache:
let cachedSGPVectors: SGPVectors | null = null;
let sgpCacheKey: string = '';  // invalidates on allPicks.length change

// Current computation (in runDraftEngine or buildSGPVectors call site):
// Change: pass only undrafted players
const draftedNames = new Set(input.allPicks.map(p => normalizeName(p.playerName)));
const availablePlayers = allPlayers.filter(p => !draftedNames.has(p.normalizedName));
cachedSGPVectors = buildSGPVectors(availablePlayers, categories, rosterSlots, totalTeams);
```

**Location to find the current call:** Search for `buildSGPVectors(` in `index.ts` to find where `allPlayers` is passed. The fix is to filter to undrafted players before this call.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SGP computation | Custom replacement level tracker | `computeSGP()` / `buildSGPVectors()` with filtered pool | These functions already do exactly this — just change the input array |
| Category need weighting | New weighting system | Multiplier on top of existing `sgpDollars` | The blend (`sgpDollars * SGP_WEIGHT + asv * ...`) is the correct abstraction point |
| RP slot tracking | New slot type system | Update `isRP()` display in mode roster | RPs are already tracked (`rpCount`) — just fix the display |

---

## Common Pitfalls

### Pitfall 1: Forgetting to update `totalPositiveSGP` alongside dynamic SGP values

**What goes wrong:** `sgpDollars = (playerSGP / totalPositiveSGP) * budget`. If `playerSGP` is recalculated with dynamic replacement levels but `totalPositiveSGP` still reflects the full-pool static total, the dollar conversion is wrong — values will be inflated because we're dividing by a larger-than-correct denominator.

**How to avoid:** Always recompute `totalPositiveSGP` from the same `dynamicSGPValues` array used for `playerSGP`.

### Pitfall 2: Performance regression from per-pick SGP recomputation

**What goes wrong:** 2000 sims × 400 picks × O(n_players × n_cats) recomputation = very slow. The sim currently completes in ~10 seconds. Per-pick recomputation could push this to 60-120 seconds.

**How to avoid:** Use interval recomputation (every 5 picks). The replacement level doesn't shift dramatically pick-by-pick — it shifts meaningfully after waves of picks. Every 5 picks is a good balance between accuracy and performance.

**Warning signs:** If the sim takes >30 seconds, interval is too small. Start with 10-pick intervals and measure.

### Pitfall 3: Dynamic SGP array index misalignment after filtering

**What goes wrong:** `computeSGP(availablePlayers)` returns an array indexed 0..N where N = available players. But `players[nomIdx]` is indexed into the original full-pool array. After filtering, `dynamicSGP[j]` must be mapped back to `players[availArr[j]]`.

**How to avoid:** Build the mapping explicitly:
```typescript
const availArr = Array.from(available);
const dynamicSGP = computeSGP(availArr.map(i => players[i]));
// dynamicSGP[j] = SGP for players[availArr[j]]
const dynamicByOrigIdx = new Map(availArr.map((origIdx, j) => [origIdx, dynamicSGP[j]]));
```

### Pitfall 4: SP tier cap gets bypassed by need multiplier

**What goes wrong:** If a need multiplier boosts `sgpDollars` for an SP dramatically (say we're weak in Ks), `sgpDollars` might exceed the tier cap and get applied instead.

**How to avoid:** The need multiplier must be applied BEFORE the SP tier cap check in the bid pipeline. The tier cap is applied last (for ranked SPs, it's the final return). The current `computeOurBid()` structure already handles this correctly: SGP blend → strategy caps → SP tier cap. Just ensure the need multiplier feeds into `sgpDollars`, not into `bidCap`.

### Pitfall 5: Overprice scoring for nomination strategy uses stale static SGP

**What goes wrong:** `overpricingScores` is computed once before the loop:
```typescript
const overpricingScores = players.map((p, i) => {
  const sgpD = totalPositiveSGP > 0
    ? (Math.max(0, sgpValues[i]) / totalPositiveSGP) * totalLeagueBudget : p.dollars;
  return asv - sgpD; // higher = more overpriced
});
```

If SGP values update but `overpricingScores` doesn't, our nomination strategy uses stale overpricing data.

**How to avoid:** Either recompute `overpricingScores` with the same frequency as SGP values, or accept that nomination strategy has a small lag (lower priority fix, since nomination strategy logic is deferred per phase constraints).

---

## Open Questions

1. **Category need multiplier: what curve?**
   - What we know: CATEGORY_RANK_TARGETS exists (`OPS: 3, HR: 3, SB: 4, etc.`). Category gap signals exist in live engine (`computeCategoryGaps`). The simulator has no category gap tracking per team.
   - What's unclear: How to measure "weakness" in the simulator (no league-wide category totals mid-draft). In the live engine, we have opponent roster data.
   - Recommendation: In the simulator, track per-team cumulative category stats. Compare to league average. Apply multiplier when our z-score for a category is below -0.5.

2. **Should dynamic SGP go into the live engine this phase or only the simulator?**
   - What we know: The live engine already has cache invalidation on pick count. The fix is to filter `allPlayers` before calling `buildSGPVectors()`. This is a 3-line change in `index.ts`.
   - What's unclear: Whether the performance impact is acceptable in the Chrome extension (single-threaded). The bid optimizer runs in a worker.
   - Recommendation: YES, apply to live engine too. The change is small and the cache already ensures it only recomputes on new picks.

3. **RP mode roster bug: display or real drafting issue?**
   - What we know: `rpCount` is tracked in TeamState. `isRP()` correctly identifies non-SP pitchers. The mode roster groups by `d.slot` which is always "P" for pitchers.
   - What's unclear: Are RPs actually being drafted at the correct rate (~5 per team), or are they being classified as SPs?
   - Recommendation: Add an RP-specific display section to the mode roster output. Also log per-sim RP count to confirm ~5 are being drafted.

4. **Bench hitter filling: is the issue budget exhaustion or slot competition?**
   - What we know: The `hitterSpent + bid > HITTER_BUDGET_MAX` cap at $220 can clamp late-draft bids to $1, causing losses at auction.
   - What's unclear: Whether the bench hitters are genuinely not being pursued, or being pursued and losing to opponents.
   - Recommendation: Add diagnostic output for final bench state per sim. Log whether bench hitter slots are filled at end of draft.

---

## Implementation Scope Recommendation (Claude's Discretion)

### Recalculation Frequency: Every 5 picks
- Justification: Replacement levels shift by ~0.5-1% per pick on average. A 5-pick lag introduces minimal error while keeping performance acceptable.
- Implementation: Track `lastRecomputeSize`, recompute when `available.size < lastRecomputeSize - 5`.

### Where to Apply: Simulator first, then live engine

**Simulator (tools/simulate-auction.ts):**
- Highest priority — this is the test harness
- Changes are isolated to one file
- Easy to verify via simulation output (compare results before/after)

**Live engine (packages/extension/lib/engine/index.ts):**
- Apply in same phase per locked decisions
- Change: filter `allPlayers` to undrafted before calling `buildSGPVectors()`
- The bid-optimizer-worker already receives the filtered pool in theory — confirm by reading the worker call site

### Need Multiplier: Simple z-score gate

For the simulator (which has no category tracking per team mid-draft), implement a simplified version:
- Track per-team category accumulation in `TeamState`
- After each pick, update the team's category totals
- Apply multiplier based on shortfall from `CATEGORY_RANK_TARGETS`

```typescript
// Multiplier curve: 1.0 (no need) to 1.15 (strong need)
// Applied to sgpDollars only, not to the SP tier cap
function needMultiplier(catDeficit: number): number {
  if (catDeficit <= 0) return 1.0;
  return Math.min(1.15, 1.0 + catDeficit * 0.05);
}
```

### Dynamic SGP vs bid-optimizer.ts

Dynamic SGP changes the `sgpDollars` computed inside `computeOurBid()` (simulator) and `computeMaxBid()` (live engine). It does NOT change `strategy-caps.ts`. The SP tier cap logic in strategy-caps.ts is downstream of `rawMaxBid` (which comes from `computeMaxBid()`). Dynamic SGP updates the input to `computeMaxBid()`, not the output capping.

---

## Sources

### Primary (HIGH confidence)
- Direct inspection of `/Users/jay-work/Code/espn-agent/tools/simulate-auction.ts` — full file read, all SGP and bid logic confirmed
- Direct inspection of `/Users/jay-work/Code/espn-agent/packages/extension/lib/engine/sgp.ts` — `buildSGPVectors()` function confirmed pure, takes PoolPlayer[]
- Direct inspection of `/Users/jay-work/Code/espn-agent/packages/extension/lib/engine/bid-optimizer.ts` — `computeMaxBid()` confirmed, blend logic confirmed
- Direct inspection of `/Users/jay-work/Code/espn-agent/packages/extension/lib/engine/strategy-caps.ts` — SP tier cap pipeline confirmed, need multiplier not yet present
- Direct inspection of `/Users/jay-work/Code/espn-agent/packages/extension/lib/engine/draft-constants.ts` — CATEGORY_RANK_TARGETS confirmed at lines 135-146
- Direct inspection of `/Users/jay-work/Code/espn-agent/packages/extension/lib/engine/index.ts` — SGP cache keys confirmed, live engine flow confirmed

---

## Metadata

**Confidence breakdown:**
- Simulator bug root causes: HIGH — traced through exact code paths
- Dynamic SGP implementation approach: HIGH — pure function inputs, simple array filtering
- Need multiplier curve values: MEDIUM — reasonable heuristic, needs empirical tuning
- Performance estimates: MEDIUM — based on rough op counts, not measured

**Research date:** 2026-03-20
**Valid until:** Until code changes in the 6 key files above
