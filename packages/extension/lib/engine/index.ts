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
import { simulateFullDraft, computeSimStandings } from "./draft-simulator";
import { compareDecisions, aggregateOutcomes } from "./decision-comparison";
import { recommendNomination } from "./nomination-strategy";
import { computeExternalRankBoost } from "./rank-boost";
import {
  fgLeaderboardHittersData,
  fgLeaderboardPitchersData,
  fgAuctionHittersData,
  fgAuctionPitchersData,
} from "../fangraphs-data";
import type { PoolPlayer, TargetRecommendation, ProjectedStandingsSignal, EnhancedScarcitySignal, SimDraftState, SimTeamState, ForwardSimulationSignal, CandidateAction, DecisionComparison, DraftTargetRecommendation } from "./types";

export type { DraftEngineSignals, DraftEngineInput, DraftAlert, InflationSignal, EnhancedScarcitySignal, CategoryGapSignal, BudgetCurveSignal, RosterOptimizationSignal, LeagueAnalysisSignal, ProjectedStandingsSignal, ShoppingListSignal, PositionGroup, PositionTarget, ForwardSimulationSignal, SimulationOutcome, NominationRecommendation, DecisionComparison, DraftTargetRecommendation } from "./types";

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

let cachedSimulation: ForwardSimulationSignal | null = null;
let simulationCacheKey: string = '';  // allPicks.length + '_' + currentAuctionPlayerId

// ============================================================
// buildSimDraftState
// ============================================================

/**
 * Construct a SimDraftState from the current draft state for forward simulation.
 *
 * Seeds categoryTotals and componentTotals from leagueAnalysis for accurate
 * mid-draft win probability — without these, all teams start at zero and
 * absolute win probabilities are distorted.
 *
 * Returns null when:
 * - myTeamId is null (can't identify which team is ours)
 * - teamRosters.size < 3 (not enough teams for meaningful simulation)
 */
function buildSimDraftState(
  allPlayers: PoolPlayer[],
  input: DraftEngineInput,
  opponentModel: ReturnType<typeof buildOpponentModel>,
  activeSlots: Record<string, number>,
  myRemainingSlots: Record<string, number>,
  leagueAnalysis: LeagueAnalysisSignal | null,
): SimDraftState | null {
  if (input.myTeamId == null || input.teamRosters.size < 3) {
    console.warn(`[DraftEngine] buildSimDraftState early exit: myTeamId=${input.myTeamId}, teamRosters.size=${input.teamRosters.size}`);
    return null;
  }

  const totalSlots = Object.values(activeSlots).reduce((s, v) => s + v, 0);

  // Count picks per team
  const pickCountByTeam = new Map<string, number>();
  for (const pick of input.allPicks) {
    pickCountByTeam.set(pick.teamId, (pickCountByTeam.get(pick.teamId) ?? 0) + 1);
  }

  const teamIds = Array.from(input.teamRosters.keys());
  let myTeamIndex = -1;

  const teamStates: SimTeamState[] = teamIds.map((teamId, idx) => {
    const isMyTeam = teamId === input.myTeamId || teamId === "myTeam";
    if (isMyTeam) myTeamIndex = idx;

    // Budget
    const budget = (() => {
      if (isMyTeam) return input.remainingBudget;
      const knownBudget = opponentModel.teamBudgets.get(teamId);
      if (knownBudget != null) return knownBudget;
      // Estimate: derive initial budget from user's own data, then subtract opponent's known spend
      const mySpent = input.myRoster.reduce((s, p) => s + (p.cost ?? 0), 0);
      const estimatedInitialBudget = input.remainingBudget + mySpent;
      const initialBudget = estimatedInitialBudget > 0 ? estimatedInitialBudget : 260;
      const teamSpent = input.allPicks
        .filter(p => p.teamId === teamId)
        .reduce((s, p) => s + (p.cost ?? 0), 0);
      return Math.max(1, initialBudget - teamSpent);
    })();

    // slotsRemaining
    let slotsRemaining: Record<string, number>;
    if (isMyTeam) {
      slotsRemaining = { ...myRemainingSlots };
    } else {
      // Approximate opponent slot fill based on pick count
      const pickCount = pickCountByTeam.get(teamId) ?? 0;
      const remainingTotal = Math.max(0, totalSlots - pickCount);

      if (totalSlots <= 0) {
        slotsRemaining = { ...activeSlots };
      } else {
        slotsRemaining = {};
        for (const [slot, count] of Object.entries(activeSlots)) {
          const approx = Math.max(0, Math.round(count * remainingTotal / totalSlots));
          if (approx > 0) slotsRemaining[slot] = approx;
        }
      }
    }

    // categoryTotals from leagueAnalysis.teamDraftedTotals
    const categoryTotals: Record<string, number> =
      leagueAnalysis?.teamDraftedTotals?.get(teamId) != null
        ? { ...(leagueAnalysis.teamDraftedTotals!.get(teamId)!) }
        : {};

    // componentTotals from leagueAnalysis.teamDraftedComponents
    const componentTotals: Record<string, number> =
      leagueAnalysis?.teamDraftedComponents?.get(teamId) != null
        ? { ...(leagueAnalysis.teamDraftedComponents!.get(teamId)!) }
        : {};

    return { budget, slotsRemaining, categoryTotals, componentTotals };
  });

  if (myTeamIndex === -1) {
    console.warn(`[DraftEngine] buildSimDraftState: myTeamId="${input.myTeamId}" not found in teamRosters keys: [${teamIds.join(', ')}]`);
    return null;
  }

  // Build availableIndices: players not yet drafted (not in allPicks by normalized name)
  const draftedNames = new Set<string>();
  for (const pick of input.allPicks) {
    draftedNames.add(normalizeName(pick.playerName));
  }
  const availableIndices = new Set<number>();
  for (let i = 0; i < allPlayers.length; i++) {
    if (!draftedNames.has(allPlayers[i].normalizedName)) {
      availableIndices.add(i);
    }
  }

  return { availableIndices, teamStates, myTeamIndex };
}

