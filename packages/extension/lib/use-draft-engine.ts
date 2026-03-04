import { useMemo } from "react";
import { useDraftStore } from "./draft-state";
import { computeDraftEngine } from "./engine";
import type { DraftEngineSignals } from "./engine";

export function useDraftEngineSignals(): DraftEngineSignals | null {
  const {
    rankings,
    auctionValues,
    allPicks,
    myRoster,
    remainingBudget,
    totalTeams,
    rosterSize,
    teamRosters,
    myTeamId,
    allTeamBudgets,
    leagueCategories,
    currentAuctionPlayer,
    draftFormat,
  } = useDraftStore();

  return useMemo(() => {
    // Only compute for auction drafts with data
    if (draftFormat !== "auction") return null;
    if (rankings.length === 0 && auctionValues.length === 0) return null;

    return computeDraftEngine({
      rankings,
      auctionValues,
      allPicks,
      myRoster,
      remainingBudget,
      totalTeams,
      rosterSize,
      teamRosters,
      myTeamId,
      allTeamBudgets,
      leagueCategories,
      currentAuctionPlayerId: currentAuctionPlayer?.playerId,
    });
  }, [
    // CRITICAL: Do NOT include currentAuctionPlayer in deps -- it changes every 200ms from
    // observeCurrentAuctionPlayer. Only recompute per-pick (allPicks change) or per-roster change.
    // The currentAuctionPlayer.playerId is read inside the useMemo but won't trigger recompute
    // on bid changes -- only on picks.
    rankings,
    auctionValues,
    allPicks,
    myRoster,
    remainingBudget,
    totalTeams,
    rosterSize,
    teamRosters.size, // Use .size instead of Map ref to avoid stale reference issues (Pitfall #6)
    myTeamId,
    allTeamBudgets,
    leagueCategories,
    draftFormat,
  ]);
}
