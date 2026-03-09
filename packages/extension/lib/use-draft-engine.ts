import { useMemo, useState, useEffect } from "react";
import { useDraftStore } from "./draft-state";
import { computeDraftEngine } from "./engine";
import type { DraftEngineSignals, ForwardSimulationSignal } from "./engine";
import type { BidOptimizerWorkerResponse } from "./engine/bid-optimizer-worker";

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
    categoryTargets,
  } = useDraftStore();

  // Extract playerId and playerName separately — only changes on new nominations (not bid updates)
  const currentPlayerId = currentAuctionPlayer?.playerId;
  const currentPlayerName = currentAuctionPlayer?.playerName;

  // Async simulation state — updated when worker completes
  const [asyncSimulation, setAsyncSimulation] = useState<ForwardSimulationSignal | null>(null);

  // Async bid state — updated when bid optimizer worker completes
  const [asyncBid, setAsyncBid] = useState<BidOptimizerWorkerResponse | null>(null);

  // Reset async results when the cache key changes (new pick or new nomination)
  // so stale results don't persist after state transitions.
  useEffect(() => {
    setAsyncSimulation(null);
    setAsyncBid(null);
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
        categoryTargets,
      },
      setAsyncSimulation,
      setAsyncBid,
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
    categoryTargets, // Recompute when category targets change
  ]);

  // Merge async simulation and bid results into signals — async results take priority when available
  return useMemo(() => {
    if (!baseSignals) return null;

    const mergedOptimization = baseSignals.optimization && asyncBid
      ? {
          ...baseSignals.optimization,
          maxBid: asyncBid.maxBid,
          expectedMarketPrice: asyncBid.expectedMarketPrice,
          valueSurplus: asyncBid.valueSurplus,
          shouldBid: asyncBid.shouldBid,
          simulationEV: asyncBid.simulationEV,
          simulationStdDev: asyncBid.simulationStdDev,
        }
      : baseSignals.optimization;

    return {
      ...baseSignals,
      optimization: mergedOptimization,
      simulation: asyncSimulation ?? baseSignals.simulation,
    };
  }, [baseSignals, asyncSimulation, asyncBid]);
}
