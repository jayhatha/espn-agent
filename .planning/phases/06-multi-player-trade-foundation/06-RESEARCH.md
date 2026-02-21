# Phase 6: Multi-Player Trade Foundation - Research

**Researched:** 2026-02-20
**Domain:** Multi-player trade analysis, roster validation, component-based rate statistics
**Confidence:** MEDIUM-HIGH

## Summary

Phase 6 extends the existing 1-for-1 trade functionality to support N-for-M trades (up to 3-for-3) with accurate projected standings impact. The core technical challenge is validating that multi-player swaps maintain legal roster composition while accurately computing rate statistics using component-based math (never averaging rates).

The existing codebase already handles N-for-N trade simulation via array iteration in `TradeRecommendationAgent.simulateTradeImpact()` (lines 634-653), and component math formulas exist in `packages/shared/src/formulas.ts`. The primary gaps are: (1) roster slot validation for multi-player trades, (2) UI patterns for selecting multiple players, (3) category-by-category impact breakdown display, and (4) integration tests for component math accuracy.

Research reveals that roster validation requires position-eligibility matching algorithms, React checkbox patterns with useState perform well for <100 items, and floating-point precision testing requires `toBeCloseTo()` assertions. Fantasy sports platforms enforce roster constraints by validating position eligibility after trades, with common patterns being "shared position eligibility" or "batter/pitcher type matching."

**Primary recommendation:** Build roster validation logic using position-eligibility matching (check if resulting roster can fill all required slots), implement checkbox-based multi-select UI with React.memo optimization, add integration tests for component math using Vitest's toBeCloseTo(), and create category-impact breakdown tables reusing existing UI patterns from the trades page.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRADE-01 | User can propose an N-for-M trade (up to 3-for-3) and see projected standings impact per category | Existing agent already handles N-for-N via array iteration; UI needs checkbox multi-select pattern researched |
| TRADE-02 | System validates roster slot constraints before showing trade impact (prevents illegal trade proposals) | Position-eligibility matching algorithms researched; ESP roster validation patterns identified |
| TRADE-03 | User sees category-by-category impact breakdown (HR rank, RBI rank, AVG rank, etc.) for proposed multi-player trades | Existing trades page already shows category breakdown; pattern can be reused for multi-player |
| TRADE-04 | Trade simulation uses component-based rate stat math (H/AB not averaged rates) with integration tests | Component math formulas exist in shared package; Vitest toBeCloseTo() pattern researched for testing |
</phase_requirements>

## Standard Stack

### Core (Already in Codebase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Kysely | ~0.27.x | Type-safe SQL query builder | Already used throughout backend; handles complex queries for roster/projections |
| Fastify | 4.x | HTTP server framework | Already used for all API endpoints; supports rate limiting and middleware |
| Next.js | 14.x | Frontend framework with App Router | Already used for all UI pages; TanStack Query integration exists |
| TanStack Query | v5 | Data fetching and caching | Already used for all frontend queries; handles mutations well |
| Tailwind CSS | 3.x | Utility-first CSS framework | Already used for all styling; responsive patterns established |

### Supporting (For New Features)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | Latest | Testing framework | Integration tests for component math (TRADE-04); faster than Jest, Vite-native |
| React.memo | Built-in | Component memoization | Checkbox lists with 20+ players to prevent re-renders |
| TypeScript strict mode | Enabled | Type safety | Roster validation logic requires strong typing to prevent bugs |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Checkbox UI | Drag-and-drop (react-beautiful-dnd) | D&D adds complexity; checkboxes simpler for <100 players and already used in waiver page |
| Custom validation | Third-party constraint solver | Overkill for simple position eligibility; custom logic more maintainable |
| Jest | Vitest | Vitest faster and Vite-native; minimal migration effort from existing setup |

**Installation:**
```bash
# No new backend dependencies needed
# Frontend: React.memo is built-in
# Testing: Vitest likely already installed for backend tests
pnpm add -D vitest @vitest/ui --filter=backend
```

