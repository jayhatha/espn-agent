# Plan 68-02 Summary: Frontend FAAB Market + Pitching Usage + TopBar

**Status:** COMPLETE
**Date:** 2026-03-23

## What was done

### Task 1: FAAB Market page + FaabGauge component

**FaabGauge.tsx** — Horizontal progress bar component showing FAAB budget remaining.
- Green fill (>50%), amber (25-50%), red (<25%) based on remaining percentage
- Stats row: Remaining, Spent, League Avg — all in font-mono
- Shell dark mode tokens: dark:bg-shell-border track, dynamic fill colors

**API client** — Added `getFaabSummary`, `getFaabHistory`, `getFaabSuggestedBid` to api.ts

**Moves page (FAAB Market)** — Added "FAAB Budget" tab to the existing moves page tab navigation:
- Budget Overview section with FaabGauge and spend-rate projection text
  - Green text if on pace, red if will run out with projected week
- Bid History table: Date, Player, Bid ($), Result (won badge), ROI (Nx format)
- All data fetched via TanStack Query with 5-min stale time

### Task 2: Pitching Usage page + GsTracker component + TopBar wiring

**GsTracker.tsx** — Horizontal progress bar for GS usage with projected pace marker.
- Fill color per paceStatus (green/amber/red)
- Dashed projected marker at projectedFinal position
- Stats row: Used X/200, Pace X/wk, Projected X GS
- Status badge via Badge component

**API client** — Added `getGsSummary`, `getGsWeekly`, `getStartPlan` to api.ts

**Streaming page (Pitching Usage)** — Added tabbed navigation:
- **GS Pacing tab**: Season GsTracker component, remaining starts text, alert banners for burning_fast / too_slow, weekly breakdown table with pitcher starts by date
- **Start Plan tab**: SP start/sit table with K/GS ratio, recommendation badge (start/sit/stream), reason column, pace alert banner
- **Streaming Picks tab**: Existing streaming pitcher cards (unchanged)

**TopBar wiring** — Replaced hardcoded "--" for FAAB and GS:
- Reads teamId from localStorage (`league_${id}_team`)
- Fetches FAAB summary and GS summary via TanStack Query (5-min staleTime)
- Displays `$X` for FAAB, `X/200` for GS
- Falls back to "--" while loading or on error

## Verification
- `cd packages/frontend && npx tsc --noEmit` — passes
- FaabGauge.tsx and GsTracker.tsx exist in components/league/
- TopBar.tsx no longer shows hardcoded "--" for FAAB and GS
- Streaming page has 3 tabs (GS Pacing, Start Plan, Streaming Picks)
- Moves page has 6 tabs (League Summary, FAAB Budget, Move Leaderboard, Trades, Draft Report, Impact Timeline)

## Key Files
- `packages/frontend/src/components/league/FaabGauge.tsx` (new)
- `packages/frontend/src/components/league/GsTracker.tsx` (new)
- `packages/frontend/src/components/shell/TopBar.tsx` (modified — wired FAAB + GS)
- `packages/frontend/src/app/leagues/[id]/moves/page.tsx` (modified — added FAAB Budget tab)
- `packages/frontend/src/app/leagues/[id]/streaming/page.tsx` (modified — added GS Pacing + Start Plan tabs)
- `packages/frontend/src/lib/api.ts` (modified — 6 new API methods)
