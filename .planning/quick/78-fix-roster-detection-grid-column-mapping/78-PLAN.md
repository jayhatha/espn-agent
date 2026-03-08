# Quick Task 78: Fix roster detection — grid column to team mapping

## Goal
Extension stuck on 4 players in myRoster. Refresh button doesn't rescan DOM.
Ideal roster also not refreshing after picks.

## Root Cause
`detectMyTeam()` extracts teamId from pick train prefix number (e.g., `"13"` from
`"13. Nathan Fielders"`), but `parsePickElement()` falls back to `gridArea.column`
as teamId (e.g., `"3"` for the 3rd column). These don't match, so `isMyPick` check
(`pick.teamId === myTeamId`) was almost always `false`.

Additionally, `refreshAssistantData` never re-scans DOM when `allPicks.length > 0`,
so the refresh button was a no-op for picking up missed picks.

## Fix
1. `detectMyTeam()` now returns `gridColumn` — the 1-based position of the user's
   team in the pick train (`.auction-pick-component--own` index among `.picklist--item`s)
2. `isMyPick` check now matches both `myTeamId` AND `myGridColumn`
3. `refreshAssistantData` always reconciles DOM picks against allPicks (not just on fresh start)
4. Roster reconciliation filter also uses `myGridColumn`

## Status: EXECUTED