## Architecture Patterns

### Recommended Project Structure

Existing structure supports this phase without changes:
```
packages/backend/src/
├── agents/
│   └── trade-recommendation.ts      # Already handles N-for-N (extend for validation)
├── api/
│   └── recommendations.ts            # Add roster validation before analysis
packages/frontend/src/
├── app/leagues/[id]/trades/
│   └── page.tsx                      # Extend multi-select UI (checkboxes already used)
packages/shared/src/
├── formulas.ts                       # Component math (already complete)
└── types.ts                          # Add RosterValidationResult type
```

### Pattern 1: Roster Slot Validation Algorithm

**What:** Validate that post-trade roster can fill all required position slots using greedy matching
**When to use:** Before running expensive trade simulation; TRADE-02 requirement
**Example:**
```typescript
// Pattern based on ESPN/Yahoo roster constraint validation
interface RosterSlots {
  C: number;    // Catcher slots
  "1B": number; // First base slots
  "2B": number;
  SS: number;
  OF: number;   // Outfield slots
  UTIL: number; // Utility slots (any position)
  SP: number;   // Starting pitcher slots
  RP: number;   // Relief pitcher slots
  P: number;    // Pitcher slots (any type)
  BN: number;   // Bench slots (any position)
}

interface RosterPlayer {
  playerId: number;
  positions: string[]; // e.g., ["1B", "OF"]
}

function validateRosterSlots(
  currentRoster: RosterPlayer[],
  givePlayers: number[],
  receivePlayers: RosterPlayer[],
  rosterSlots: RosterSlots
): { isLegal: boolean; issues: string[] } {
  // 1. Build post-trade roster
  const postTradeRoster = currentRoster
    .filter(p => !givePlayers.includes(p.playerId))
    .concat(receivePlayers);

  // 2. Greedy position assignment (fill specific slots first, then UTIL/BN)
  const issues: string[] = [];
  const unassigned: RosterPlayer[] = [];
  const assigned = new Set<number>();

  // Sort slots by specificity (C, 1B, 2B, SS, OF, UTIL, P, SP, RP, BN)
  const slotOrder: (keyof RosterSlots)[] = [
    "C", "1B", "2B", "SS", "OF", "SP", "RP", "P", "UTIL", "BN"
  ];

  for (const slot of slotOrder) {
    const count = rosterSlots[slot] || 0;
    let filled = 0;

    for (const player of postTradeRoster) {
      if (assigned.has(player.playerId)) continue;

      // Check if player eligible for this slot
      const eligible = canFillSlot(player.positions, slot);
      if (eligible && filled < count) {
        assigned.add(player.playerId);
        filled++;
      }
    }

    if (filled < count) {
      issues.push(`Cannot fill all ${slot} slots (need ${count}, filled ${filled})`);
    }
  }

  // All players must be assigned
  for (const player of postTradeRoster) {
    if (!assigned.has(player.playerId)) {
      unassigned.push(player);
    }
  }

  if (unassigned.length > 0) {
    issues.push(`${unassigned.length} players cannot be assigned to roster slots`);
  }

  return {
    isLegal: issues.length === 0,
    issues
  };
}

function canFillSlot(playerPositions: string[], slot: string): boolean {
  // UTIL and BN can be filled by any position
  if (slot === "UTIL" || slot === "BN") return true;

  // P can be filled by SP or RP
  if (slot === "P") {
    return playerPositions.some(pos => pos === "SP" || pos === "RP");
  }

  // Specific slots require exact position match
  return playerPositions.includes(slot);
}
```

### Pattern 2: Checkbox Multi-Select with Performance

