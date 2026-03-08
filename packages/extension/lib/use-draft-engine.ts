import { useMemo, useState, useEffect } from "react";
import { useDraftStore } from "./draft-state";
import { computeDraftEngine } from "./engine";
import type { DraftEngineSignals, ForwardSimulationSignal } from "./engine";

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
    pitcherHitterSplit,
  } = useDraftStore();

  // Extract playerId and playerName separately — only changes on new nominations (not bid updates)
  const currentPlayerId = currentAuctionPlayer?.playerId;
  const currentPlayerName = currentAuctionPlayer?.playerName;

  // Async simulation state — updated when worker completes
  const [asyncSimulation, setAsyncSimulation] = useState<ForwardSimulationSignal | null>(null);

  // Reset async simulation when the cache key changes (new pick or new nomination)
  // so stale sim results don't persist after state transitions.
  useEffect(() => {
    setAsyncSimulation(null);
  }, [allPicks.length, currentPlayerId]);

  const baseSignals = useMemo(() => {
    // Only compute for auction drafts with data
    if (draftFormat !== "auction") return null;
    if (rankings.length === 0 && auctionValues.length === 0) return null;

    return computeDraftEngine(
      {
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
        currentAuctionPlayerName: currentPlayerName,
        espnDomAuctionValues,
        pitcherHitterSplit,
      },
      setAsyncSimulation,
    );
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
    currentPlayerName, // Name-based fallback for nominated player matching
    espnDomAuctionValues,
    detectedRosterSlots, // Recompute when roster slots are detected for the first time
    pitcherHitterSplit, // Recompute when pitcher/hitter split preference changes
  ]);

  // Merge async simulation into signals — async result takes priority when available
  return useMemo(() => {
    if (!baseSignals) return null;
    return { ...baseSignals, simulation: asyncSimulation ?? baseSignals.simulation };
  }, [baseSignals, asyncSimulation]);
}
