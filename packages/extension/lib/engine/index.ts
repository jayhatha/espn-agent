import type { DraftEngineInput, DraftEngineSignals, SGPVectors, RosterOptimizationSignal } from "./types";
import { computeInflation } from "./inflation";
import { computeEnhancedScarcity } from "./scarcity";
import { computeCategoryGaps } from "./category-gap";
import { computeBudgetCurve } from "./budget-curve";
import { generateAlerts } from "./alerts";
import { computeBuildArchetype, buildFgPlayerPool, normalizeName } from "./archetype";
import { buildSGPVectors } from "./sgp";
import { optimizeRoster } from "./roster-optimizer";
import { computeMaxBid } from "./bid-optimizer";
import { buildOpponentModel, estimateMarketPrice, computePositionCompetition } from "./opponent-model";
import { runMonteCarlo } from "./monte-carlo";
import {
  fgLeaderboardHittersData,
  fgLeaderboardPitchersData,
  fgAuctionHittersData,
  fgAuctionPitchersData,
} from "../fangraphs-data";
import type { PoolPlayer, TargetRecommendation } from "./types";

export type { DraftEngineSignals, DraftEngineInput, DraftAlert, InflationSignal, EnhancedScarcitySignal, CategoryGapSignal, BudgetCurveSignal, RosterOptimizationSignal } from "./types";

// ============================================================
// Hardcoded roster slots (per CONTEXT.md locked decision)
// ============================================================

/**
 * Standard fantasy baseball roster slot layout.
 * Hardcoded per Phase 23 CONTEXT.md locked decision.
 * Dynamic detection from ESPN DOM is deferred to a future phase.
 */
const DEFAULT_ROSTER_SLOTS: Record<string, number> = {
  C: 1,
  "1B": 1,
  "2B": 1,
  SS: 1,
  "3B": 1,
  CI: 1,
  MI: 1,
  OF: 4,
  UTIL: 3,
  P: 9,
};

// ============================================================
// Module-level caches (two-level: SGP + bid)
// ============================================================

let cachedSGPVectors: SGPVectors | null = null;
let sgpCacheKey: number = -1;  // allPicks.length at last computation

let cachedBidResult: { maxBid: ReturnType<typeof computeMaxBid>; monteCarlo: ReturnType<typeof runMonteCarlo> } | null = null;
let bidCacheKey: string = '';  // currentAuctionPlayerId + '_' + allPicks.length

// ============================================================
// computeRosterOptimization
// ============================================================

