# Summary 82-02: Frontend Live Indicators

**Status:** Complete
**Commit:** feat(phase-82-02)

## Delivered

### `packages/frontend/src/lib/api.ts` (modified)
- Added `triggerLiveRefresh(leagueId)` → `POST /api/leagues/${leagueId}/live-refresh`

### `packages/frontend/src/app/leagues/[id]/changelog/page.tsx` (modified)
- Added `isGameWindow()` helper — checks local hour ≥ 13 (1pm)
- Added `formatRelativeTime(date)` helper — returns "just now / Xm ago / Xh ago"
- Added `RefreshCw` to lucide-react imports
- New state: `lastPolledAt: Date | null`, `isGameTime: boolean`
- `useEffect` game-window ticker: updates `isGameTime` every 60s
- `handleRefresh` callback: calls `api.triggerLiveRefresh()`, sets `lastPolledAt`
- SSE `onmessage` now handles `live_poll` type → sets `lastPolledAt`
- PageHeader `actions` expanded:
  - "Updated Xm ago" (hidden on mobile) — shows when `lastPolledAt` is set
  - "Games live" amber pulsing chip — shows during game hours
  - "Refresh" button with `RefreshCw` icon — calls `handleRefresh`
  - Original "Live / Connecting…" SSE dot unchanged
- Empty state text: "Changes stream live during game hours. Check back once games start."
