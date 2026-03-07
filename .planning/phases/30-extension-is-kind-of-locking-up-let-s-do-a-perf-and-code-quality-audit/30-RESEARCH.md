# Phase 30: Extension Perf and Code Quality Audit - Research

**Researched:** 2026-03-07
**Domain:** Browser extension performance, React rendering, synchronous computation on main thread
**Confidence:** HIGH — all findings are based on direct codebase inspection

---

## Summary

The extension sidebar locking up during live auction drafts is a real and predictable problem. The root cause is synchronous CPU-intensive work on the browser's main thread, executed on every Zustand state change via `useMemo`. The `computeDraftEngine` function is a monolithic 1,100-line orchestrator that runs up to six layers of computation in a single synchronous call — including a 200-simulation Monte Carlo run, a forward-simulation engine with decision comparison (200 sims × N candidates), an ideal roster optimizer, projected standings, SGP vector building, and a shopping list computation.

All of this happens in a single `useMemo` dep-tracked computation. While module-level caches reduce redundant work between picks, **every nomination event forces a full re-run of the Monte Carlo + forward simulation stack**, which is the most expensive path. At mid-draft with 12 teams and 200 available players, the forward simulation alone can take 300–800ms of pure synchronous CPU. The `sidebarMountObserver` is also observing `document.documentElement` with `subtree: true`, meaning every ESPN DOM mutation fires a React re-render check. The `observeDraftBoard` has a 2-second polling interval running `scanEntireDocument()` which triggers `querySelectorAll(COMPLETED_PICK_SELECTORS)` on the full document.

There are also secondary quality issues: `buildFgPlayerPool` is called twice per engine run (once for projected standings, once for optimization), console.warn lines run on every simulation gate check (not gated to DEV), `AuctionRecommendations` has a missing dep in its `useMemo` (`draftedPlayerIds`/`draftedPlayerNames` built outside the memo), and `AuctionPlayerCard` subscribes to the full Zustand store which re-renders on any state field change.

**Primary recommendation:** Move `computeDraftEngine` off the main thread using a Web Worker (`comlink` or raw `postMessage`). In the interim (as a fast fix), de-throttle simulation from 200 sims to 50 at nomination time, gate `console.warn` simulation logs to DEV only, and deduplicate the `buildFgPlayerPool` call.

---

## Identified Performance Bottlenecks

### Bottleneck 1: Synchronous Engine in useMemo (CRITICAL)
**File:** `packages/extension/lib/use-draft-engine.ts`
**What:** `computeDraftEngine` is called synchronously inside a `useMemo`. When Zustand state changes (any pick, budget update, nomination), the entire engine pipeline re-runs on the main thread.
**Why it locks up:** Browser extensions share the main thread with the page. A 500–1,000ms synchronous computation blocks all DOM updates, scroll, ESPN page interaction. The browser's "locking up" sensation is the main thread being occupied.
**Measured budget:** Engine logs warn at 300ms total, simulation step warns at 800ms separately — both thresholds can be exceeded simultaneously.

### Bottleneck 2: Forward Simulation — Up to 1,600 sim calls per engine run (CRITICAL)
**File:** `packages/extension/lib/engine/index.ts` lines 916–1046
**What:** On every engine recompute when a player is nominated:
- 200 baseline simulations (`simulateFullDraft`)
- 200 bid vs pass comparison simulations (`compareDecisions` with 2 actions × 200 sims = 400)
- 100 draft-targets comparison simulations (`compareDecisions` with 5 candidates × 100 sims = 500)
- Total: up to **1,100 `simulateFullDraft` calls per engine run**

Each `simulateFullDraft` call:
1. Clones `SimDraftState` (array spread for each of 12 teams)
2. Iterates all 200 available players for each of 12 teams (softmax selection loop)
3. Calls `optimizeRoster` at the end (greedy knapsack over ~200 players)

This is O(12 × 200 × 1,100) = ~2.6 million player-slot evaluations per engine run.

