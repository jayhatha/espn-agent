---
phase: quick-36
plan: 01
subsystem: ui
tags: [chrome-extension, draft, rankings, design]

provides:
  - Circular rank badge showing remaining-player rank in DM Serif Display font
affects: [extension-draft-sidebar, auction-player-cards]

duration: 1min
completed: 2026-03-04
---

# Quick Task 36: Circular Rank Badge Summary

**Large circular ranking number in display serif font showing remaining-player rank in auction player cards**

## Accomplishments
- Added w-10 h-10 circular badge to left side of each AuctionPlayerCard
- Uses `font-display` (DM Serif Display) for editorial aesthetic
- Top 10 players: accent-colored badge (bg-accent, white text) for visual distinction
- Players 11+: subtle surface-secondary background
- Rank text auto-sizes: text-lg for 1-2 digits, text-xs for 3+ digits
- Rank represents position among remaining available players (already computed by AuctionRecommendations)

## Files Modified
- `packages/extension/components/AuctionPlayerCard.tsx` — restructured layout to flex row with circular badge + player info

## Commits
| Hash | Description |
|------|-------------|
| 8e12048 | feat(extension): add circular rank badge with serif font to auction player cards |

---
*Quick Task: 36-add-large-circular-ranking-number-displa*
*Completed: 2026-03-04*