// ============================================================
// computeRosterOptimization
// ============================================================

function computeRosterOptimization(
  input: DraftEngineInput,
  inflation: { inflationFactor: number },
  projectedStandings: ProjectedStandingsSignal | null,
  scarcitySignals: EnhancedScarcitySignal[],
  // Hoisted parameters (computed in computeDraftEngine for sharing with simulation step)
  allPlayers: PoolPlayer[],
  sgpValues: number[],
  opponentModel: ReturnType<typeof buildOpponentModel>,
  activeSlots: Record<string, number>,
  remainingSlots: Record<string, number>,
  needByPosition: Record<string, number>,
  weakCategories: Set<string>,
): RosterOptimizationSignal {
  const t0 = performance.now();

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

  const activeTotal = Object.values(activeSlots).reduce((s, v) => s + v, 0);
  const myBudget = input.remainingBudget;

  // Build normalizedName → externalRank lookup from DraftRankings
  const nameToExternalRank = new Map<string, number>();
  for (const r of input.rankings) {
    if (r.externalRank != null) {
      nameToExternalRank.set(normalizeName(r.playerName), r.externalRank);
    }
  }

  // Build normalizedName → ASV lookup for market price override.
  // When ESPN ASV is available, use it directly as expected market price
  // instead of the SGP-based estimateMarketPrice() computation.
  const nameToAsv = new Map<string, number>();
  if (input.espnDomAuctionValues) {
    for (const av of input.auctionValues) {
      const asv = input.espnDomAuctionValues[av.playerId];
      if (asv != null && asv > 0) {
        nameToAsv.set(normalizeName(av.playerName), asv);
      }
    }
  }

  // ----------------------------------------------------------------
  // Bid cache: rebuild only when nomination OR pick count changes
  // ----------------------------------------------------------------
  const newBidCacheKey = `${input.currentAuctionPlayerId ?? 'none'}_${input.allPicks.length}`;

  let maxBidResult: ReturnType<typeof computeMaxBid> | null = null;
  let monteCarloResult: ReturnType<typeof runMonteCarlo> | null = null;

  if (newBidCacheKey === bidCacheKey && cachedBidResult !== null) {
    maxBidResult = cachedBidResult.maxBid;
    monteCarloResult = cachedBidResult.monteCarlo;
  } else {
    // Find nominated player in the available pool
    let nominatedPlayer: PoolPlayer | undefined;

    if (input.currentAuctionPlayerId != null) {
      // Strategy 1: Match via auctionValues ID lookup -> FG pool name match
      const nominated = input.auctionValues.find(
        av => av.playerId === input.currentAuctionPlayerId,
      );
      if (nominated) {
        const nName = normalizeName(nominated.playerName ?? '');
        nominatedPlayer = allPlayers.find(p => p.normalizedName === nName);
      }

      // Strategy 2: Direct name match from DOM-observed player name
      // Handles practice drafts where ESPN player IDs don't match FG/MLBAM IDs
      if (!nominatedPlayer && input.currentAuctionPlayerName) {
        const domName = normalizeName(input.currentAuctionPlayerName);
        nominatedPlayer = allPlayers.find(p => p.normalizedName === domName);
      }
    }

    if (nominatedPlayer) {
      // Compute max bid only when we have a real nominated player match
      const nominatedAsv = nameToAsv.get(nominatedPlayer.normalizedName);
      maxBidResult = computeMaxBid(
        nominatedPlayer,
        allPlayers,
        sgpValues,
        myBudget,
        remainingSlots,
        opponentModel,
        inflation.inflationFactor,
        nominatedAsv,
      );

      // Opponent budgets for Monte Carlo
      const opponentBudgets: number[] = [];
      for (const [, budget] of opponentModel.teamBudgets) {
        opponentBudgets.push(budget);
      }

      // Compute my current roster SGP
      let myCurrentRosterSGP = 0;
      for (const drafted of input.myRoster) {
        const draftedNorm = normalizeName(drafted.playerName);
        const poolIdx = allPlayers.findIndex(p => p.normalizedName === draftedNorm);
        if (poolIdx >= 0) {
          myCurrentRosterSGP += sgpValues[poolIdx] ?? 0;
        }
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
    }

    cachedBidResult = maxBidResult && monteCarloResult
      ? { maxBid: maxBidResult, monteCarlo: monteCarloResult }
      : null;
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
    // External rank boost: up to 1.6x for top-ranked, 0.7x penalty for unranked
    const extRank = nameToExternalRank.get(p.normalizedName);
    const rankBoost = computeExternalRankBoost(extRank);
    const adjustedSgp = positionalAdjustedSgp * weakBoost * rankBoost;
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
    // Use ESPN ASV as expected market price when available; fall back to SGP-based estimate
    const asvPrice = nameToAsv.get(player.normalizedName);
    const expectedPrice = asvPrice != null
      ? Math.max(1, Math.round(asvPrice))
      : Math.max(1, estimateMarketPrice(
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
      nameToAsv,
      nameToExternalRank,
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
    maxBid: maxBidResult?.maxBid ?? 0,
    expectedMarketPrice: maxBidResult?.expectedMarketPrice ?? 0,
    valueSurplus: maxBidResult?.valueSurplus ?? 0,
    shouldBid: monteCarloResult?.shouldBid ?? false,
    topTargets,
    opponentPressure: opponentModel.competitionFactors,
    simulationEV: monteCarloResult?.expectedTeamValue ?? 0,
    simulationStdDev: monteCarloResult?.valueStdDev ?? 0,
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
  // Build shared player pool, SGP vectors, and opponent model (hoisted from computeRosterOptimization
  // so Step 7 simulation can access the same data without recomputation).

  // Build drafted name set from ALL picks
  const draftedNormalizedNamesOpt = new Set<string>();
  for (const pick of input.allPicks) {
    draftedNormalizedNamesOpt.add(normalizeName(pick.playerName));
  }

  // Build FG player pool (undrafted hitters + pitchers)
  const { undraftedHitters, undraftedPitchers } = buildFgPlayerPool(
    fgLeaderboardHittersData,
    fgLeaderboardPitchersData,
    fgAuctionHittersData,
    fgAuctionPitchersData,
    draftedNormalizedNamesOpt,
  );

  // Combine and cap at top 200 by dollar value
  const allPlayersOpt: PoolPlayer[] = [
    ...undraftedHitters,
    ...undraftedPitchers,
  ].sort((a, b) => b.dollars - a.dollars).slice(0, 200);

  // Use detected roster slots when available, fall back to DEFAULT_ROSTER_SLOTS
  const activeSlotsOpt = input.rosterSlots ?? DEFAULT_ROSTER_SLOTS;

  // Warn if rosterSize differs from active slot total
  const activeTotalOpt = Object.values(activeSlotsOpt).reduce((s, v) => s + v, 0);
  if (input.rosterSize !== activeTotalOpt) {
    console.warn(
      `[DraftEngine] rosterSize=${input.rosterSize} differs from active slot total=${activeTotalOpt}. ` +
      `Using ${input.rosterSlots ? "detected" : "default"} roster slots.`,
    );
  }

  // SGP cache: rebuild only when pick count changes (new pick)
  if (sgpCacheKey !== input.allPicks.length || cachedSGPVectors === null) {
    cachedSGPVectors = buildSGPVectors(
      allPlayersOpt,
      input.leagueCategories,
      activeSlotsOpt,
      input.totalTeams,
    );
    sgpCacheKey = input.allPicks.length;
  }
  const sgpValuesOpt = cachedSGPVectors.playerSGPs;

  // Build opponent model
  const opponentModelOpt = buildOpponentModel(
    input.teamRosters,
    input.allTeamBudgets,
    activeSlotsOpt,
    allPlayersOpt,
    input.allPicks,
    inflation.inflationFactor,
  );

  // Compute remaining roster slots by subtracting my drafted players' positions
  const remainingSlotsOpt: Record<string, number> = { ...activeSlotsOpt };
  for (const drafted of input.myRoster) {
    const slotMap = new Map(Object.entries(remainingSlotsOpt).filter(([, v]) => v > 0));
    const positions = drafted.positions.length > 0 ? drafted.positions : ['UTIL'];
    const slot = findBestSlotForPositions(positions, slotMap);
    if (slot && remainingSlotsOpt[slot] > 0) {
      remainingSlotsOpt[slot]--;
    }
  }
  // Remove zero-count slots
  for (const [slot, count] of Object.entries(remainingSlotsOpt)) {
    if (count <= 0) delete remainingSlotsOpt[slot];
  }

  // Compute positional need from remaining slots (UTIL, P, BN excluded)
  const needByPositionOpt: Record<string, number> = {};
  for (const [slot, count] of Object.entries(remainingSlotsOpt)) {
    if (slot === 'UTIL' || slot === 'P' || slot === 'BN') continue;
    if (count > 0) {
      needByPositionOpt[slot] = count;
    }
  }
  // Expand combo slots: CI need applies to 1B and 3B, MI need applies to 2B and SS
  if (needByPositionOpt['CI'] && needByPositionOpt['CI'] > 0) {
    needByPositionOpt['1B'] = (needByPositionOpt['1B'] ?? 0) + needByPositionOpt['CI'];
    needByPositionOpt['3B'] = (needByPositionOpt['3B'] ?? 0) + needByPositionOpt['CI'];
  }
  if (needByPositionOpt['MI'] && needByPositionOpt['MI'] > 0) {
    needByPositionOpt['2B'] = (needByPositionOpt['2B'] ?? 0) + needByPositionOpt['MI'];
    needByPositionOpt['SS'] = (needByPositionOpt['SS'] ?? 0) + needByPositionOpt['MI'];
  }
  delete needByPositionOpt['CI'];
  delete needByPositionOpt['MI'];

  // Extract weak categories for top-target boost
  const weakCategoriesOpt = new Set(projectedStandings?.myWeakCategories ?? []);

  let optimization: RosterOptimizationSignal | null = null;
  if (input.leagueCategories.length > 0) {
    try {
      optimization = computeRosterOptimization(
        input,
        inflation,
        projectedStandings,
        scarcity,
        allPlayersOpt,
        sgpValuesOpt,
        opponentModelOpt,
        activeSlotsOpt,
        remainingSlotsOpt,
        needByPositionOpt,
        weakCategoriesOpt,
      );
    } catch (e) {
      console.warn("[DraftEngine] Roster optimization failed:", e);
    }
  }

  // 7. Forward-looking draft simulation (Phase 28)
  let simulation: ForwardSimulationSignal | null = null;
  const newSimCacheKey = `${input.allPicks.length}_${input.currentAuctionPlayerId ?? 'none'}`;

  if (newSimCacheKey === simulationCacheKey && cachedSimulation !== null) {
    simulation = cachedSimulation;
  } else if (
    optimization === null ||
    input.leagueCategories.length === 0 ||
    input.teamRosters.size < 3 ||
    input.myTeamId == null
  ) {
    console.warn(
      `[DraftEngine] Simulation skipped: optimization=${optimization != null}, categories=${input.leagueCategories.length}, teamRosters=${input.teamRosters.size}, myTeamId=${input.myTeamId}`,
    );
  } else {
    // Performance safeguard: skip simulation in very early draft (< 5% picks made)
    const totalPicksExpected = input.totalTeams * input.rosterSize;
    const draftProgressFraction = totalPicksExpected > 0
      ? input.allPicks.length / totalPicksExpected
      : 0;

    console.warn(`[DraftEngine] Simulation gate: ${input.allPicks.length}/${totalPicksExpected} picks (${(draftProgressFraction * 100).toFixed(1)}%), threshold=5%`);

    if (draftProgressFraction >= 0.05) {
      try {
        const simT0 = performance.now();

        const simState = buildSimDraftState(
          allPlayersOpt,
          input,
          opponentModelOpt,
          activeSlotsOpt,
          remainingSlotsOpt,
          leagueAnalysis,
        );

        if (simState === null) {
          console.warn('[DraftEngine] buildSimDraftState returned null — simulation aborted');
        } else {
          console.warn(`[DraftEngine] Simulation starting: ${simState.teamStates.length} teams, ${simState.availableIndices.size} available players, myTeamIdx=${simState.myTeamIndex}`);
          const SIMS_PER_DECISION = 200;
          const TEMPERATURE = 1.0;

          // Baseline win probability (no decision scenario)
          let winProbability: ReturnType<typeof aggregateOutcomes> | null = null;
          try {
            const baselineSimResults: number[][] = [];
            for (let s = 0; s < SIMS_PER_DECISION; s++) {
              const completed = simulateFullDraft(
                allPlayersOpt, sgpValuesOpt, input.leagueCategories, simState, TEMPERATURE,
              );
              baselineSimResults.push(
                computeSimStandings(completed.teamStates, input.leagueCategories),
              );
            }
            winProbability = aggregateOutcomes(
              simState.myTeamIndex, baselineSimResults, simState.teamStates.length,
            );
            console.warn(`[DraftEngine] Baseline sim done: expectedFinish=${winProbability.expectedFinish.toFixed(1)}, winProb=${(winProbability.winProbability*100).toFixed(0)}%`);
          } catch (e) {
            console.warn('[DraftEngine] Baseline simulation crashed:', e);
          }

          // Decision comparison (bid vs pass) when a player is nominated
          let currentDecision: DecisionComparison | null = null;
          try {
            if (input.currentAuctionPlayerId != null && optimization.maxBid > 0) {
              let nomIdx = -1;

              // Strategy 1: Match via auctionValues ID lookup -> FG pool name match
              const nominated = input.auctionValues.find(
                av => av.playerId === input.currentAuctionPlayerId,
              );
              if (nominated) {
                const nName = normalizeName(nominated.playerName ?? '');
                nomIdx = allPlayersOpt.findIndex(p => p.normalizedName === nName);
              }

              // Strategy 2: Direct name match from DOM-observed player name
              if (nomIdx < 0 && input.currentAuctionPlayerName) {
                const domName = normalizeName(input.currentAuctionPlayerName);
                const domIdx = allPlayersOpt.findIndex(p => p.normalizedName === domName);
                if (domIdx >= 0) nomIdx = domIdx;
              }

              if (nomIdx >= 0) {
                  const candidateActions: CandidateAction[] = [
                    { type: "bid", label: `Bid $${optimization.maxBid}`, playerIndex: nomIdx, bidPrice: optimization.maxBid },
                    { type: "pass", label: "Pass", playerIndex: nomIdx },
                  ];
                  currentDecision = compareDecisions(
                    candidateActions, simState, allPlayersOpt, sgpValuesOpt,
                    input.leagueCategories, SIMS_PER_DECISION, TEMPERATURE,
                  );
              }
            }
          } catch (e) {
            console.warn('[DraftEngine] Decision comparison crashed:', e);
          }

          // Nomination strategy
          let nominationStrategy: ForwardSimulationSignal['nominationStrategy'] = null;
          try {
            const myIdx = simState.myTeamIndex;
            const oppStates = simState.teamStates.filter((_, i) => i !== myIdx);
            if (oppStates.length > 0) {
              const availableForNom = Array.from(simState.availableIndices)
                .map(i => allPlayersOpt[i])
                .filter((p): p is PoolPlayer => p !== undefined);
              const availableSgps = Array.from(simState.availableIndices)
                .map(i => sgpValuesOpt[i] ?? 0);
              nominationStrategy = recommendNomination(
                availableForNom, availableSgps,
                simState.teamStates[myIdx], opponentModelOpt, oppStates, 5,
              );
            }
          } catch (e) {
            console.warn('[DraftEngine] Nomination strategy crashed:', e);
          }

          // Draft Targets — simulate top shopping list candidates to rank by win probability
          let draftTargets: DraftTargetRecommendation[] | null = null;
          try {
            const shoppingList = optimization?.shoppingList;
            if (shoppingList != null && shoppingList.positionGroups.length > 0) {
              // Collect top candidate per position group (max 5)
              const candidates: Array<{ name: string; pos: string; idx: number; bid: number }> = [];
              const seen = new Set<number>();
              for (const group of shoppingList.positionGroups) {
                for (const target of group.targets) {
                  if (candidates.length >= 5) break;
                  // Find player index in allPlayersOpt
                  const pIdx = allPlayersOpt.findIndex(
                    p => p.normalizedName === normalizeName(target.playerName),
                  );
                  if (pIdx >= 0 && !seen.has(pIdx)) {
                    seen.add(pIdx);
                    candidates.push({
                      name: target.playerName,
                      pos: group.position,
                      idx: pIdx,
                      bid: target.maxBid,
                    });
                  }
                }
                if (candidates.length >= 5) break;
              }

              if (candidates.length > 0) {
                const targetActions: CandidateAction[] = candidates.map(c => ({
                  type: "bid" as const,
                  label: c.name,
                  playerIndex: c.idx,
                  bidPrice: c.bid,
                }));

                const SIMS_PER_TARGET = 100;
                const targetComparison = compareDecisions(
                  targetActions, simState, allPlayersOpt, sgpValuesOpt,
                  input.leagueCategories, SIMS_PER_TARGET, TEMPERATURE,
                );

                draftTargets = targetComparison.decisions
                  .map((d, i) => ({
                    playerName: candidates[i].name,
                    position: candidates[i].pos,
                    playerIndex: candidates[i].idx,
                    bidPrice: candidates[i].bid,
                    expectedFinish: d.outcome.expectedFinish,
                    winProbability: d.outcome.winProbability,
                    top3Probability: d.outcome.top3Probability,
                  }))
                  .sort((a, b) => b.winProbability - a.winProbability);
              }
            }
          } catch (e) {
            console.warn('[DraftEngine] Draft targets crashed:', e);
          }

          const simElapsed = performance.now() - simT0;

          if (simElapsed > 800) {
            console.warn(`[DraftEngine] Forward simulation took ${simElapsed.toFixed(1)}ms -- exceeds 800ms budget`);
          }

          simulation = {
            currentDecision,
            winProbability,
            nominationStrategy,
            draftTargets,
            computeTimeMs: Math.round(simElapsed * 10) / 10,
          };
        }

        cachedSimulation = simulation;
        simulationCacheKey = newSimCacheKey;
      } catch (e) {
        console.warn("[DraftEngine] Forward simulation failed:", e);
      }
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
    simulation,
  };
}
