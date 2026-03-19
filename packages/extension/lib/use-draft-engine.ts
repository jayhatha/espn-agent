import { useMemo, useState, useEffect } from "react";
import { useDraftStore } from "./draft-state";
import { computeDraftEngine } from "./engine";
import type { DraftEngineSignals, ForwardSimulationSignal } from "./engine";
import type { BidOptimizerWorkerResponse } from "./engine/bid-optimizer-worker";
import { computeStrategyBidCap } from "./engine/strategy-caps";

export function useDraftEngineSignals(): DraftEngineSignals | null {
  const {
    leagueId,
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
    espnAsvByName,
    draftFormat,
    detectedRosterSlots,
    pitcherHitterSplit,
    categoryTargets,
    optimizeForTargets,
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
  // Include currentPlayerName — playerId may be a hash fallback that doesn't change.
  useEffect(() => {
    setAsyncSimulation(null);
    setAsyncBid(null);
  }, [allPicks.length, currentPlayerId, currentPlayerName]);

  const baseSignals = useMemo(() => {
    // Only compute for auction drafts with data
    if (draftFormat !== "auction") return null;
    if (rankings.length === 0 && auctionValues.length === 0) return null;

    return computeDraftEngine(
      {
        leagueId,
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
        espnAsvByName,
        pitcherHitterSplit,
        categoryTargets,
        optimizeForTargets,
      },
      setAsyncSimulation,
      setAsyncBid,
    );
  }, [
    leagueId,
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
    espnAsvByName, // Recompute when ESPN ASV data arrives from API
    detectedRosterSlots, // Recompute when roster slots are detected for the first time
    pitcherHitterSplit, // Recompute when pitcher/hitter split preference changes
    categoryTargets, // Recompute when category targets change
    optimizeForTargets, // Recompute when optimize-for-targets toggle changes
  ]);

  // Merge async simulation and bid results into signals — async results take priority when available.
  // Apply strategy caps so the sidebar display matches the auto-bid controller's behavior.
  return useMemo(() => {
    if (!baseSignals) return null;

    let mergedOptimization = baseSignals.optimization && asyncBid
      ? {
          ...baseSignals.optimization,
          maxBid: asyncBid.maxBid,
          rawBlendedValue: asyncBid.rawBlendedValue,
          sgpBreakeven: asyncBid.sgpBreakeven,
          expectedMarketPrice: asyncBid.expectedMarketPrice,
          valueSurplus: asyncBid.valueSurplus,
          shouldBid: asyncBid.shouldBid,
          simulationEV: asyncBid.simulationEV,
          simulationStdDev: asyncBid.simulationStdDev,
        }
      : baseSignals.optimization;

    // Apply strategy caps (SP tier, pitcher dampening, hitter budget, etc.)
    if (mergedOptimization && currentPlayerName) {
      const ranking = rankings.find(
        (r) => r.playerName.toLowerCase() === currentPlayerName.toLowerCase(),
      );

      const isSP = ranking?.primaryPosition === "SP";
      const isRP = ranking?.primaryPosition === "RP";

      const draftedSPs = myRoster.filter(
        (p) => p.positions.some((pos) => pos.toUpperCase() === "SP"),
      );
      const spCount = draftedSPs.length;
      const draftedSpPrices = draftedSPs.map(p => p.cost ?? 0);

      const capResult = computeStrategyBidCap({
        rawMaxBid: mergedOptimization.maxBid,
        isPitcher: isSP || isRP,
        isSP,
        positions: ranking?.positions ?? [],
        primaryPosition: ranking?.primaryPosition ?? null,
        spCount,
        draftedSpPrices,
        catcherSlotsRemaining: baseSignals.remainingSlots?.["C"] ?? 0,
        externalRank: ranking?.externalRank,
        isEndgame: baseSignals.budgetCurve?.endgameMode ?? false,
        inflationFactor: baseSignals.inflation?.inflationFactor ?? 1.0,
        hitterSpent: baseSignals.budgetCurve?.hitterSpent ?? 0,
        pitcherSpent: baseSignals.budgetCurve?.pitcherSpent ?? 0,
        remainingSlots: baseSignals.remainingSlots ?? undefined,
      });

      // Use the strategy cap result directly — it starts from rawMaxBid and
      // applies both increases (positional weight, inflation +2) and decreases
      // (SP tier, hitter budget, endgame). Math.min was wrong here: it prevented
      // positional bonuses from raising the bid above the raw blended value.
      const cappedMaxBid = capResult.bidCap;

      mergedOptimization = {
        ...mergedOptimization,
        maxBid: cappedMaxBid,
        valueSurplus: cappedMaxBid - mergedOptimization.expectedMarketPrice,
        strategyBidCap: capResult.bidCap,
        bidPath: null,
        capSource: capResult.capSource,
      };
    }

    return {
      ...baseSignals,
      optimization: mergedOptimization,
      simulation: asyncSimulation ?? baseSignals.simulation,
    };
  }, [baseSignals, asyncSimulation, asyncBid, currentPlayerName,
      rankings, myRoster, pitcherHitterSplit]);
}
