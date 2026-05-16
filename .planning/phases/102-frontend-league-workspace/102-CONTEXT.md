# Phase 102: Frontend League Workspace — Context

**Gathered:** 2026-05-15
**Status:** Ready
**Milestone:** v10.0 Architecture Improvements

<domain>
## Phase Boundary

Extract the duplicated localStorage team-selection pattern from 7+ page files into a shared `useLeagueTeam(leagueId)` hook, and consolidate duplicated page-local TypeScript interfaces into a shared types module.

## Evidence — localStorage duplication

`localStorage.getItem(`league\_${leagueId}\_team`)` appears in:

- `waivers/page.tsx` (L372)
- `moves/page.tsx` (L168)
- `lineup/page.tsx` (L96)
- `standings/page.tsx` (L135)
- `trends/page.tsx` (L170)
- `changelog/page.tsx` (L323)
- `trades/page.tsx` (L119)

## Evidence — interface duplication

Interfaces like `RosterPlayer`, `Team`, `CategoryImpact` are redefined inline in multiple page files. For example `trades/page.tsx` defines `ProposedTrade`, `CategoryImpact`, `TradeImpactAnalysis`, `PositionalContext`, `TradeCandidate`, `RosterPlayer`, `Team` — many of these overlap with definitions in `waivers/page.tsx` and `standings/page.tsx`.
</domain>

<decisions>
## Implementation Strategy

1. Create `packages/frontend/src/lib/hooks/use-league-team.ts`:

   ```ts
   export function useLeagueTeam(
     leagueId: string,
   ): [string | null, (id: string) => void];
   ```

   Reads/writes `localStorage.getItem/setItem(`league\_${leagueId}\_team`)` — SSR-safe with `typeof window !== "undefined"` guard.

2. Create `packages/frontend/src/lib/types/league.ts`:
   - Consolidate: `RosterPlayer`, `Team`, `CategoryImpact`, `TradeImpactAnalysis`, `WaiverRecommendation`, `FreeAgent`

3. Replace inline localStorage access in all 7 pages with `useLeagueTeam(leagueId)`
4. Replace inline interface definitions in affected pages with imports from `lib/types/league.ts`

## Files to Modify

- `packages/frontend/src/lib/hooks/use-league-team.ts` — NEW
- `packages/frontend/src/lib/types/league.ts` — NEW
- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx`
- `packages/frontend/src/app/leagues/[id]/moves/page.tsx`
- `packages/frontend/src/app/leagues/[id]/lineup/page.tsx`
- `packages/frontend/src/app/leagues/[id]/standings/page.tsx`
- `packages/frontend/src/app/leagues/[id]/trends/page.tsx`
- `packages/frontend/src/app/leagues/[id]/changelog/page.tsx`
- `packages/frontend/src/app/leagues/[id]/trades/page.tsx`
  </decisions>
