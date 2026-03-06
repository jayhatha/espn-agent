import type { DraftEngineInput, DraftEngineSignals, SGPVectors, RosterOptimizationSignal, LeagueAnalysisSignal, ShoppingListSignal } from "./types";
import { computeInflation } from "./inflation";
import { computeEnhancedScarcity } from "./scarcity";
import { computeCategoryGaps } from "./category-gap";
import { computeBudgetCurve } from "./budget-curve";
import { generateAlerts } from "./alerts";
import { buildFgPlayerPool, normalizeName } from "./archetype";
import { computeLeagueAnalysis } from "./league-analysis";
import { computeProjectedStandings } from "./projected-standings";
import { buildSGPVectors } from "./sgp";
import { optimizeRoster } from "./roster-optimizer";
import { computeMaxBid } from "./bid-optimizer";
import { buildOpponentModel, estimateMarketPrice, computePositionCompetition } from "./opponent-model";
import { runMonteCarlo } from "./monte-carlo";
import { computeShoppingList } from "./shopping-list";
import {
  fgLeaderboardHittersData,
  fgLeaderboardPitchersData,
  fgAuctionHittersData,
  fgAuctionPitchersData,
} from "../fangraphs-data";
import type { PoolPlayer, TargetRecommendation, ProjectedStandingsSignal, EnhancedScarcitySignal } from "./types";

export type { DraftEngineSignals, DraftEngineInput, DraftAlert, InflationSignal, EnhancedScarcitySignal, CategoryGapSignal, BudgetCurveSignal, RosterOptimizationSignal, LeagueAnalysisSignal, ProjectedStandingsSignal, ShoppingListSignal, PositionGroup, PositionTarget } from "./types";

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
// findBestSlotForPositions — slot assignment for drafted players
// ============================================================

/** Same priority as roster-optimizer: dedicated first, then flex */
const SLOT_ORDER = ["C", "SS", "2B", "3B", "1B", "OF", "CI", "MI", "UTIL", "P", "BN"];
const FLEX_MAP: Record<string, string[]> = {
  CI: ["1B", "3B"], MI: ["2B", "SS"],
  UTIL: ["C", "1B", "2B", "3B", "SS", "OF", "DH"],
  P: ["SP", "RP"], BN: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"],
};
const DEDICATED = new Set(["C", "SS", "2B", "3B", "1B", "OF", "SP", "RP"]);

function findBestSlotForPositions(positions: string[], remaining: Map<string, number>): string | null {
  const normed = positions.map(p => p.toUpperCase());
  for (const slot of SLOT_ORDER) {
    if ((remaining.get(slot) ?? 0) <= 0) continue;
    if (DEDICATED.has(slot)) {
      if (normed.includes(slot)) return slot;
    } else {
      const eligible = FLEX_MAP[slot];
      if (eligible && normed.some(p => eligible.includes(p))) return slot;
    }
  }
  return null;
}

// ============================================================
// Module-level caches (two-level: SGP + bid)
// ============================================================

let cachedSGPVectors: SGPVectors | null = null;
let sgpCacheKey: number = -1;  // allPicks.length at last computation

let cachedBidResult: { maxBid: ReturnType<typeof computeMaxBid>; monteCarlo: ReturnType<typeof runMonteCarlo> } | null = null;
let bidCacheKey: string = '';  // currentAuctionPlayerId + '_' + allPicks.length

let cachedProjectedStandings: ProjectedStandingsSignal | null = null;
let projectedStandingsCacheKey: number = -1;  // allPicks.length at last computation

// ============================================================
// computeRosterOptimization
// ============================================================

