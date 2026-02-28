---
phase: quick-14
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/dom-observers.ts
  - packages/extension/lib/draft-state.ts
  - packages/extension/components/AuctionRecommendations.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "User sees current player up for auction at top of sidebar"
    - "Current player display updates when ESPN changes the active auction player"
    - "Current player shows player name, position, and current bid"
  artifacts:
    - path: "packages/extension/lib/dom-observers.ts"
      provides: "observeCurrentAuctionPlayer function to detect active player from ESPN DOM"
      exports: ["observeCurrentAuctionPlayer"]
    - path: "packages/extension/lib/draft-state.ts"
      provides: "currentAuctionPlayer state field and setter"
      contains: "currentAuctionPlayer"
    - path: "packages/extension/components/AuctionRecommendations.tsx"
      provides: "Current player display at top of component"
      min_lines: 280
  key_links:
    - from: "packages/extension/entrypoints/content.tsx"
      to: "observeCurrentAuctionPlayer"
      via: "import and call observer on mount"
      pattern: "observeCurrentAuctionPlayer"
    - from: "packages/extension/components/AuctionRecommendations.tsx"
      to: "useDraftStore"
      via: "read currentAuctionPlayer state"
      pattern: "currentAuctionPlayer"
---

<objective>
Display the current player up for auction at the top of the extension sidebar during auction drafts.

Purpose: Users need to quickly see who is being auctioned without scrolling away from the recommendations list.
Output: Current auction player displayed prominently at top of AuctionRecommendations component with real-time updates.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

# Extension architecture
@packages/extension/entrypoints/content.tsx
@packages/extension/lib/dom-observers.ts
@packages/extension/lib/draft-state.ts
@packages/extension/components/AuctionRecommendations.tsx

# Current auction draft implementation uses:
# - MutationObserver pattern for detecting picks from ESPN DOM (dom-observers.ts)
# - Zustand store for draft state with chrome.storage persistence (draft-state.ts)
# - AuctionRecommendations component for displaying player list (AuctionRecommendations.tsx)
# - Multiple DOM selector strategies for robustness against ESPN changes (established pattern)
</context>

<tasks>

<task type="auto">
  <name>Add current auction player observer to dom-observers.ts</name>
  <files>packages/extension/lib/dom-observers.ts</files>
  <action>
Create `observeCurrentAuctionPlayer` function following existing observer patterns in the file:

1. Define selector strategies for ESPN's current auction player display (typically shows player name, current bid, timer):
   - Primary: `.currentPlayer`, `[class*="currentPlayer"]`, `[class*="CurrentPlayer"]`
   - Secondary: `.activePlayer`, `[class*="activePlayer"]`, `[data-testid*="current-player"]`
   - Fallback: `.auctionHeader`, `[class*="auctionHeader"]` (often contains current player)

2. Create `parseCurrentAuctionPlayer` function to extract:
   - playerName (required)
   - currentBid (number, optional)
   - positions (string[], optional)
   - playerId (number, optional - use hashString fallback if not in DOM)

3. Create `observeCurrentAuctionPlayer(onPlayerChange: (player) => void)` function:
   - Returns cleanup function
   - Uses MutationObserver on auction header/container
   - Debounces updates (ESPN may refresh DOM rapidly during bidding)
   - Calls onPlayerChange when current player changes
   - Handles case where no player is active (between auctions)

4. Export both functions at bottom of file

Follow existing patterns from `observeDraftBoard` for resilience (multiple selectors, error logging, DOM snapshots on failure).
  </action>
  <verify>
Build extension with `pnpm build` - no TypeScript errors
  </verify>
  <done>
`observeCurrentAuctionPlayer` function exists, exports cleanup function, follows existing observer patterns
  </done>
</task>

<task type="auto">
  <name>Add current auction player state to draft-state.ts</name>
  <files>packages/extension/lib/draft-state.ts</files>
  <action>
Add current auction player to DraftState interface and store:

1. Add to DraftState interface:
```typescript
currentAuctionPlayer: {
  playerName: string;
  currentBid?: number;
  positions?: string[];
  playerId?: number;
} | null;
```

2. Add to initial state (line ~94):
```typescript
currentAuctionPlayer: null,
```