**What:** Checkbox-based player selection with memoization to prevent re-renders
**When to use:** Trade builder UI for selecting give/receive players; TRADE-01 requirement
**Example:**
```typescript
// Frontend pattern for multi-select with performance
import { useState, useCallback, memo } from "react";

interface Player {
  playerId: number;
  playerName: string;
  positions: string[];
  mlbTeam: string | null;
}

// Memoized checkbox row to prevent re-renders
const PlayerCheckboxRow = memo(({
  player,
  isChecked,
  onToggle,
  variant
}: {
  player: Player;
  isChecked: boolean;
  onToggle: (id: number, checked: boolean) => void;
  variant: "give" | "receive";
}) => {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onToggle(player.playerId, e.target.checked);
  }, [player.playerId, onToggle]);

  return (
    <label className="flex items-center border rounded-lg cursor-pointer hover:bg-gray-50">
      <div className="pl-3">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={handleChange}
          className={`h-4 w-4 border-gray-300 rounded focus:ring-${variant === "give" ? "red" : "green"}-500`}
        />
      </div>
      <div className="flex-1 px-3 py-2">
        <div className="font-medium text-gray-900">{player.playerName}</div>
        <div className="text-sm text-gray-500">
          {player.positions.join(", ")} • {player.mlbTeam}
        </div>
      </div>
    </label>
  );
});

function TradeBuilder({ roster, partnerRoster }: { roster: Player[], partnerRoster: Player[] }) {
  const [givePlayerIds, setGivePlayerIds] = useState<number[]>([]);
  const [receivePlayerIds, setReceivePlayerIds] = useState<number[]>([]);

  // Memoize toggle handlers to prevent PlayerCheckboxRow re-renders
  const handleToggleGive = useCallback((playerId: number, checked: boolean) => {
    setGivePlayerIds(prev =>
      checked ? [...prev, playerId] : prev.filter(id => id !== playerId)
    );
  }, []);

  const handleToggleReceive = useCallback((playerId: number, checked: boolean) => {
    setReceivePlayerIds(prev =>
      checked ? [...prev, playerId] : prev.filter(id => id !== playerId)
    );
  }, []);

  // Validation: limit to 3 players per side
  const canSelectMoreGive = givePlayerIds.length < 3;
  const canSelectMoreReceive = receivePlayerIds.length < 3;

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* You Give */}
      <div>
        <label className="block text-sm font-medium mb-3">
          You Give ({givePlayerIds.length}/3 selected)
        </label>
        <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-3">
          {roster.map(player => (
            <PlayerCheckboxRow
              key={player.playerId}
              player={player}
              isChecked={givePlayerIds.includes(player.playerId)}
              onToggle={handleToggleGive}
              variant="give"
            />
          ))}
        </div>
      </div>

      {/* You Receive */}
      <div>
        <label className="block text-sm font-medium mb-3">
          You Receive ({receivePlayerIds.length}/3 selected)
        </label>
        <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-3">
          {partnerRoster.map(player => (
            <PlayerCheckboxRow
              key={player.playerId}
              player={player}
              isChecked={receivePlayerIds.includes(player.playerId)}
              onToggle={handleToggleReceive}
              variant="receive"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Pattern 3: Component Math Integration Testing

**What:** Test that multi-player rate stats use component aggregation, not rate averaging
**When to use:** TRADE-04 requirement validation
**Example:**
```typescript
// Integration test pattern using Vitest
import { describe, it, expect } from "vitest";
import { TradeRecommendationAgent } from "../agents/trade-recommendation";
import { calculateAVG, calculateERA } from "../../shared/src/formulas";

