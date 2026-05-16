# Phase 96 Verification: Frontend Query Hook Layer

## Status: passed

## Must-Haves Checklist

- [x] `hooks/use-league.ts`: `useLeagueStatus` and `useLeagueTeams` created, use `queryKeys` factories
- [x] `hooks/use-standings.ts`: `useProjectedStandings` created, uses `queryKeys.standings.projected`
- [x] `hooks/use-waivers.ts`: `useWaiverRecommendations` (with `enabled` when `teamId != null`) and `useFreeAgents` (with explicit `enabled` param) created
- [x] `hooks/use-trades.ts`: `useTradeRecommendations` created
- [x] `hooks/index.ts`: barrel re-exports all hooks
- [x] `standings/page.tsx`: uses `useProjectedStandings` instead of inline `useQuery`
- [x] `waivers/page.tsx`: uses `useWaiverRecommendations` and `useFreeAgents` instead of inline `useQuery`
- [x] All 7 files: `get_errors()` returns 0 TypeScript errors

## Files Created

| File                                               | Purpose                                    |
| -------------------------------------------------- | ------------------------------------------ |
| `packages/frontend/src/lib/hooks/use-league.ts`    | League status + teams hooks                |
| `packages/frontend/src/lib/hooks/use-standings.ts` | Projected standings hook                   |
| `packages/frontend/src/lib/hooks/use-waivers.ts`   | Waiver recommendations + free agents hooks |
| `packages/frontend/src/lib/hooks/use-trades.ts`    | Trade recommendations hook                 |
| `packages/frontend/src/lib/hooks/index.ts`         | Barrel re-exports                          |

## Files Modified

| File                                                        | Change                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/frontend/src/app/leagues/[id]/standings/page.tsx` | Replaced inline `useQuery` with `useProjectedStandings`                              |
| `packages/frontend/src/app/leagues/[id]/waivers/page.tsx`   | Replaced 2 inline `useQuery` calls with `useWaiverRecommendations` + `useFreeAgents` |

## Design Decisions

- All hooks delegate `queryKey` to `queryKeys` factory — prefix invalidation works correctly
- `useWaiverRecommendations` uses `enabled: teamId != null` so no spurious requests
- `useFreeAgents` accepts `enabled?: boolean` for caller-controlled gating (viewMode pattern)
- `staleTime` set per hook: 60s for league status, 120s for standings/waivers, 300s for teams/trades