function computeRosterOptimization(
  input: DraftEngineInput,
  inflation: { inflationFactor: number },
): RosterOptimizationSignal {
  const t0 = performance.now();

  // Build drafted name set from ALL picks
  const draftedNormalizedNames = new Set<string>();
  for (const pick of input.allPicks) {
    draftedNormalizedNames.add(normalizeName(pick.playerName));
  }

  // Build FG player pool (undrafted hitters + pitchers)
  const { undraftedHitters, undraftedPitchers } = buildFgPlayerPool(
    fgLeaderboardHittersData,
    fgLeaderboardPitchersData,
    fgAuctionHittersData,
    fgAuctionPitchersData,
    draftedNormalizedNames,
  );

  // Combine and cap at top 200 by dollar value
  const allPlayers: PoolPlayer[] = [
    ...undraftedHitters,
    ...undraftedPitchers,
  ].sort((a, b) => b.dollars - a.dollars).slice(0, 200);

  if (allPlayers.length === 0) {
    return {
      maxBid: 0,
      expectedMarketPrice: 0,
      valueSurplus: 0,
      shouldBid: false,
      topTargets: [],
      opponentPressure: {},
      simulationEV: 0,
      simulationStdDev: 0,
      computeTimeMs: Math.round((performance.now() - t0) * 10) / 10,
    };
  }

  // Warn if rosterSize differs from default total (23 + 5 bench not enforced)
  const defaultTotal = Object.values(DEFAULT_ROSTER_SLOTS).reduce((s, v) => s + v, 0);
  if (input.rosterSize !== defaultTotal) {
    console.warn(
      `[DraftEngine] rosterSize=${input.rosterSize} differs from default slot total=${defaultTotal}. ` +
      `Using hardcoded roster slots per Phase 23 spec.`,
    );
  }

  // ----------------------------------------------------------------
  // SGP cache: rebuild only when pick count changes (new pick)
  // ----------------------------------------------------------------
  if (sgpCacheKey !== input.allPicks.length || cachedSGPVectors === null) {
    cachedSGPVectors = buildSGPVectors(
      allPlayers,
      input.leagueCategories,
      DEFAULT_ROSTER_SLOTS,
      input.totalTeams,
    );
    sgpCacheKey = input.allPicks.length;
  }

  const sgpVectors = cachedSGPVectors;
  const sgpValues = sgpVectors.playerSGPs;

  // ----------------------------------------------------------------
  // Build opponent model
  // ----------------------------------------------------------------
  const opponentModel = buildOpponentModel(
    input.teamRosters,
    input.allTeamBudgets,
    DEFAULT_ROSTER_SLOTS,
    allPlayers,
    input.allPicks,
    inflation.inflationFactor,
  );

  // ----------------------------------------------------------------
  // Bid cache: rebuild only when nomination OR pick count changes
  // ----------------------------------------------------------------
  const newBidCacheKey = `${input.currentAuctionPlayerId ?? 'none'}_${input.allPicks.length}`;
  const mySpent = input.myRoster.reduce((sum, p) => sum + (p.cost ?? 0), 0);
  const myBudget = input.remainingBudget;

  let maxBidResult: ReturnType<typeof computeMaxBid> | null = null;
  let monteCarloResult: ReturnType<typeof runMonteCarlo> | null = null;

  if (newBidCacheKey === bidCacheKey && cachedBidResult !== null) {
    maxBidResult = cachedBidResult.maxBid;
    monteCarloResult = cachedBidResult.monteCarlo;
  } else {
    // Find nominated player in the available pool
    let nominatedPlayer: PoolPlayer | undefined;

    if (input.currentAuctionPlayerId != null) {
      // Try to find by matching ESPN id via auctionValues list
      const nominated = input.auctionValues.find(
        av => av.playerId === input.currentAuctionPlayerId,
      );
      if (nominated) {
        const nName = normalizeName(nominated.playerName ?? '');
        nominatedPlayer = allPlayers.find(p => p.normalizedName === nName);
      }
    }

    // Compute max bid for nominated player (or fallback to first player)
    const targetPlayer = nominatedPlayer ?? allPlayers[0];
    const targetIndex = allPlayers.indexOf(targetPlayer);

    maxBidResult = computeMaxBid(
      targetPlayer,
      allPlayers,
      sgpValues,
      myBudget,
      DEFAULT_ROSTER_SLOTS,
      opponentModel,
    );

    // Opponent budgets for Monte Carlo
    const opponentBudgets: number[] = [];
    for (const [, budget] of opponentModel.teamBudgets) {
      opponentBudgets.push(budget);
    }

    // My current roster as PoolPlayer[] (from locked player perspective, empty for now)
    const myCurrentRoster: PoolPlayer[] = [];

    monteCarloResult = runMonteCarlo({
      availablePlayers: allPlayers,
      sgpValues,
      myCurrentRoster,
      myBudget,
      opponentBudgets,
      rosterSlots: DEFAULT_ROSTER_SLOTS,
      nominatedPlayer,
      nominatedBid: maxBidResult.maxBid,
      numSimulations: 200,
    });

    cachedBidResult = { maxBid: maxBidResult, monteCarlo: monteCarloResult };
    bidCacheKey = newBidCacheKey;
  }

  // ----------------------------------------------------------------
  // Build top 5 targets (sort by SGP descending, compute max bid)
  // ----------------------------------------------------------------
  const indexedPlayers = allPlayers
    .map((p, i) => ({ player: p, sgp: sgpValues[i] ?? 0, index: i }))
    .sort((a, b) => b.sgp - a.sgp)
    .slice(0, 5);

  const topTargets: TargetRecommendation[] = indexedPlayers.map(({ player, sgp, index }) => {
    // Estimate max bid for each target (lighter computation — use SGP share of budget)
    const totalSGP = sgpValues.reduce((s, v) => s + v, 0);
    const totalBudget = Array.from(opponentModel.teamBudgets.values()).reduce((s, v) => s + v, myBudget);
    const competitionFactor = computePositionCompetition(
      player.positions,
      opponentModel.competitionFactors,
    );
    const expectedPrice = Math.max(1, estimateMarketPrice(
      sgp,
      totalSGP,
      totalBudget,
      competitionFactor,
    ));

    return {
      playerId: index,
      playerName: player.name,
      position: player.positions[0] ?? '',
      sgpValue: Math.round(sgp * 100) / 100,
      dollarValue: player.dollars,
      maxBid: Math.min(myBudget, expectedPrice),
      expectedMarketPrice: expectedPrice,
    };
  });

  const elapsed = Math.round((performance.now() - t0) * 10) / 10;
  console.debug(`[DraftEngine] Roster optimization step: ${elapsed}ms`);

  return {
    maxBid: maxBidResult.maxBid,
    expectedMarketPrice: maxBidResult.expectedMarketPrice,
    valueSurplus: maxBidResult.valueSurplus,
    shouldBid: monteCarloResult.shouldBid,
    topTargets,
    opponentPressure: opponentModel.competitionFactors,
    simulationEV: monteCarloResult.expectedTeamValue,
    simulationStdDev: monteCarloResult.valueStdDev,
    computeTimeMs: elapsed,
  };
}