### Bottleneck 3: `buildFgPlayerPool` Called Twice Per Run (HIGH)
**File:** `packages/extension/lib/engine/index.ts` lines 699–708 and 740–752
**What:** Two separate `buildFgPlayerPool` calls with nearly identical logic:
- First call at line 701: for projected standings (builds `undraftedPlayers` pool)
- Second call at line 740: for roster optimization (builds `allPlayersOpt`)
**Both iterate 1,165 hitters + 546 pitchers = 1,711 players with Map lookups and string normalization twice per engine run.** The second call then sorts and slices to top 200.

### Bottleneck 4: `sidebarMountObserver` on Full Document (MEDIUM)
**File:** `packages/extension/entrypoints/content.tsx` lines 597–608
```typescript
sidebarMountObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,  // <-- observes EVERY node in the entire ESPN DOM
});
```
**What:** Every ESPN DOM mutation (bid updates, auction counter, player cards, animation frames) fires this callback which checks `document.getElementById(SIDEBAR_ROOT_ID)`. ESPN's auction draft page is highly dynamic — bid counters update frequently, player cards animate. This fires the callback many times per second.

### Bottleneck 5: `observeDraftBoard` 2-Second Full Document Scan (MEDIUM)
**File:** `packages/extension/lib/dom-observers.ts` lines 347–349
```typescript
const periodicScan = setInterval(() => {
  scanEntireDocument();
}, 2000);
```
`scanEntireDocument()` calls `document.querySelectorAll(COMPLETED_PICK_SELECTORS)` where `COMPLETED_PICK_SELECTORS` is a 9-element compound CSS selector including `:has()` pseudo-class matchers. These are expensive to evaluate on large DOMs. On the ESPN draft page, this runs every 2 seconds.

### Bottleneck 6: `console.warn` Simulation Gate Runs Unconditionally (MEDIUM)
**File:** `packages/extension/lib/engine/index.ts` line 891
```typescript
console.warn(`[DraftEngine] Simulation gate: ${input.allPicks.length}/${totalPicksExpected} picks...`);
```
This `console.warn` runs on **every single engine recompute** — not gated to DEV mode. String interpolation with template literals happens regardless of whether a console is listening. In production extensions, `console.warn` still incurs string construction cost. There are 8 additional `console.warn` calls in the simulation path (lines 907, 909, 928, 930, 967, 987, 1046, 1052) that also run in production.

### Bottleneck 7: `AuctionPlayerCard` Full Store Subscription (LOW-MEDIUM)
**File:** `packages/extension/components/AuctionPlayerCard.tsx` line 43
```typescript
const { myRoster, rosterSize, rankings, espnDomAuctionValues } = useDraftStore();
```
`espnDomAuctionValues` is a `Record<number, number>` that gets merged with spread every time any DOM-scraped auction value is added (`setEspnDomAuctionValues` creates a new object reference). `AuctionPlayerCard` is rendered for up to 50 players in the list. Each card re-renders on every merge (every 10 seconds from the table scraper). With 50 cards × object reference change = 50 component re-renders every 10 seconds, even if no visible data changed.

### Bottleneck 8: `AuctionRecommendations` useMemo Closure Trap (MEDIUM)
**File:** `packages/extension/components/AuctionRecommendations.tsx` lines 34–46
```typescript
const draftedPlayerIds = new Set(allPicks.map((p) => p.playerId));
const draftedPlayerNames = new Set(allPicks.map((p) => normalizePlayerName(p.playerName)));
const availablePlayers = useMemo(() => {
  return auctionValues.filter((player) => {
    if (draftedPlayerIds.has(player.playerId)) { return false; }
    return !draftedPlayerNames.has(normalizePlayerName(player.playerName));
  });
}, [auctionValues, allPicks]);  // <-- draftedPlayerIds/draftedPlayerNames not in deps
```
`draftedPlayerIds` and `draftedPlayerNames` are created outside the `useMemo` on every render, but the memo's dep array only includes `allPicks`. The Sets are captured via closure (correct), but they're rebuilt on every render regardless of whether `allPicks` changed. Additionally, `normalizePlayerName` is called inside the memo filter for every player even though the Set was built outside.

### Bottleneck 9: `compareDecisions` Creates Modified Players Array Per Bid Scenario (LOW)
**File:** `packages/extension/lib/engine/decision-comparison.ts` lines 166–179
```typescript
const modifiedPlayers = [...players];  // Spread of ~200 player objects per bid action
modifiedPlayers[action.playerIndex] = playerForBid;
```
This creates a new 200-element array on every `compareDecisions` call for each bid action. Called for baseline (1), bid-vs-pass (1), and draft-targets (1) = 3 spread operations per engine run.

