---
quick_task: 36
plan: 1
status: pending
---

# Quick Task 36: Large Circular Ranking Number in Display Serif Font

## Task 1: Add circular rank badge to AuctionPlayerCard

**Files:** `packages/extension/components/AuctionPlayerCard.tsx`

**Problem:** Players in the sidebar list have no prominent visual ranking indicator. Users want to quickly see where a player ranks among remaining (undrafted) players.

**Approach:**

In `AuctionPlayerCard.tsx`, add a large circular number to the left side of each player card:
- The `rank` prop already represents position among remaining available players (index+1 from filtered list in AuctionRecommendations)
- Add a circular element: `w-10 h-10 rounded-full` with `font-display` (DM Serif Display)
- Background: `bg-surface-secondary` for subtle contrast, `text-content` for number
- For top 10: use `bg-accent text-content-inverse` to visually distinguish elite picks
- Number should be `text-lg` for 1-2 digit ranks, `text-sm` for 3-digit ranks
- Place as leftmost element in the card layout, centered vertically

Layout change: wrap current card content in a flex row with the circle on the left and existing content on the right.

**Verify:** Build succeeds, circular numbers appear in sidebar player list.
**Done:** Each player card shows a prominent circular ranking number in display serif font.
