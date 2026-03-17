import { useMemo, useState, useEffect } from "react";
import { useDraftStore } from "./draft-state";
import { computeDraftEngine } from "./engine";
import type { DraftEngineSignals, ForwardSimulationSignal } from "./engine";
import type { BidOptimizerWorkerResponse } from "./engine/bid-optimizer-worker";
import { computeStrategyBidCap, isPLUndervaluedCheck } from "./engine/strategy-caps";
import { normalizeName } from "./engine/normalizer";

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
    detectedRosterSlots, // Recompute when roster slots are detected for the first time
    pitcherHitterSplit, // Recompute when pitcher/hitter split preference changes
    categoryTargets, // Recompute when category targets change
    optimizeForTargets, // Recompute when optimize-for-targets toggle changes
  ]);

  // Merge async simulation and bid results into signals — async results take priority when available
  // Apply strategy caps to make maxBid/shouldBid match auto-bid controller behavior
  return useMemo(() => {
    if (!baseSignals) return null;

    let mergedOptimization = baseSignals.optimization && asyncBid
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

    // Apply strategy caps to the merged optimization result
    if (mergedOptimization && currentPlayerName) {
      const nominatedName = currentPlayerName.toLowerCase();

      // Find ranking for nominated player
      const ranking = rankings.find(
        (r) => r.playerName.toLowerCase() === nominatedName,
      );

      // Find ideal roster match
      const idealPlayers = baseSignals.idealRoster?.players ?? [];
      const idealMatch = idealPlayers.find(
        (p) => !p.isDrafted && p.name.toLowerCase() === nominatedName,
      );

      // Get ESPN ASV
      const espnAsv = currentPlayerId != null
        ? espnDomAuctionValues[currentPlayerId] ?? null
        : null;

      // Classify player
      const isSP = ranking?.primaryPosition === "SP";
      const isRP = ranking?.primaryPosition === "RP";
      const isPitcher = isSP || isRP;
      const isIdealTarget = idealMatch != null &&
        (idealMatch.tier === "anchor" || idealMatch.tier === "core");
      const opportunityRankThreshold = isSP ? 100 : 50;
      const hasHighExternalRank = ranking?.externalRank != null &&
        ranking.externalRank <= opportunityRankThreshold;
      const isOpportunity = hasHighExternalRank && espnAsv != null;
      const plUndervalued = isPLUndervaluedCheck(
        ranking?.externalRank ?? null, espnAsv, isSP,
      );
      const isRankedValue = !isIdealTarget && !plUndervalued && !isOpportunity &&
        espnAsv != null && espnAsv <= 5 &&
        ranking?.externalRank != null && ranking.externalRank <= 200;

      // Count SPs on roster
      const spCount = myRoster.filter(
        (p) => p.positions.some((pos) => pos.toUpperCase() === "SP"),
      ).length;

      const capResult = computeStrategyBidCap({
        rawMaxBid: mergedOptimization.maxBid,
        espnAsv,
        isIdealTarget,
        isPLUndervalued: plUndervalued,
        isOpportunity,
        isRankedValue,
        externalRank: ranking?.externalRank ?? null,
        isPitcher,
        isSP,
        positions: ranking?.positions ?? [],
        primaryPosition: ranking?.primaryPosition ?? null,
        pitcherHitterSplit: pitcherHitterSplit ?? 75,
        spCount,
        catcherSlotsRemaining: baseSignals.remainingSlots?.["C"] ?? 0,
        isEndgame: baseSignals.budgetCurve?.endgameMode ?? false,
        inflationFactor: baseSignals.inflation?.inflationFactor ?? 1.0,
        hitterSpent: baseSignals.budgetCurve?.hitterSpent ?? 0,
        pitcherSpent: baseSignals.budgetCurve?.pitcherSpent ?? 0,
      });

      mergedOptimization = {
        ...mergedOptimization,
        maxBid: capResult.shouldBid
          ? Math.min(mergedOptimization.maxBid, capResult.bidCap)
          : mergedOptimization.maxBid,
        shouldBid: capResult.shouldBid
          ? mergedOptimization.shouldBid
          : false,
        valueSurplus: capResult.shouldBid
          ? Math.min(mergedOptimization.maxBid, capResult.bidCap) - mergedOptimization.expectedMarketPrice
          : mergedOptimization.maxBid - mergedOptimization.expectedMarketPrice,
        strategyBidCap: capResult.bidCap,
        bidPath: capResult.bidPath,
        capSource: capResult.capSource,
      };
    }

    return {
      ...baseSignals,
      optimization: mergedOptimization,
      simulation: asyncSimulation ?? baseSignals.simulation,
    };
  }, [baseSignals, asyncSimulation, asyncBid, currentPlayerName, currentPlayerId,
      rankings, myRoster, espnDomAuctionValues, pitcherHitterSplit]);
}
