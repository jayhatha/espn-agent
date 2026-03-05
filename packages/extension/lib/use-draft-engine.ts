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
    espnDomAuctionValues,
    draftFormat,
    detectedRosterSlots,
  } = useDraftStore();

  // Extract playerId separately — only changes on new nominations (not bid updates)
  const currentPlayerId = currentAuctionPlayer?.playerId;

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
      rosterSlots: detectedRosterSlots ?? undefined,
      teamRosters,
      myTeamId,
      allTeamBudgets,
      leagueCategories,
      currentAuctionPlayerId: currentPlayerId,
      espnDomAuctionValues,
    });
  }, [
    rankings,
    auctionValues,
    allPicks,
    myRoster,
    remainingBudget,
    totalTeams,
    rosterSize,
    teamRosters.size, // Use .size instead of Map ref to avoid stale reference issues
    myTeamId,
    allTeamBudgets,
    leagueCategories,
    draftFormat,
    currentPlayerId, // Recompute on new nomination (not bid changes)
    espnDomAuctionValues,
    detectedRosterSlots, // Recompute when roster slots are detected for the first time
  ]);
}