describe("Multi-player trade rate stat accuracy", () => {
  it("should aggregate AVG components correctly for 2-for-2 trade", async () => {
    // Setup: Team has 2 players with known AVG components
    // Player A: 100 AB, 30 H = .300 AVG
    // Player B: 200 AB, 50 H = .250 AVG
    // Team current: 300 AB, 80 H = .267 AVG

    // Trade: Give Player A, Player B
    //        Receive Player C (150 AB, 45 H = .300), Player D (100 AB, 35 H = .350)

    // Expected post-trade:
    // Remove: 300 AB, 80 H
    // Add: 250 AB, 80 H
    // Final: 250 AB, 80 H = .320 AVG

    const result = await agent.simulateTradeImpact(/* ... */);

    const avgImpact = result.categoryImpacts.find(c => c.categoryId === "AVG");

    // Use toBeCloseTo for floating-point comparison (within 0.001)
    expect(avgImpact?.projectedValue).toBeCloseTo(0.320, 3);

    // Verify it's NOT the average of the two rates (.300 + .350) / 2 = .325
    expect(avgImpact?.projectedValue).not.toBeCloseTo(0.325, 3);
  });

  it("should aggregate ERA components correctly for multi-player trade", async () => {
    // Player A: 50 IP, 15 ER = 2.70 ERA
    // Player B: 100 IP, 40 ER = 3.60 ERA
    // Trade for Player C: 80 IP, 20 ER = 2.25 ERA

    // Remove: 150 IP, 55 ER
    // Add: 80 IP, 20 ER
    // Component math: 9 * 20 / 80 = 2.25 ERA (NOT (2.25) from averaging)

    const result = await agent.simulateTradeImpact(/* ... */);
    const eraImpact = result.categoryImpacts.find(c => c.categoryId === "ERA");

    expect(eraImpact?.projectedValue).toBeCloseTo(2.25, 2);
  });
});
```

### Anti-Patterns to Avoid

- **Averaging Rate Stats:** Never compute AVG as (player1.AVG + player2.AVG) / 2. Always aggregate components (H, AB) then compute rate.
- **Unconstrained N-for-M:** Don't allow unlimited trade sizes; cap at 3-for-3 to prevent combinatorial explosion and UI complexity.
- **Optimistic Validation:** Don't assume trades are legal; validate roster slots BEFORE running expensive simulations.
- **Mutable State in Loops:** When iterating over givePlayers/receivePlayers, don't mutate the shared components object; use spread operator to copy.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Floating-point equality | Custom epsilon comparison | Vitest's `toBeCloseTo(value, numDigits)` | Handles edge cases (NaN, Infinity), consistent with Jest patterns |
| Position eligibility logic | Hard-coded position mappings | Configurable slot definitions from `league_settings_version.settings_json` | ESPN leagues have custom roster slots; hard-coding breaks flexibility |
| UI state management | Redux/Zustand for checkbox state | React's `useState` + `useCallback` | <100 items perform fine with local state; premature optimization |
| Trade simulation caching | Custom memoization | TanStack Query's cache | Already handles staleness, refetching, and optimistic updates |

**Key insight:** The codebase already has 90% of what's needed. Don't rebuild existing patterns—extend `TradeRecommendationAgent.simulateTradeImpact()` array loops, reuse trades page checkbox patterns, and add validation layer before simulation calls.

## Common Pitfalls

### Pitfall 1: Rate Stat Averaging Instead of Component Aggregation

**What goes wrong:** Multi-player trades compute new AVG as `(player1.AVG + player2.AVG) / 2` instead of `(H1 + H2) / (AB1 + AB2)`, producing incorrect projections.

**Why it happens:** Developers familiar with simple averaging apply it to rates without understanding that rates are ratios of components.

**How to avoid:**
1. Always use formulas from `packages/shared/src/formulas.ts` (calculateAVG, calculateERA, etc.)
2. In `simulateTradeImpact()`, the existing code already handles this correctly (lines 634-653 aggregate components)
3. Add integration tests (Pattern 3) to verify component math is used, not rate averaging

**Warning signs:**
- AVG changes are unrealistic (e.g., trading .300 + .250 hitters for .280 hitter shows improvement when components say otherwise)
- Tests fail with "expected 0.267, received 0.275" errors
- Backend logs show `components: null` in adjusted category values

### Pitfall 2: Roster Validation After Expensive Simulation

**What goes wrong:** Trade simulation runs expensive re-ranking logic (fetches all team projections, computes standings), then validation rejects trade as illegal, wasting resources.

**Why it happens:** Validation logic is added as an afterthought to existing simulation workflow.

**How to avoid:**
1. Add validation endpoint: `POST /api/leagues/:id/trades/validate` that checks roster slots WITHOUT simulation
2. Frontend calls validation first; only calls `/trades/impact` if validation passes
3. Backend middleware pattern: `validateTradeRoster → analyzeTradeImpact`

**Warning signs:**
- API response times >2s for illegal trades
- Database query logs show `team_daily_projected_category` fetches for rejected trades
- Error messages include "projected standings" but say "illegal roster composition"

### Pitfall 3: Checkbox Re-rendering on Every State Change

**What goes wrong:** Selecting one checkbox causes all 50+ checkboxes to re-render, causing UI lag.

**Why it happens:** Parent component re-renders on state change, and child checkbox components aren't memoized.

**How to avoid:**
1. Wrap checkbox rows in `React.memo()` (Pattern 2)
2. Use `useCallback()` for toggle handlers to prevent function recreation
3. For rosters >100 players, consider virtualization (`react-window`), but current 25-player rosters don't need it

**Warning signs:**
- UI feels sluggish when clicking checkboxes
- React DevTools Profiler shows all PlayerCheckboxRow components rendering
- Console warnings about "excessive re-renders"

### Pitfall 4: Off-by-One Errors in Roster Slot Matching

**What goes wrong:** Greedy slot assignment fills 3/3 OF slots with players eligible for UTIL, leaving actual OF players unassigned.

**Why it happens:** Naive greedy algorithm doesn't consider slot specificity order.

**How to avoid:**
1. Process slots in specificity order: C, 1B, 2B, SS, OF, SP, RP, P, UTIL, BN (Pattern 1)
2. Assign to most-specific eligible slot first (C-eligible player → C slot before UTIL)
3. Test with edge cases: all-utility trades, pitcher-heavy swaps, catcher-scarce scenarios

**Warning signs:**
- Validation rejects legal trades ("Cannot fill C slots" when roster has 2 catchers)
- Reverse validation passes (A→B legal, B→A illegal for same positions)
- Database has players in `roster_status=active` but validation says roster incomplete

## Code Examples

Verified patterns from existing codebase:

### Multi-Player Trade Simulation (Already Implemented)

```typescript
// Source: packages/backend/src/agents/trade-recommendation.ts, lines 634-653
// This pattern already works for N-for-N trades; no changes needed to core logic

