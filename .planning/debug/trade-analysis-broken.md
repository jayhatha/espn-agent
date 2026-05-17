---
status: resolved
slug: trade-analysis-broken
trigger: "Trade analysis seems to be broken. 'Error Invalid trade format. Must include givePlayers and receivePlayers.' and AI-suggested trades show as needing projections even though projections have been uploaded."
created: 2026-05-15
updated: 2026-05-17
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

## 2026-05-17 Follow-up (user: still broken)

Three additional bugs found and fixed:

**Bug 3**: `equivalentValue.ratio == null` guard in `generateTradeCandidates` filtered out ALL
trade pairs when `espn_asv` was null (player pool sync not run) AND no draft costs existed
(non-auction league). Every pair was skipped before reaching `analyzeTradeImpact`. Fixed: only skip
when ratio is non-null AND below `MIN_EQUIVALENT_VALUE_RATIO`.

**Bug 4**: `generateTradeCandidates` had no early check for projected standings. When
`team_daily_projected_overall` was empty, `getCurrentStandings` threw inside the per-candidate
try/catch, every candidate was silently skipped, and the API returned `[]`. The frontend showed
"No trade recommendations available..." with no actionable guidance. Fixed: added explicit
`projectedStandingsExist` check before the candidate loop; throws "No projected standings found..."
which propagates to the API and surfaces the contextual help UI in the frontend.

**Bug 5**: `fetchAPI` in the frontend only read `error.error` (static generic message) and discarded
`error.details` (the actual root cause). Frontend "projected standings" conditionals checked
`.message.includes("projected standings")` which never matched the wrapper string "Failed to
generate trade candidates". Fixed: `fetchAPI` now appends `: ${error.details}` when present, so
the full cause is visible to the user and the conditionals fire correctly.

**Bug 6**: No `/api/leagues/:leagueId/teams/:teamId/trades/validate` backend route. Frontend sent
debounced POST calls every 300 ms generating log noise. Fixed: wired up
`TradeRecommendationAgent.validateRosterSlots` via the new route.

files_changed (2026-05-17):
- packages/backend/src/agents/trade-recommendation.ts (bugs 3, 4)
- packages/backend/src/api/recommendations.ts (bug 6)
- packages/frontend/src/lib/api.ts (bug 5)
