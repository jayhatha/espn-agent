---
quick_task: 49
description: "Parse roster size from ESPN Position Tracker DOM to fix rosterSize mismatch warning"
---

# Quick Task 49: Parse Roster Size from Position Tracker

## Problem
Engine warns `rosterSize=20 differs from active slot total=23. Using default roster slots.` because:
1. `rosterSize` defaults to 25 or comes from stale config
2. The actual league has 28 roster spots (visible in Position Tracker DOM)
3. The Position Tracker DOM (`.roster-limits`) is NOT being parsed for roster size

## DOM Structure
```html
<div class="roster-limits">
  <div>
    <div>Position Tracker</div>
    <div>10/28 Players</div>  <!-- X/N format: N = total roster size -->
  </div>
  <div>
    <div>C<span>0</span></div>
    <div>1B<span>1</span></div>
    ...
  </div>
</div>
```

## Tasks

### Task 1: Add detectRosterSizeFromPositionTracker() function
**Files:** `packages/extension/lib/draft-config-detector.ts`
**Action:**
- Add function that finds `.roster-limits`, parses "X/N Players" text for total roster size N
- Return `{ rosterSize: number, positions: string[] }` or null
- positions = list of position names found (C, 1B, 2B, 3B, SS, OF, DH, SP, RP)

### Task 2: Wire into content.tsx — call during init + pick train polling
**Files:** `packages/extension/entrypoints/content.tsx`
**Action:**
- Call `detectRosterSizeFromPositionTracker()` during initialization
- Also call from pick train polling interval (Position Tracker renders after page load)
- When detected, update `useDraftStore.setState({ rosterSize: N })`
- Log detection for debugging