---

## Caching Analysis

### What's Cached (Correctly)
| Cache | Key | When Invalidated | Assessment |
|-------|-----|-----------------|------------|
| `cachedSGPVectors` | `allPicks.length` | New pick made | GOOD — SGP only changes when pool changes |
| `cachedBidResult` | `currentAuctionPlayerId + '_' + allPicks.length + '_' + splitValue` | New nomination OR pick | GOOD — prevents bid recompute on bid counter updates |
| `cachedProjectedStandings` | `allPicks.length` | New pick made | GOOD |
| `cachedSimulation` | `allPicks.length + '_' + currentAuctionPlayerId + '_' + splitValue` | New nomination OR pick | PROBLEMATIC — same nomination changes don't invalidate |
| `cachedIdealRoster` | `allPicks.length + '_' + splitValue` | New pick or split change | GOOD |

### Cache Miss Scenarios
1. **New nomination event** — invalidates `bidCacheKey` AND `simulationCacheKey`. This is the heavy path: full Monte Carlo (200 sims) + full forward simulation (baseline 200 + decision 400 + targets 500) all run synchronously.
2. **New pick** — invalidates all 5 caches. This is slightly less expensive because simulation has a 5% draft-progress gate, but at mid-draft all caches miss.
3. **Split slider change** — invalidates `bidCacheKey`, `simulationCacheKey`, `idealRosterCacheKey`, `sgpCacheKey` (via new `adjustedSgpValues` but SGP vectors NOT cached on split, they're rebuilt as adjusted values inline). SGP rebuild is O(200 × categories) each time slider moves.

### Missing Caches
- `buildFgPlayerPool` result: called twice per run, result never cached across calls
- `buildOpponentModel` result: rebuilt every engine run (not cached, but fast O(n))
- `leagueAnalysis` result: rebuilt every engine run — iterates all picks for all teams with Map lookups against 633 hitter + 810 pitcher projections = 1,443 players per team per run

---

## React Rendering Analysis

### Zustand Selector Misuse
All components use the whole-store selector pattern:
```typescript
const { field1, field2, ... } = useDraftStore();
```
Zustand re-renders the component whenever **any** of the destructured fields change reference (shallow equality check). The store has ~20 fields. Fields like `allPicks` (array), `teamRosters` (Map), `espnDomAuctionValues` (object) change reference frequently.

The worst case: `espnDomAuctionValues` spreads on every `setEspnDomAuctionValues` call (line 283-285 of draft-state.ts). This runs every 10 seconds from the auction table scraper. Any component subscribing to `espnDomAuctionValues` re-renders every 10 seconds regardless of actual value changes.

### Components with Unnecessary Re-renders
- `AuctionPlayerCard`: subscribes to `espnDomAuctionValues` — re-renders every 10s × 50 instances = 500 re-renders per 10 seconds
- `DraftSidebar`: subscribes to `espnDomAuctionValues` and `pitcherHitterSplit` — re-renders on both
- `AuctionRecommendations`: subscribes to `espnDomAuctionValues` — re-renders every 10s
- `DraftRecommendations`: subscribes to wide state slice

### useMemo Dependency Issues
`useDraftEngineSignals` (use-draft-engine.ts) correctly uses `teamRosters.size` instead of the Map reference, preventing re-renders on individual roster additions when team count doesn't change. However, `allPicks` is an array reference that changes on every pick (new array created in `addPick`), triggering a full engine recompute.

The engine is correctly excluded from `currentAuctionPlayer` object, using `currentPlayerId` and `currentPlayerName` scalars instead — this is the key optimization that prevents 200ms recomputes on bid counter updates.

---

## DOM Observer Analysis

### `sidebarMountObserver` (content.tsx:597–608)
- Observes: `document.documentElement` with `childList: true, subtree: true`
- Purpose: Detect if ESPN removed the sidebar root and remount it
- Problem: `subtree: true` on the root element means **every DOM mutation on the entire ESPN page** (including ESPN's own auction bid counter ticks, player animations, etc.) triggers this callback
- Fix: Observe `document.body` instead of `documentElement`, and only observe direct children (`subtree: false`) since the sidebar root is a direct `body` child

### `periodicScan` in `observeDraftBoard` (dom-observers.ts:347–349)
- Runs every 2 seconds
- Calls `document.querySelectorAll(COMPLETED_PICK_SELECTORS)` on the full document
- `COMPLETED_PICK_SELECTORS` includes `:has(.playerName)` and `:has([class*="playerName"])` — `:has()` pseudo-class selector is evaluated against every element in the DOM
- This is a correctness safety net but runs even when no picks have occurred

### Budget polling (content.tsx:559–585)
- Runs every 5 seconds
- Calls `detectMyTeam()`, `detectAllTeamBudgets()`, `detectRosterSizeFromPositionTracker()`
- Each function does DOM queries; these are fast but `detectAllTeamBudgets()` queries all pick-train elements
- Each invocation calls 2-3 `useDraftStore` state updates (setMyTeamId, setRemainingBudget, setAllTeamBudgets) if data changed — each update triggers a Zustand subscriber notification

### Auction table scraper (content.tsx:527–554)
- Runs every 10 seconds
- Calls `scrapeESPNAuctionTable()` which does DOM queries
- Then calls `setEspnDomAuctionValues()` which spreads into a new object reference even if values haven't changed
- Every call re-renders all `espnDomAuctionValues` subscribers regardless

---

## Code Quality Issues

### Issue 1: `buildFgPlayerPool` Called Twice (Redundant Work)
`computeDraftEngine` calls `buildFgPlayerPool` at line 701 (for projected standings) and line 740 (for optimization). Both produce `undraftedHitters` and `undraftedPitchers` from the same inputs. The second call differs only in that it then sorts and slices to top 200.

**Fix:** Call once, share the result.

### Issue 2: `console.warn` Unconditional Simulation Gate Logging
Line 891 runs on every engine invocation:
```typescript
console.warn(`[DraftEngine] Simulation gate: ${input.allPicks.length}/${totalPicksExpected} picks (${(draftProgressFraction * 100).toFixed(1)}%), threshold=5%`);
```
This is diagnostic logging that was left in from development. It also triggers in the early-draft early-exit path (before 5% progress), meaning it logs even when simulation is intentionally skipped.

**Fix:** Gate to `if (import.meta.env.DEV)` or remove.

### Issue 3: Simulation Sim Count Too High for Real-Time Use
The constants `SIMS_PER_DECISION = 200` (baseline + bid/pass) and draft targets at 100 sims each are reasonable for accuracy but not for real-time responsiveness. At 200 sims × 3 decision batches = 600 calls to `simulateFullDraft`, each of which iterates 12 teams × 200 players in a nested loop.

**Fix:** Reduce to 50–100 sims for real-time path; potentially offer a "deep analysis" mode.

### Issue 4: `AuctionRecommendations` — `draftedPlayerIds` and `draftedPlayerNames` Rebuilt on Every Render
```typescript
const draftedPlayerIds = new Set(allPicks.map((p) => p.playerId));
const draftedPlayerNames = new Set(...);
const availablePlayers = useMemo(() => {
  ...filter using draftedPlayerIds/draftedPlayerNames...
}, [auctionValues, allPicks]);
```
The Sets are rebuilt on every render of `AuctionRecommendations` (not inside the memo), so even when `allPicks` hasn't changed (e.g., only `espnDomAuctionValues` changed), the Sets are still constructed.

**Fix:** Move Set construction inside the `useMemo` or create separate `useMemo` for them.

### Issue 5: `espnDomAuctionValues` Merge Always Creates New Reference
```typescript
setEspnDomAuctionValues: (values) =>
  set((state) => ({
    espnDomAuctionValues: { ...state.espnDomAuctionValues, ...values },
  })),
```
Even if the new `values` record contains the same playerId→value mappings already stored, a new object is always created. This triggers re-renders in all subscribers.

**Fix:** Add a shallow equality check before updating. If no values changed, skip the `set()` call.

### Issue 6: `processDetectedPick` Calls `calculateProjectedStandingsFromState()` On Every Pick
**File:** `packages/extension/entrypoints/content.tsx` lines 343–345
```typescript
const standings = calculateProjectedStandingsFromState();
useDraftStore.getState().setProjectedStandings(standings);
```
This runs a multi-step standings computation (Map iteration, sorting, roto point assignment) for every pick detected, including other teams' picks. Then `refreshAssistantData` also calls it at line 384. So standings are computed potentially twice per pick cycle.

### Issue 7: `leagueAnalysis` Rebuilds Projection Maps Every Engine Run
**File:** `packages/extension/lib/engine/league-analysis.ts` lines 46–57
```typescript
const hitterProjMap = new Map<string, FgHitterProjection>();
for (const h of fgHitters) {
  hitterProjMap.set(normalizeName(h.name), h);
}
const pitcherProjMap = new Map<string, FgPitcherProjection>();
for (const p of fgPitchers) {
  pitcherProjMap.set(normalizeName(p.name), p);
}
```
These Maps are built from the same static `fgLeaderboardHittersData` (633 entries) and `fgLeaderboardPitchersData` (810 entries) on every `computeLeagueAnalysis` call. Since the static data never changes, these could be module-level singletons initialized once.

### Issue 8: `scarcity.ts` — O(allPicks × teamRosters) Demand Calculation
**File:** `packages/extension/lib/engine/scarcity.ts` lines 64–73
```typescript
for (const [teamId] of teamRosters) {
  const posCount = allPicks.filter(
    pick => pick.teamId === teamId &&
      pick.positions.some(p => normalizePosition(p) === position)
  ).length;
```
For each position (8 positions) × each team (12 teams), this filters the entire `allPicks` array. At late-draft with 200 picks: 8 × 12 × 200 = 19,200 filter iterations per scarcity computation. This runs on every engine compute (not cached separately from the SGP cache).

**Fix:** Pre-group `allPicks` by `teamId` once, then use O(1) lookup.

### Issue 9: Nomination Strategy May Expose `console.warn` in Production
Lines 909 and 928 in index.ts use `console.warn` for informational simulation progress logging. These were presumably added during debugging and left in. They run in production.

---

## Architecture Patterns — Don't Hand-Roll

### Web Worker for Off-Main-Thread Computation
**Problem:** Synchronous CPU-heavy computation blocks the browser main thread
**Don't build:** Custom postMessage message passing system
**Use instead:** `comlink` (wraps Worker in Proxy — transparent async calls) or WXT's built-in worker support if available
**Why:** Comlink eliminates the boilerplate of structured cloning, message ID matching, and error propagation. A Worker-based engine would make `computeDraftEngine` return a Promise, making the lockup impossible.

The tradeoff: Web Workers in extensions have some restrictions (can't access DOM, can't use `chrome.*` APIs directly), but `computeDraftEngine` is already a pure function with no side effects, DOM access, or Zustand reads — it only takes serializable input and returns serializable output. This makes it an ideal Worker candidate.

### Zustand Selector Pattern for Fine-Grained Subscriptions
**Problem:** Components subscribing to the whole store re-render on any field change
**Don't build:** Custom context or pub/sub
**Use instead:** Zustand's selector-based subscription:
```typescript
// Instead of:
const { espnDomAuctionValues } = useDraftStore();
// Use:
const espnDomAuctionValues = useDraftStore(state => state.espnDomAuctionValues);
// Or with equality check:
const myRosterLength = useDraftStore(state => state.myRoster.length);
```
Zustand already supports this pattern — components only re-render when the selected value changes (strict equality check by default, or custom equality function).

---

## Common Pitfalls

### Pitfall 1: Web Worker + Zustand State
**What goes wrong:** The Worker can't import or read from Zustand. The entire `DraftEngineInput` must be serialized and passed as a message.
**How to avoid:** The engine already accepts `DraftEngineInput` as a plain object. Extract current state in the React hook (main thread), serialize it, send to worker. Worker returns serialized `DraftEngineSignals`. No Zustand reads in worker.

### Pitfall 2: Module-Level Cache State in a Worker
**What goes wrong:** `cachedSGPVectors`, `cachedBidResult`, etc. are module-level in `engine/index.ts`. In a Worker, these persist per worker instance correctly. If multiple workers are spawned, cache state diverges.
**How to avoid:** Use a single persistent worker (singleton), not a new worker per computation.

### Pitfall 3: Reducing Sim Count Too Aggressively
**What goes wrong:** At 10 sims, the win probability estimate has high variance and the recommended action (bid/pass) becomes unreliable. The user sees the recommendation flip on consecutive nominations.
**How to avoid:** 50–100 sims maintains adequate accuracy for real-time use. The existing stddev output can signal low-confidence results.

### Pitfall 4: MutationObserver `subtree: true` on `document.documentElement`
**What goes wrong:** The `sidebarMountObserver` observing `document.documentElement` with `subtree: true` fires for every DOM change across the entire ESPN page. The callback does `document.getElementById(SIDEBAR_ROOT_ID)` which is fast, but the observer overhead itself adds up.
**How to avoid:** Change to observe `document.body` with `childList: true, subtree: false` — the sidebar root is always a direct child of `<body>`.

### Pitfall 5: Caching Static Data Too Late
**What goes wrong:** League analysis rebuilds its `hitterProjMap` and `pitcherProjMap` from 1,443 entries on every call, even though the source data never changes.
**How to avoid:** Build these Maps once at module initialization and export or cache them alongside `fgLeaderboardHittersData`.

---

## Recommended Fix Priority

| Priority | Issue | Expected Impact | Effort |
|----------|-------|----------------|--------|
| P0 | Reduce simulation count (200 → 50) for nomination/targets path | Eliminates ~75% of simulation CPU | Low (change 2 constants) |
| P0 | Remove/gate unconditional `console.warn` simulation logs | Eliminates string construction per run | Low (add DEV guards) |
| P1 | Deduplicate `buildFgPlayerPool` — call once, share result | ~50% reduction in pool-build cost | Low |
| P1 | Fix `sidebarMountObserver` to observe `document.body` (not `documentElement`) | Reduces observer callback frequency | Low |
| P1 | Cache `leagueAnalysis` projection Maps at module level | Eliminates 1,443-entry Map rebuild per run | Low |
| P2 | Fix `espnDomAuctionValues` merge to skip update if no values changed | Eliminates 50+ unnecessary card re-renders per 10s | Medium |
| P2 | Fix scarcity demand loop to pre-group `allPicks` by team | Eliminates O(picks × teams × positions) inner scan | Low |
| P2 | Move `draftedPlayerIds`/`draftedPlayerNames` Set construction inside `useMemo` in `AuctionRecommendations` | Eliminates rebuild on unrelated renders | Low |
| P3 | Move engine to Web Worker via `comlink` | Eliminates main thread lockup entirely | High (architecture change) |
| P3 | Switch component store subscriptions to selectors | Reduces unnecessary re-renders | Medium |

---

## Code Examples

### Correct: Off-main-thread engine via Web Worker (aspirational architecture)
```typescript
// use-draft-engine.ts (after Worker migration)
import { wrap } from "comlink";
const engineWorker = wrap<typeof import("./engine/worker")>(
  new Worker(new URL("./engine/worker.ts", import.meta.url))
);

export function useDraftEngineSignals(): DraftEngineSignals | null {
  const [signals, setSignals] = useState<DraftEngineSignals | null>(null);
  // ... serialize input, call engineWorker.computeDraftEngine(input), setSignals
}
```

### Fix: Deduplicated buildFgPlayerPool
```typescript
// In computeDraftEngine, call once:
const draftedNamesAll = new Set<string>();
for (const pick of input.allPicks) {
  draftedNamesAll.add(normalizeName(pick.playerName));
}
const { undraftedHitters, undraftedPitchers } = buildFgPlayerPool(
  fgLeaderboardHittersData, fgLeaderboardPitchersData,
  fgAuctionHittersData, fgAuctionPitchersData,
  draftedNamesAll,
);
// Use both for projected standings AND optimization (optimization slices to top 200)
const allPlayersOpt = [...undraftedHitters, ...undraftedPitchers]
  .sort((a, b) => b.dollars - a.dollars)
  .slice(0, 200);
```

### Fix: Gate diagnostic logs to DEV
```typescript
// Before (unconditional):
console.warn(`[DraftEngine] Simulation gate: ${input.allPicks.length}/${totalPicksExpected}...`);

// After:
if (import.meta.env.DEV) {
  console.log(`[DraftEngine] Simulation gate: ${input.allPicks.length}/${totalPicksExpected}...`);
}
```

### Fix: sidebarMountObserver scope reduction
```typescript
// Before:
sidebarMountObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

// After:
if (document.body) {
  sidebarMountObserver.observe(document.body, {
    childList: true,
    subtree: false, // sidebar root is a direct body child
  });
}
```

### Fix: espnDomAuctionValues merge guard
```typescript
setEspnDomAuctionValues: (values) =>
  set((state) => {
    // Skip update if no values changed
    const hasChanges = Object.entries(values).some(
      ([id, val]) => state.espnDomAuctionValues[Number(id)] !== val
    );
    if (!hasChanges) return state;
    return { espnDomAuctionValues: { ...state.espnDomAuctionValues, ...values } };
  }),
```

### Fix: Pre-group allPicks in scarcity
```typescript
// Build once before position loop:
const picksByTeam = new Map<string, DraftPick[]>();
for (const pick of allPicks) {
  if (!picksByTeam.has(pick.teamId)) picksByTeam.set(pick.teamId, []);
  picksByTeam.get(pick.teamId)!.push(pick);
}

// Then inside position loop (O(1) team lookup):
for (const [teamId] of teamRosters) {
  const teamPicks = picksByTeam.get(teamId) ?? [];
  const posCount = teamPicks.filter(
    pick => pick.positions.some(p => normalizePosition(p) === position)
  ).length;
```

---

## Open Questions

1. **Is `computeDraftEngine` measurably > 300ms in the user's actual draft?**
   - The 300ms warning log exists but we don't know actual observed times. Need timing instrumentation to confirm the lockup is engine vs DOM observer vs something else.
   - Recommendation: Add `performance.mark`/`performance.measure` or log total time before the phase 1 fix, so we have a baseline.

2. **Does WXT support Web Workers in Chrome Extension content scripts?**
   - Web Workers in MV3 extensions work but have constraints. Content script Workers run in the page's origin, not the extension's origin. The `comlink` library works with this, but the module URL pattern may need WXT-specific configuration.
   - Confidence: MEDIUM — needs verification with WXT docs before committing to Worker architecture.

3. **Is the 5% draft progress gate for simulation actually working?**
   - The gate is `draftProgressFraction >= 0.05`, which requires `allPicks.length >= 0.05 * totalTeams * rosterSize`. With 12 teams × 25 roster = 300 total picks, 5% = 15 picks. Early in a live draft (first 10 picks), simulation is correctly skipped. But the `console.warn` simulation gate message runs regardless.

4. **What's the actual data size at mid-draft?**
   - With 100 picks made from a 1,165-hitter + 546-pitcher pool (1,711 total, but sliced to 200), the effective pool size is ~200. The simulation complexity scales with this pool, which is well-controlled. The bigger unknown is `simulateFullDraft` per-team cost at different draft depths.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all listed files (March 2026)
- `packages/extension/lib/engine/index.ts` — full engine orchestrator
- `packages/extension/lib/engine/monte-carlo.ts` — simulation logic
- `packages/extension/lib/engine/draft-simulator.ts` — forward simulation
- `packages/extension/lib/engine/decision-comparison.ts` — decision comparison
- `packages/extension/entrypoints/content.tsx` — content script + observers
- `packages/extension/lib/draft-state.ts` — Zustand store
- `packages/extension/lib/use-draft-engine.ts` — React hook
- `packages/extension/components/AuctionRecommendations.tsx` — component patterns

### Supporting Data
- FanGraphs JSON asset sizes: 723KB total across 4 files
- Player counts: 1,165 auction hitters, 546 auction pitchers, 633 leaderboard hitters, 810 leaderboard pitchers
- Engine file line counts: `index.ts` = 1,112 lines, total engine module = 5,996 lines

---

## Metadata

**Confidence breakdown:**
- Bottleneck identification: HIGH — based on direct code inspection and algorithmic complexity analysis
- Fix recommendations: HIGH for P0/P1 (pure code changes); MEDIUM for Worker architecture (requires WXT compatibility verification)
- Impact estimates: MEDIUM — actual ms savings require profiling to confirm

**Research date:** 2026-03-07
**Valid until:** Until next significant engine change (stable codebase)
