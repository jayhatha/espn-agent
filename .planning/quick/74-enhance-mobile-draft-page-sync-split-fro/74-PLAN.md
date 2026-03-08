# Quick Task 74: Enhance Mobile Draft Page

## Goal
Make the mobile draft companion page more useful: sync pitcher/hitter split from extension state, show current roster list, display nominated player name prominently, and improve WS relay latency.

## Changes

### 1. Extension — Include roster data in mobile state write
**File:** `packages/extension/components/DraftSidebar.tsx`
- Add `roster` array (playerName, positions, cost) to `draft-mobile-state` storage write
- Change dependency from `myRoster.length` to `myRoster` so content changes trigger updates

### 2. Extension — Reduce relay latency
**File:** `packages/extension/components/DraftSidebar.tsx`
- Reduce debounce from 1000ms → 150ms
- Combine both `chrome.storage.local.set()` calls into a single write (one `onChanged` event → one WS message)

### 3. Frontend — Extend DraftLiveState types
**File:** `packages/frontend/src/app/draft/live/useDraftLiveSocket.ts`
- Add `RosterPlayer` interface (playerName, positions, cost)
- Add `roster?: RosterPlayer[]` to `DraftLiveState`

### 4. Frontend — Sync split, show roster, enhance page
**File:** `packages/frontend/src/app/draft/live/page.tsx`
- Sync `splitValue` from `state.pitcherHitterSplit` via useEffect
- Add "My Roster" section with player names, positions, and costs
- Import `RosterPlayer` type

## Status: EXECUTED
