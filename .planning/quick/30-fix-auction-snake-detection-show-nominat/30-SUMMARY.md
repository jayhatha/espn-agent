---
quick_task: 30
status: complete
commits: ["ea5ffde"]
---

# Quick Task 30: Fix Auction Detection, Nominated Player, Sidebar Cleanup

## What Changed

### Auction Format Detection (dom-observers.ts)
Added 4 new detection strategies to `detectDraftFormat()`:
1. Nomination queue elements (`[class*="nominat"]`, `[class*="queue"]`)
2. Budget/dollar display text (`$XXX remaining/left/budget`)
3. Bid button detection (any `<button>` with "bid" text)
4. Nomination text patterns ("up for bid", "current nomination", etc.)

### Delayed Re-check Fix (content.tsx)
The 2-second delayed re-check now starts `observeCurrentAuctionPlayer` when switching from snake to auction format, ensuring the nominated player observer runs even when auction detection happens late.

### Sidebar UI (DraftSidebar.tsx)
- Added prominent "Now Nominated" banner at top of sidebar (outside scrollable area) showing player name, positions, current bid, and our recommended value
- Removed `ProjectedStandingsPanel` from sidebar
- Removed `PickValueTracker` from both auction and snake branches

### AuctionRecommendations.tsx
- Removed duplicate nominated player display (now lives in DraftSidebar)
- Removed `currentAuctionPlayer` from destructured state