// ============================================================
// computeDraftEngine
// ============================================================

export function computeDraftEngine(input: DraftEngineInput): DraftEngineSignals {
  const t0 = performance.now();

  // Build rankingsMap for O(1) lookups
  const rankingsMap = new Map(input.rankings.map(r => [r.playerId, r]));

  // 1. Inflation model
  const inflation = computeInflation(
    input.allPicks,
    input.auctionValues,
    input.allTeamBudgets,
    input.totalTeams,
    input.remainingBudget,
  );

  // 2. Enhanced scarcity model (uses external rankings + auction $ for tier drops)
  const scarcity = computeEnhancedScarcity(
    input.rankings,
    input.allPicks,
    input.teamRosters,
    input.totalTeams,
    input.myRoster,
    input.myTeamId,
    input.auctionValues,
  );

  // 3. Category gap engine
  const categoryGaps = computeCategoryGaps(
    input.myRoster,
    input.teamRosters,
    rankingsMap,
    input.leagueCategories,
  );

  // 4. Budget curve model
  // Find current nominated player's dollar value (backend values → DOM-scraped fallback)
  let currentPlayerValue = 0;
  if (input.currentAuctionPlayerId) {
    const backendValue = input.auctionValues.find(av => av.playerId === input.currentAuctionPlayerId)?.dollarValue;
    const domValue = input.espnDomAuctionValues?.[input.currentAuctionPlayerId];
    currentPlayerValue = backendValue ?? domValue ?? 0;
  }

  const remainingRosterSpots = Math.max(0, input.rosterSize - input.myRoster.length);

  // Compute initial budget from remaining + spent
  const mySpent = input.myRoster.reduce((sum, p) => sum + (p.cost ?? 0), 0);
  const totalBudget = input.remainingBudget + mySpent;

  const budgetCurve = computeBudgetCurve(
    input.remainingBudget,
    remainingRosterSpots,
    totalBudget,
    input.rosterSize,
    inflation.inflationFactor,
    currentPlayerValue,
  );

  // 5. Generate alerts from all signals
  const alerts = generateAlerts(inflation, scarcity, categoryGaps, budgetCurve);

  // 6. Build archetype analysis (position-aware greedy fill + classification)
  const archetype = computeBuildArchetype(
    input.myRoster,
    input.remainingBudget,
    input.allPicks,
    fgLeaderboardHittersData,
    fgLeaderboardPitchersData,
    fgAuctionHittersData,
    fgAuctionPitchersData,
    input.leagueCategories,
    input.rosterSize,
    input.totalTeams,
  );

  // 7. Roster optimization (SGP-based max bid, Monte Carlo, opponent model)
  let optimization: RosterOptimizationSignal | null = null;
  if (input.leagueCategories.length > 0) {
    try {
      optimization = computeRosterOptimization(input, inflation);
    } catch (e) {
      console.warn("[DraftEngine] Roster optimization failed:", e);
    }
  }

  const elapsed = performance.now() - t0;
  if (elapsed > 300) {
    console.warn(`[DraftEngine] Recompute took ${elapsed.toFixed(1)}ms -- exceeds 300ms budget`);
  }

  return {
    inflation,
    scarcity,
    categoryGaps,
    budgetCurve,
    alerts,
    computeTimeMs: Math.round(elapsed * 10) / 10,
    archetype: archetype.picksAnalyzed >= 3 ? archetype : null,
    optimization,
  };
}
