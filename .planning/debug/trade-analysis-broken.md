---
status: resolved
slug: trade-analysis-broken
trigger: "Trade analysis seems to be broken. 'Error Invalid trade format. Must include givePlayers and receivePlayers.' and AI-suggested trades show as needing projections even though projections have been uploaded."
created: 2026-05-15
updated: 2026-05-15
---

## Symptoms

- **Bug 1**: POST /api/leagues/:id/teams/:teamId/trades/impact returns 400 "Invalid trade format. Must include givePlayers and receivePlayers."
- **Bug 2**: GET /api/leagues/:id/teams/:teamId/trades/recommendations returns 500 "No projected standings found for team X on DATE. Please ensure projections have been uploaded and a snapshot has been run." — UI shows "Trade analysis requires projections. Please contact your administrator to upload projections." — even after projections CSV was uploaded.

## Current Focus

hypothesis: Two independent bugs — (1) frontend sends wrong request body shape, (2) re-snapshot after projection upload skips leagues with no today snapshot
next_action: apply fixes to api.ts, trades/page.tsx mutation, and projections.ts re-snapshot scope

## Evidence

- timestamp: 2026-05-15T00:00:00Z
  finding: >
    packages/frontend/src/lib/api.ts:analyzeTradeImpact sends
    JSON.stringify({ givePlayers: number[], receivePlayers: number[] }) directly.
    Backend Body type is { trade: ProposedTrade; snapshotDate?: string }.
    request.body.trade is undefined → !trade check fires → 400.
    Also: IDs only sent, backend ProposedTrade needs { playerId, playerName } objects.

- timestamp: 2026-05-15T00:01:00Z
  finding: >
    trades/page.tsx analyzeTradeM mutation maps trade.givePlayers → number[]
    then passes to api.analyzeTradeImpact which doesn't wrap in { trade: }.
    handleAnalyzeTrade correctly builds TradePlayer[] objects but then
    they're discarded in the mutation.

- timestamp: 2026-05-15T00:02:00Z
  finding: >
    packages/backend/src/api/projections.ts:triggerDegradedLeagueResnapshots
    when projectionsNowFresh=true queries WHERE snapshot_date = today.
    If last snapshot was yesterday, no leagues match → no re-snapshot → 
    team_daily_projected_category stays empty for any snapshot date.
    Trade agent's getCurrentStandings queries team_daily_projected_category
    for the latest snapshot date and throws when empty.

## Eliminated

## Resolution

root_cause: >
  Bug 1: api.ts doesn't wrap in { trade: ... } and maps TradePlayer[] to number[].
  Bug 2: re-snapshot after upload scoped to today's snapshot date, misses leagues last snapshotted on prior days.
fix: >
  Bug 1: Update api.analyzeTradeImpact to accept TradePlayer[] objects and wrap in { trade: data }.
         Update trades page mutation to pass trade directly (no .map(p => p.playerId)).
  Bug 2: Update triggerDegradedLeagueResnapshots to include leagues with ANY snapshot
         (not just today's) so projections are applied regardless of last snapshot date.
verification: api.ts sends { trade: { givePlayers: [{playerId,playerName},...], receivePlayers: [...] } }; re-snapshot fires for all leagues
files_changed:
  - packages/frontend/src/lib/api.ts
  - packages/frontend/src/app/leagues/[id]/trades/page.tsx
  - packages/backend/src/api/projections.ts
