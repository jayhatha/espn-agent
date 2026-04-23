# Summary 81-03: Frontend Change Log Page

**Status:** Complete
**Commit:** 93e313e

## Delivered

### `packages/frontend/src/lib/api.ts` (modified)

- `getChangeLogHistory(leagueId, limit)` — REST fetch for initial 50 events
- `getChangeLogSSEUrl(leagueId)` — synchronous URL builder for `EventSource`

### `packages/frontend/src/components/shell/LeagueNav.tsx` (modified)

- `ScrollText` added to lucide-react imports
- "Change Log" nav item added after "Standings" → `/leagues/[id]/changelog`

### `packages/frontend/src/app/leagues/[id]/changelog/page.tsx` (new)

- Loads team list for name resolution
- Fetches history via REST on mount (deduplication via `seenIds` ref)
- `EventSource` SSE subscription for live updates
- "Live" / "Connecting…" indicator dot (green pulse when connected)
- `EventCard` component:
  - Our team: full opacity; other teams: 60% opacity
  - Gained: green `TrendingUp`; Lost: red `TrendingDown`
  - Category badge colored by direction
  - "Passed X" / "Passed by X" label when `passed_team_name` set
  - `Zap` icon + proximate cause description when present
- Empty state with `ScrollText` icon + hint about snapshot schedule
- Uses `Container` + `PageHeader` with `actions` prop for Live indicator