// Subtract components from players being traded away
for (const givePlayer of trade.givePlayers) {
  const proj = projections.get(givePlayer.playerId);
  if (proj && this.isCategoryRelevant(category, proj)) {
    const playerComponents = proj.stat_components_json as Record<string, number>;
    for (const [key, value] of Object.entries(playerComponents)) {
      adjustedComponents[key] = (adjustedComponents[key] || 0) - (value || 0);
    }
  }
}

// Add components from players being acquired
for (const receivePlayer of trade.receivePlayers) {
  const proj = projections.get(receivePlayer.playerId);
  if (proj && this.isCategoryRelevant(category, proj)) {
    const playerComponents = proj.stat_components_json as Record<string, number>;
    for (const [key, value] of Object.entries(playerComponents)) {
      adjustedComponents[key] = (adjustedComponents[key] || 0) + (value || 0);
    }
  }
}

// Calculate the new rate from adjusted components
let projectedValue: number;
switch (catId) {
  case "AVG":
    projectedValue = calculateAVG(adjustedComponents);
    break;
  case "ERA":
    projectedValue = calculateERA(adjustedComponents);
    break;
  // ... other rate stats
}
```

### Category Impact Breakdown Table (Reuse from Existing Trades Page)

```typescript
// Source: packages/frontend/src/app/leagues/[id]/trades/page.tsx, lines 528-576
// This pattern already renders category-by-category breakdown; works for multi-player