function computeRosterOptimization(
  input: DraftEngineInput,
  inflation: { inflationFactor: number },
  projectedStandings: ProjectedStandingsSignal | null,
  scarcitySignals: EnhancedScarcitySignal[],
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
      shoppingList: null,
    };
  }

  // Extract weak categories for top-target boost
  const weakCategories = new Set(projectedStandings?.myWeakCategories ?? []);

  // Use detected roster slots when available, fall back to DEFAULT_ROSTER_SLOTS
  const activeSlots = input.rosterSlots ?? DEFAULT_ROSTER_SLOTS;

  // Warn if rosterSize differs from active slot total
  const activeTotal = Object.values(activeSlots).reduce((s, v) => s + v, 0);
  if (input.rosterSize !== activeTotal) {
    console.warn(
      `[DraftEngine] rosterSize=${input.rosterSize} differs from active slot total=${activeTotal}. ` +
      `Using ${input.rosterSlots ? "detected" : "default"} roster slots.`,
    );
  }

  // ----------------------------------------------------------------
  // SGP cache: rebuild only when pick count changes (new pick)
  // ----------------------------------------------------------------
  if (sgpCacheKey !== input.allPicks.length || cachedSGPVectors === null) {
    cachedSGPVectors = buildSGPVectors(
      allPlayers,
      input.leagueCategories,
      activeSlots,
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
    activeSlots,
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

  // Compute remaining roster slots by subtracting my drafted players' positions
  // (computed outside bid cache so needByPosition is available for top targets sort)
  const remainingSlots: Record<string, number> = { ...activeSlots };
  for (const drafted of input.myRoster) {
    const slotMap = new Map(Object.entries(remainingSlots).filter(([, v]) => v > 0));
    const positions = drafted.positions.length > 0 ? drafted.positions : ['UTIL'];
    const slot = findBestSlotForPositions(positions, slotMap);
    if (slot && remainingSlots[slot] > 0) {
      remainingSlots[slot]--;
    }
  }
  // Remove zero-count slots
  for (const [slot, count] of Object.entries(remainingSlots)) {
    if (count <= 0) delete remainingSlots[slot];
  }

  // Compute positional need from remaining slots (UTIL, P, BN excluded)
  const needByPosition: Record<string, number> = {};
  for (const [slot, count] of Object.entries(remainingSlots)) {
    if (slot === 'UTIL' || slot === 'P' || slot === 'BN') continue;
    if (count > 0) {
      needByPosition[slot] = count;
    }
  }
  // Expand combo slots: CI need applies to 1B and 3B, MI need applies to 2B and SS
  if (needByPosition['CI'] && needByPosition['CI'] > 0) {
    needByPosition['1B'] = (needByPosition['1B'] ?? 0) + needByPosition['CI'];
    needByPosition['3B'] = (needByPosition['3B'] ?? 0) + needByPosition['CI'];
  }
  if (needByPosition['MI'] && needByPosition['MI'] > 0) {
    needByPosition['2B'] = (needByPosition['2B'] ?? 0) + needByPosition['MI'];
    needByPosition['SS'] = (needByPosition['SS'] ?? 0) + needByPosition['MI'];
  }
  // Remove combo slot keys themselves (players have real positions, not CI/MI)
  delete needByPosition['CI'];
  delete needByPosition['MI'];

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

    // Compute my current roster SGP by matching drafted players to FG pool
    let myCurrentRosterSGP = 0;
    for (const drafted of input.myRoster) {
      const draftedNorm = normalizeName(drafted.playerName);
      const poolIdx = allPlayers.findIndex(p => p.normalizedName === draftedNorm);
      if (poolIdx >= 0) {
        myCurrentRosterSGP += sgpValues[poolIdx] ?? 0;
      }
    }

    maxBidResult = computeMaxBid(
      targetPlayer,
      allPlayers,
      sgpValues,
      myBudget,
      remainingSlots,
      opponentModel,
      inflation.inflationFactor,
    );

    // Opponent budgets for Monte Carlo
    const opponentBudgets: number[] = [];
    for (const [, budget] of opponentModel.teamBudgets) {
      opponentBudgets.push(budget);
    }

    monteCarloResult = runMonteCarlo({
      availablePlayers: allPlayers,
      sgpValues,
      myCurrentRoster: [],
      myCurrentRosterSGP,
      myBudget,
      opponentBudgets,
      rosterSlots: remainingSlots,
      nominatedPlayer,
      nominatedBid: maxBidResult.maxBid,
      numSimulations: 200,
    });

    cachedBidResult = { maxBid: maxBidResult, monteCarlo: monteCarloResult };
    bidCacheKey = newBidCacheKey;
  }

  // ----------------------------------------------------------------
  // Build top 5 targets proportionally split between hitters/pitchers
  // ----------------------------------------------------------------
  // Compute pitcher vs hitter slot counts from activeSlots
  const pitcherSlots = activeSlots["P"] ?? 0;

  // Proportional counts (clamped to ensure at least 1 of each when both pools have players)
  let pitcherCount = Math.round(5 * pitcherSlots / activeTotal);
  pitcherCount = Math.max(1, Math.min(4, pitcherCount));
  let hitterCount = 5 - pitcherCount;

  // If one pool is entirely absent (e.g. pitchers-only league), fall back to all 5 from the other
  const indexedAll = allPlayers.map((p, i) => {
    const sgp = sgpValues[i] ?? 0;
    // Compute max positional need across player's positions
    const maxNeed = p.positions.reduce((max, pos) => {
      const posUpper = pos.toUpperCase();
      return Math.max(max, needByPosition[posUpper] ?? 0);
    }, 0);
    // 50% boost per empty slot at the player's best position
    const positionalAdjustedSgp = sgp * (1 + maxNeed * 0.5);
    // Weak-category boost: 30% per weak category this player contributes to, capped at 2x
    let weakBoost = 1.0;
    if (weakCategories.size > 0) {
      for (const statKey of weakCategories) {
        if ((p.stats[statKey] ?? 0) > 0) {
          weakBoost += 0.3;
        }
      }
      weakBoost = Math.min(weakBoost, 2.0);
    }
    const adjustedSgp = positionalAdjustedSgp * weakBoost;
    return { player: p, sgp, adjustedSgp, index: i };
  });
  const hitterPool = indexedAll.filter(e => !e.player.isPitcher).sort((a, b) => b.adjustedSgp - a.adjustedSgp);
  const pitcherPool = indexedAll.filter(e => e.player.isPitcher).sort((a, b) => b.adjustedSgp - a.adjustedSgp);

  if (hitterPool.length === 0) {
    pitcherCount = 5;
    hitterCount = 0;
  } else if (pitcherPool.length === 0) {
    hitterCount = 5;
    pitcherCount = 0;
  }

  const topHitters = hitterPool.slice(0, hitterCount);
  const topPitchers = pitcherPool.slice(0, pitcherCount);

  // If one pool was short, fill remainder from the other
  const remaining = 5 - topHitters.length - topPitchers.length;
  if (remaining > 0 && topHitters.length < hitterCount) {
    topPitchers.push(...pitcherPool.slice(pitcherCount, pitcherCount + remaining));
  } else if (remaining > 0 && topPitchers.length < pitcherCount) {
    topHitters.push(...hitterPool.slice(hitterCount, hitterCount + remaining));
  }

  const indexedPlayers = [...topHitters, ...topPitchers];

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
      player.dollars,
    ));

    return {
      playerId: index,
      playerName: player.name,
      position: player.positions[0] ?? '',
      sgpValue: Math.round(sgp * 100) / 100,
      dollarValue: player.dollars,
      maxBid: Math.min(myBudget, expectedPrice, Math.max(1, Math.ceil(player.dollars * 2.0))),
      expectedMarketPrice: expectedPrice,
    };
  });

  // ----------------------------------------------------------------
  // Per-position shopping list (Phase 26)
  // ----------------------------------------------------------------
  let shoppingList: ShoppingListSignal | null = null;
  try {
    const slT0 = performance.now();
    shoppingList = computeShoppingList({
      allPlayers,
      sgpValues,
      needByPosition,
      remainingSlots,
      scarcitySignals,
      opponentModel,
      myBudget,
      weakCategories,
      topN: 3,
    });
    const slElapsed = performance.now() - slT0;
    if (slElapsed > 10) {
      console.debug(`[DraftEngine] Shopping list: ${slElapsed.toFixed(1)}ms`);
    }
  } catch (e) {
    console.warn("[DraftEngine] Shopping list computation failed:", e);
  }

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
    shoppingList,
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

  // 5b. League-wide category analysis
  let leagueAnalysis: LeagueAnalysisSignal | null = null;
  if (input.leagueCategories.length > 0 && input.teamRosters.size > 0 && input.myTeamId) {
    try {
      leagueAnalysis = computeLeagueAnalysis(
        input.teamRosters,
        input.allPicks,
        input.myTeamId,
        input.leagueCategories,
        fgLeaderboardHittersData,
        fgLeaderboardPitchersData,
      );
    } catch (e) {
      console.warn("[DraftEngine] League analysis failed:", e);
    }
  }

  // 5c. Projected standings engine
  let projectedStandings: ProjectedStandingsSignal | null = null;
  if (
    leagueAnalysis !== null &&
    leagueAnalysis.teamDraftedTotals != null &&
    leagueAnalysis.teamsAnalyzed >= 3 &&
    input.leagueCategories.length > 0
  ) {
    try {
      // Cache: only recompute when pick count changes
      if (projectedStandingsCacheKey !== input.allPicks.length || cachedProjectedStandings === null) {
        // Build undrafted player pool for replacement-level stats
        const draftedNormalizedNames = new Set<string>();
        for (const pick of input.allPicks) {
          draftedNormalizedNames.add(normalizeName(pick.playerName));
        }
        const { undraftedHitters, undraftedPitchers } = buildFgPlayerPool(
          fgLeaderboardHittersData,
          fgLeaderboardPitchersData,
          fgAuctionHittersData,
          fgAuctionPitchersData,
          draftedNormalizedNames,
        );
        const undraftedPlayers: PoolPlayer[] = [...undraftedHitters, ...undraftedPitchers];

        cachedProjectedStandings = computeProjectedStandings(
          leagueAnalysis.teamDraftedTotals,
          input.teamRosters,
          input.allPicks,
          input.myTeamId,
          input.leagueCategories,
          undraftedPlayers,
          input.rosterSize,
          input.totalTeams,
          leagueAnalysis.teamDraftedComponents ?? new Map(),
        );
        projectedStandingsCacheKey = input.allPicks.length;
      }
      projectedStandings = cachedProjectedStandings;
    } catch (e) {
      console.warn("[DraftEngine] Projected standings failed:", e);
    }
  }

  // 6. Roster optimization (SGP-based max bid, Monte Carlo, opponent model)
  let optimization: RosterOptimizationSignal | null = null;
  if (input.leagueCategories.length > 0) {
    try {
      optimization = computeRosterOptimization(input, inflation, projectedStandings, scarcity);
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
    optimization,
    leagueAnalysis,
    projectedStandings,
  };
}