3. Add action to DraftState interface:
```typescript
setCurrentAuctionPlayer: (player: DraftState['currentAuctionPlayer']) => void;
```

4. Add action implementation after line 193:
```typescript
setCurrentAuctionPlayer: (player) => set({ currentAuctionPlayer: player }),
```

5. Add to reset() function (line ~223):
```typescript
currentAuctionPlayer: null,
```

Do NOT add to partialize() - current auction player is session-only state (not persisted).
  </action>
  <verify>
Build extension with `pnpm build` - no TypeScript errors
  </verify>
  <done>
currentAuctionPlayer field exists in DraftState, setter exists, not persisted to storage
  </done>
</task>

<task type="auto">
  <name>Wire observer in content.tsx and display in AuctionRecommendations.tsx</name>
  <files>
packages/extension/entrypoints/content.tsx
packages/extension/components/AuctionRecommendations.tsx
  </files>
  <action>
**content.tsx:**

1. Import observeCurrentAuctionPlayer from dom-observers (line ~12):
```typescript
import {
  // ... existing imports
  observeCurrentAuctionPlayer,
} from "../lib/dom-observers";
```

2. Start observer after mountSidebar() call (after line 509), only for auction drafts:
```typescript
// Observe current auction player (auction only)
let auctionPlayerCleanup: (() => void) | null = null;
if (resolvedDraftFormat === "auction") {
  auctionPlayerCleanup = observeCurrentAuctionPlayer((player) => {
    useDraftStore.getState().setCurrentAuctionPlayer(player);
  });
}
```

3. Add to cleanup in beforeunload listener (before line 640):
```typescript
auctionPlayerCleanup?.();
```

**AuctionRecommendations.tsx:**

1. Get currentAuctionPlayer from store (line ~56):
```typescript
const {
  // ... existing destructured fields
  currentAuctionPlayer,
} = useDraftStore();
```

2. Add current player display section BEFORE filter controls (insert after line 213, before filter controls div):
```tsx
{/* Current player up for auction */}
{currentAuctionPlayer && (
  <div className="p-3 bg-blue-50 border-b border-blue-200">
    <div className="text-xs font-medium text-blue-900 mb-1">NOW BIDDING</div>
    <div className="flex items-center justify-between">
      <div>
        <div className="font-semibold text-sm text-gray-900">
          {currentAuctionPlayer.playerName}
        </div>
        {currentAuctionPlayer.positions && currentAuctionPlayer.positions.length > 0 && (
          <div className="text-xs text-gray-600">
            {currentAuctionPlayer.positions.join(", ")}
          </div>
        )}
      </div>
      {currentAuctionPlayer.currentBid !== undefined && (
        <div className="text-right">
          <div className="text-xs text-gray-600">Current Bid</div>
          <div className="text-lg font-bold text-blue-600">
            ${currentAuctionPlayer.currentBid}
          </div>
        </div>
      )}
    </div>
  </div>
)}
```

This displays current player prominently above filters with "NOW BIDDING" label, player name/positions on left, current bid on right.
  </action>
  <verify>
Build extension with `pnpm build` - no TypeScript errors, no React warnings
  </verify>
  <done>
Observer wired in content.tsx for auction drafts, current player displayed at top of AuctionRecommendations with name, positions, and bid
  </done>
</task>

</tasks>

<verification>
Manual testing on ESPN auction draft page:
1. Load extension on auction draft page
2. Verify "NOW BIDDING" section appears at top of sidebar when player is up for auction
3. Verify player name, positions, and current bid display correctly
4. Verify display updates when ESPN moves to next player
5. Verify section hides when no player is active (between auctions)
</verification>

<success_criteria>
- observeCurrentAuctionPlayer function exists and follows dom-observers.ts patterns
- currentAuctionPlayer state field exists in draft-state.ts
- Observer runs only for auction drafts and updates state
- Current player displayed at top of AuctionRecommendations component
- Display updates in real-time as ESPN changes active player
- No TypeScript errors, builds successfully
</success_criteria>

<output>
After completion, create `.planning/quick/14-show-the-current-player-at-the-top-of-th/14-SUMMARY.md`
</output>
