import { useMemo, useState, useEffect } from "react";
import { useDraftStore } from "./draft-state";
import { computeDraftEngine } from "./engine";
import type { DraftEngineSignals, ForwardSimulationSignal } from "./engine";
import type { BidOptimizerWorkerResponse } from "./engine/bid-optimizer-worker";
import { computeStrategyBidCap } from "./engine/strategy-caps";
import { getRankBasedTierCap } from "./engine/draft-constants";
import { getEspnAsvLookup } from "./espn-asv-data";
import { buildBoardPlayers, computeDraftBoardState } from "./engine/draft-board-engine";
import type { DraftBoardState } from "./engine/draft-board-engine";
import { normalizeName } from "./engine/normalizer";
import { fgAuctionHittersData, fgAuctionPitchersData } from "./fangraphs-data";

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
        // Merge bundled ESPN ASV (pre-draft values) with DOM-scraped ASV.
        // Bundled data provides baseline; DOM scraping overrides with live values.
        espnAsvByName: { ...getEspnAsvLookup(), ...espnAsvByName },
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
          priorityScore: asyncBid.priorityScore,
          evBuffer: asyncBid.evBuffer,
          categoryBonus: asyncBid.categoryBonus,
          playerTags: asyncBid.playerTags,
        }
      : baseSignals.optimization;

    // Apply strategy caps (SP tier, pitcher dampening, hitter budget, etc.)
    if (mergedOptimization && currentPlayerName) {
      const ranking = rankings.find(
        (r) => r.playerName.toLowerCase() === currentPlayerName.toLowerCase(),
      );

      // Use ranking positions, falling back to DOM-detected positions from the auction player
      const playerPositions = ranking?.positions ?? currentAuctionPlayer?.positions ?? [];
      const positionsUpper = playerPositions.map((p: string) => p.toUpperCase());
      const isSP = ranking?.primaryPosition === "SP" || positionsUpper.includes("SP");
      const isRP = ranking?.primaryPosition === "RP" || (!isSP && (positionsUpper.includes("RP") || positionsUpper.includes("P")));

      const draftedSPs = myRoster.filter(
        (p) => p.positions.some((pos) => pos.toUpperCase() === "SP"),
      );
      const spCount = draftedSPs.length;
      const draftedSpPrices = draftedSPs.map(p => p.cost ?? 0);
      const draftedSpTierCaps = draftedSPs.map(p => {
        const spRanking = rankings.find(r => r.playerName.toLowerCase() === p.playerName.toLowerCase());
        return getRankBasedTierCap(spRanking?.externalRank);
      });

      const capResult = computeStrategyBidCap({
        rawMaxBid: mergedOptimization.maxBid,
        isPitcher: isSP || isRP,
        isSP,
        positions: playerPositions,
        primaryPosition: ranking?.primaryPosition ?? (isSP ? "SP" : isRP ? "RP" : null),
        spCount,
        draftedSpPrices,
        draftedSpTierCaps,
        catcherSlotsRemaining: baseSignals.remainingSlots?.["C"] ?? 0,
        externalRank: ranking?.externalRank,
        isEndgame: baseSignals.budgetCurve?.endgameMode ?? false,
        inflationFactor: baseSignals.inflation?.inflationFactor ?? 1.0,
        hitterSpent: baseSignals.budgetCurve?.hitterSpent ?? 0,
        pitcherSpent: baseSignals.budgetCurve?.pitcherSpent ?? 0,
        remainingSlots: baseSignals.remainingSlots ?? undefined,
        playerName: currentPlayerName ?? undefined,
        myRosterNames: myRoster.map(p => p.playerName),
      });

      // Use the strategy cap result directly — it starts from rawMaxBid and
      // applies both increases (positional weight, inflation +2) and decreases
      // (SP tier, hitter budget, endgame). Math.min was wrong here: it prevented
      // positional bonuses from raising the bid above the raw blended value.
      const cappedMaxBid = capResult.bidCap;

      // Override shouldBid: if strategy-caps applied a draft board boost
      // (TARGET or REACH), force shouldBid=true even for negative-EV players.
      const hasBoardBoost = capResult.capSource.includes("TARGET") || capResult.capSource.includes("REACH ×");
      const finalShouldBid = cappedMaxBid > 0 && (mergedOptimization.shouldBid || hasBoardBoost);

      mergedOptimization = {
        ...mergedOptimization,
        maxBid: cappedMaxBid,
        shouldBid: finalShouldBid,
        valueSurplus: cappedMaxBid - mergedOptimization.expectedMarketPrice,
        strategyBidCap: capResult.bidCap,
        bidPath: null,
        capSource: capResult.capSource,
      };
    }

    // Draft board override: if nominated player is on the board and position
    // is needed, use the board's recommended max bid instead of EV-based bid.
    if (mergedOptimization && currentPlayerName) {
      // Build FG$ lookup directly from bundled auction JSONs (not rankings,
      // which may have dollars overwritten by ASV overlay)
      const fgLookup = new Map<string, number>();
      for (const h of fgAuctionHittersData) {
        fgLookup.set(normalizeName(h.name), h.dollars ?? 0);
      }
      for (const p of fgAuctionPitchersData) {
        fgLookup.set(normalizeName(p.name), p.dollars ?? 0);
      }
      // ASV from bundled pre-draft values
      const asvLookup = new Map<string, number>(
        Object.entries(getEspnAsvLookup()).map(([k, v]) => [k, v]),
      );

      const boardPlayers = buildBoardPlayers(fgLookup, asvLookup);
      const totalSpent = (baseSignals.budgetCurve?.hitterSpent ?? 0) + (baseSignals.budgetCurve?.pitcherSpent ?? 0);
      const slotsLeft = baseSignals.remainingSlots
        ? Object.values(baseSignals.remainingSlots).reduce((s, v) => s + v, 0) : 28;
      const avgPerSlot = slotsLeft > 0 ? (260 - totalSpent) / slotsLeft : 0;

      const boardState = computeDraftBoardState(
        boardPlayers,
        myRoster.map(p => ({ playerName: p.playerName, cost: p.cost, positions: p.positions })),
        remainingBudget,
        currentPlayerName,
        avgPerSlot,
        fgLookup,
      );

      // $3/slot reserve calculation
      const RESERVE_PER_SLOT = 3;
      const slotsAfterThis = Math.max(0, slotsLeft - 1);
      const reserveNeeded = slotsAfterThis * RESERVE_PER_SLOT;
      const maxAffordable = Math.max(1, remainingBudget - reserveNeeded);

      if (boardState.nominatedPlayerOnBoard && boardState.recommendedMaxBid > 0) {
        // ON BOARD: use board's recommended bid
        const finalBoardBid = Math.min(boardState.recommendedMaxBid, maxAffordable);

        mergedOptimization = {
          ...mergedOptimization,
          maxBid: finalBoardBid,
          shouldBid: finalBoardBid > 0,
          valueSurplus: finalBoardBid - mergedOptimization.expectedMarketPrice,
          capSource: (mergedOptimization.capSource ?? '') + ` → BOARD: ${boardState.bidReason} (max $${finalBoardBid})`,
        };
      } else if (boardState.nominatedPlayerOnBoard && !boardState.nominatedPositionNeeded) {
        // ON BOARD but position filled — reduce bid
        mergedOptimization = {
          ...mergedOptimization,
          capSource: (mergedOptimization.capSource ?? '') + ` → BOARD: ${boardState.bidReason}`,
        };
      } else {
        // NOT ON BOARD — only bid if:
        // 1) Board is exhausted (no more board players at unfilled positions), OR
        // 2) Elite hitter falling 15%+ below FG$ (opportunistic steal)
        const boardExhausted = boardState.positionsNeeded.length === 0
          || boardState.availablePlayers.filter(p =>
            p.positions.some(pos => boardState.positionsNeeded.includes(pos))
          ).length === 0;

        const fgDollars = mergedOptimization.sgpBreakeven ?? 0; // FG$ stored here
        const marketPrice = mergedOptimization.expectedMarketPrice ?? 0;
        const isEliteDiscount = fgDollars >= 20 && marketPrice > 0
          && marketPrice <= fgDollars * 0.85; // 15%+ below FG$

        if (boardExhausted) {
          // Board exhausted — fall back to standard EV bidding
          mergedOptimization = {
            ...mergedOptimization,
            capSource: (mergedOptimization.capSource ?? '') + ` → board exhausted, EV fallback`,
          };
        } else if (isEliteDiscount) {
          // Elite hitter at 15%+ discount — opportunistic bid
          const discountBid = Math.min(Math.round(fgDollars), maxAffordable);
          mergedOptimization = {
            ...mergedOptimization,
            maxBid: discountBid,
            shouldBid: discountBid > 0,
            capSource: (mergedOptimization.capSource ?? '') + ` → STEAL: $${fgDollars} player at $${marketPrice} (-${Math.round((1 - marketPrice/fgDollars) * 100)}%)`,
          };
        } else {
          // Not on board, board has targets left — PASS
          mergedOptimization = {
            ...mergedOptimization,
            shouldBid: false,
            capSource: (mergedOptimization.capSource ?? '') + ` → PASS (not on board, ${boardState.availablePlayers.length} board players remain)`,
          };
        }
      }

      // Attach board state to signals for UI display
      (mergedOptimization as any).draftBoardState = boardState;
    }

    return {
      ...baseSignals,
      optimization: mergedOptimization,
      simulation: asyncSimulation ?? baseSignals.simulation,
    };
  }, [baseSignals, asyncSimulation, asyncBid, currentPlayerName,
      rankings, myRoster, pitcherHitterSplit]);
}