<div className="overflow-x-auto">
  <table className="min-w-full divide-y divide-gray-200">
    <thead className="bg-gray-50">
      <tr>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
          Category
        </th>
        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
          Rank Change
        </th>
        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
          Point Change
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-100">
      {tradeAnalysis.categoryImpacts.map((cat) => (
        <tr key={cat.categoryName}>
          <td className="px-4 py-3 text-sm font-medium text-gray-900">
            {cat.categoryName}
          </td>
          <td className="px-4 py-3 text-sm text-center">
            <span className={`font-semibold ${renderDeltaColor(cat.deltaRank * -1)}`}>
              {cat.currentRank} → {cat.projectedRank}
              {cat.deltaRank !== 0 && ` (${cat.deltaRank > 0 ? "+" : ""}${cat.deltaRank})`}
            </span>
          </td>
          <td className="px-4 py-3 text-sm text-right">
            <span className={`font-semibold ${renderDeltaColor(cat.deltaPoints)}`}>
              {cat.deltaPoints > 0 ? "+" : ""}{cat.deltaPoints.toFixed(1)} pts
            </span>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

### Roster Slot Fetching (Existing Pattern)

```typescript
// Source: packages/backend/src/agents/snapshot-orchestrator.ts
// Fetch roster slots from league settings
const settingsVersion = await this.db
  .selectFrom("league_daily_snapshot")
  .innerJoin(
    "league_settings_version",
    "league_daily_snapshot.settings_version_id",
    "league_settings_version.id",
  )
  .select(["league_settings_version.settings_json"])
  .where("league_daily_snapshot.league_id", "=", leagueId)
  .where("league_daily_snapshot.snapshot_date", "=", snapshotDate)
  .executeTakeFirstOrThrow();

const rosterSlots = (settingsVersion.settings_json as any).roster_slots || {};
// rosterSlots is Record<string, number>, e.g., { C: 1, "1B": 1, OF: 3, UTIL: 1, BN: 5 }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual trade evaluation on ESPN | AI-powered trade recommendations with projected impact | 2020s fantasy analytics tools | Users can evaluate 100+ trade combinations in seconds |
| Rate stat averaging for multi-player | Component-based aggregation | 2015+ (sabermetrics mainstream) | Accurate projections; critical for multi-player trades |
| Server-side rendering | React Server Components + Client Components | Next.js 13+ (2023) | Faster initial page loads; client-side interactivity where needed |
| Jest for testing | Vitest (Vite-native) | 2021+ | 10-20x faster test execution; better TypeScript integration |

**Deprecated/outdated:**
- **Drag-and-drop for trade builders:** Popular in 2018-2020, but adds complexity without clear UX benefit for <100 items. Checkboxes are now preferred for multi-select in fantasy tools.
- **Custom constraint solvers:** Early fantasy tools built custom position-matching algorithms. Modern approach uses greedy slot assignment with specificity ordering (simpler, maintainable).
- **Rate stat "points" systems:** Some old platforms assigned arbitrary points to rate stats. Modern rotisserie uses component-based calculations and proper ranking.

## Open Questions

1. **Should validation be strict or permissive for edge cases?**
   - What we know: ESPN allows "over-roster" trades if corrected within 5 minutes pre-game
   - What's unclear: Should we block all illegal trades, or warn and allow (with flag)?
   - Recommendation: Start strict (block illegal trades); add "warn but allow" in future phase if users request it

2. **How to handle trades that exceed 3-for-3 limit?**
   - What we know: UI will cap selections at 3 per side
   - What's unclear: Should API enforce this limit, or trust frontend?
   - Recommendation: Enforce in both frontend (UX) and backend (security); return 400 error if >3 players per side

3. **Should we pre-fetch all rosters for partner teams in trade builder?**
   - What we know: Current waiver page fetches free agents on-demand (can be slow)
   - What's unclear: Trade builder needs rosters for all potential partners—lazy load or prefetch?
   - Recommendation: Prefetch all rosters when trade builder loads (parallelized queries); typical leagues have 10-12 teams × 25 players = 250-300 records (fast with indexes)

4. **How to display roster validation errors in the UI?**
   - What we know: Existing error handling shows red banners
   - What's unclear: Should validation errors appear before "Analyze Trade" button, or after click?
   - Recommendation: Real-time validation on player selection change; show issues list below trade builder (e.g., "⚠️ Cannot fill C slot after trade")

## Sources

### Primary (HIGH confidence)

**Codebase Analysis:**
- `/packages/backend/src/agents/trade-recommendation.ts` - Existing N-for-N trade simulation (lines 634-653)
- `/packages/shared/src/formulas.ts` - Component math formulas (calculateAVG, calculateERA, etc.)
- `/packages/frontend/src/app/leagues/[id]/trades/page.tsx` - Existing checkbox patterns and category breakdown UI
- `/packages/backend/src/agents/waiver-recommendation.ts` - Position validation pattern (lines 539-572)

**Official Documentation:**
- [Vitest expect API](https://vitest.dev/api/expect.html) - toBeCloseTo() for floating-point assertions
- [React.memo documentation](https://react.dev/reference/react/memo) - Component memoization patterns

### Secondary (MEDIUM confidence)

**Fantasy Sports Position Eligibility:**
- [ESPN Fantasy Baseball Position Eligibility Rules](https://www.espn.com/fantasy/baseball/story/_/id/39293536/espn-fantasy-baseball-new-default-player-eligibility-rules-2024) - Hitters gain eligibility at 10 games, pitchers at 3 starts/5 relief appearances
- [Position Eligibility for 2025 Fantasy Baseball | Razzball](https://razzball.com/position-eligibility-for-2025-fantasy-baseball/) - Position eligibility tracking across platforms

**React Patterns:**
- [React State Management in 2025: What You Actually Need](https://www.developerway.com/posts/react-state-management-2025) - useState sufficient for <100 item lists
- [How to Work with Multiple Checkboxes in React | freeCodeCamp](https://www.freecodecamp.org/news/how-to-work-with-multiple-checkboxes-in-react/) - Checkbox state patterns with performance tips
- [State Management in React (2026): Best Practices](https://www.c-sharpcorner.com/article/state-management-in-react-2026-best-practices-tools-real-world-patterns/) - useCallback and React.memo for optimization

**Testing:**
- [Mastering Testing with Vitest and TypeScript](https://www.xjavascript.com/blog/vitest-typescript/) - Integration testing patterns
- [Component Testing | Guide | Vitest](https://vitest.dev/guide/browser/component-testing) - Component testing setup

### Tertiary (LOW confidence)

**Trade Optimization Algorithms:**
- [A Genetic Algorithm for Optimizing Fantasy Football Trades with Playoff Biasing (arXiv)](https://arxiv.org/html/2511.17535v1) - Academic approach to trade optimization; genetic algorithms overkill for our use case but validates multi-player trade value
- [Fantasy Baseball Projection Aggregator | Smart Fantasy Baseball](https://www.smartfantasybaseball.com/projection-aggregator/) - Industry patterns for projection handling
- [More About Ratio Stats and Standings Gain Points | Smart Fantasy Baseball](https://www.smartfantasybaseball.com/2018/02/more-than-you-wanted-to-know-about-ratio-stats-and-standings-gain-points/) - Component-based rate stat calculations in fantasy context

**UI Libraries (Not Needed):**
- [react-beautiful-dnd multi-drag pattern](https://github.com/atlassian/react-beautiful-dnd/blob/master/docs/patterns/multi-drag.md) - Researched but not recommended; checkbox pattern simpler for this use case
- [10 Best Multiple Select Components For React (2026)](https://reactscript.com/best-multiple-select-components/) - Survey of multi-select libraries; built-in checkbox approach preferred

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use; no new dependencies needed
- Architecture: HIGH - Existing patterns directly applicable; validation is only new component
- Pitfalls: MEDIUM - Based on common fantasy sports platform issues and general React performance patterns; not all specific to this codebase

**Research date:** 2026-02-20
**Valid until:** ~60 days (April 2026) - Stack is stable; React patterns slow-changing; ESPN API constraints unlikely to change mid-season
