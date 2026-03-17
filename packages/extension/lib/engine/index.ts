import type { DraftEngineInput, DraftEngineSignals, SGPVectors, RosterOptimizationSignal, InflationSignal, IdealRosterSignal, IdealRosterPlayer, CategoryProgress } from "./types";
import { computeEnhancedScarcity } from "./scarcity";
import { computeCategoryGaps } from "./category-gap";
import { computeBudgetCurve } from "./budget-curve";
import { generateAlerts } from "./alerts";
import { computeInflation } from "./inflation";
import { buildFgPlayerPool } from "./archetype";
import { normalizeName } from "./normalizer";
import { computeProjectedStandings } from "./projected-standings";
import { buildSGPVectors } from "./sgp";
import { optimizeRoster } from "./roster-optimizer";
import { getZeroCoverageCategories, findBestFloorPick } from "./category-floor";
import { buildOpponentModel, estimateMarketPrice, computePositionCompetition } from "./opponent-model";
import { computeExternalRankBoost } from "./rank-boost";
import { getSpTierCap } from "./draft-constants";
import { calculateFinalRate } from "@espn-fantasy/shared";
import { logger } from "../logger";
import { runSimulationInWorker } from "./simulation-worker-client";
import { runBidOptimizerInWorker } from "./bid-optimizer-worker-client";
import type { SimulationWorkerRequest, SerializedNominationInput } from "./simulation-worker";
import type { BidOptimizerWorkerResponse } from "./bid-optimizer-worker";
import {
  fgLeaderboardHittersData,
  fgLeaderboardPitchersData,
  fgAuctionHittersData,
  fgAuctionPitchersData,
} from "../fangraphs-data";
import type { FgHitterProjection, FgPitcherProjection } from "../fangraphs-data";
import type { PoolPlayer, TargetRecommendation, ProjectedStandingsSignal, EnhancedScarcitySignal, SimDraftState, SimTeamState, ForwardSimulationSignal } from "./types";

export type { DraftEngineSignals, DraftEngineInput, DraftAlert, InflationSignal, EnhancedScarcitySignal, CategoryGapSignal, BudgetCurveSignal, RosterOptimizationSignal, ProjectedStandingsSignal, ForwardSimulationSignal, SimulationOutcome, NominationRecommendation, DecisionComparison, DraftTargetRecommendation, IdealRosterSignal, IdealRosterPlayer } from "./types";

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
  BN: 3,
};

// ============================================================
// findBestSlotForPositions — slot assignment for drafted players
// ============================================================

/** Same priority as roster-optimizer: dedicated first, then flex */
const SLOT_ORDER = ["C", "SS", "2B", "3B", "1B", "OF", "SP", "RP", "DH", "CI", "MI", "UTIL", "P", "BN"];
const FLEX_MAP: Record<string, string[]> = {
  CI: ["1B", "3B"], MI: ["2B", "SS"],
  DH: ["C", "1B", "2B", "3B", "SS", "OF", "DH"],
  UTIL: ["C", "1B", "2B", "3B", "SS", "OF", "DH"],
  P: ["SP", "RP"], BN: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"],
};
const DEDICATED = new Set(["C", "SS", "2B", "3B", "1B", "OF", "SP", "RP"]);

function normalizePos(pos: string): string {
  const u = pos.toUpperCase();
  if (u === "LF" || u === "CF" || u === "RF") return "OF";
  if (u === "P") return "SP";
  return u;
}

function findBestSlotForPositions(positions: string[], remaining: Map<string, number>): string | null {
  const normed = positions.map(normalizePos);
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
let sgpCacheKey: string = '';  // leagueId + '_' + allPicks.length at last computation

let cachedBidWorkerResult: BidOptimizerWorkerResponse | null = null;
let bidWorkerCacheKey: string = '';  // leagueId + '_' + currentAuctionPlayerId + '_' + allPicks.length + '_' + split

let cachedProjectedStandings: ProjectedStandingsSignal | null = null;
let projectedStandingsCacheKey: string = '';  // leagueId + '_' + allPicks.length at last computation

let cachedSimulation: ForwardSimulationSignal | null = null;
let simulationCacheKey: string = '';  // leagueId + '_' + allPicks.length + '_' + currentAuctionPlayerId

let cachedIdealRoster: IdealRosterSignal | null = null;
let idealRosterCacheKey: string = '';  // leagueId + '_' + allPicks.length + '_' + splitValue

// Module-level projection map caches for inline team stat aggregation
let cachedHitterProjMap: Map<string, FgHitterProjection> | null = null;
let cachedPitcherProjMap: Map<string, FgPitcherProjection> | null = null;

// ============================================================
// buildSimDraftState
// ============================================================

/**
 * Construct a SimDraftState from the current draft state for forward simulation.
 *
 * Seeds categoryTotals and componentTotals from teamDraftedTotals/Components for accurate
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
  teamDraftedTotals: Map<string, Record<string, number>> | null,
  teamDraftedComponents: Map<string, Record<string, number>> | null,
): SimDraftState | null {
  if (input.myTeamId == null || input.teamRosters.size < 3) {
    if (import.meta.env.DEV) logger.warn(`[DraftEngine] buildSimDraftState early exit: myTeamId=${input.myTeamId}, teamRosters.size=${input.teamRosters.size}`);
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

    // categoryTotals from teamDraftedTotals
    const categoryTotals: Record<string, number> =
      teamDraftedTotals?.get(teamId) != null
        ? { ...(teamDraftedTotals.get(teamId)!) }
        : {};

    // componentTotals from teamDraftedComponents
    const componentTotals: Record<string, number> =
      teamDraftedComponents?.get(teamId) != null
        ? { ...(teamDraftedComponents.get(teamId)!) }
        : {};

    return { budget, slotsRemaining, categoryTotals, componentTotals };
  });

  if (myTeamIndex === -1) {
    if (import.meta.env.DEV) logger.warn(`[DraftEngine] buildSimDraftState: myTeamId="${input.myTeamId}" not found in teamRosters keys: [${teamIds.join(', ')}]`);
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
  nameToExternalRank: Map<string, number>,
): RosterOptimizationSignal {
  const t0 = performance.now();

  if (allPlayers.length === 0) {
    return {
      maxBid: 0,
      expectedMarketPrice: 0,
      valueSurplus: 0,
      shouldBid: false,
      strategyBidCap: null,
      bidPath: null,
      capSource: null,
      topTargets: [],
      opponentPressure: {},
      simulationEV: 0,
      simulationStdDev: 0,
      computeTimeMs: Math.round((performance.now() - t0) * 10) / 10,
    };
  }

  const activeTotal = Object.values(activeSlots).reduce((s, v) => s + v, 0);
  const myBudget = input.remainingBudget;

  // Build normalizedName → ASV lookup for market price override.
  // When ESPN ASV is available, use it directly as expected market price
  // instead of the SGP-based estimateMarketPrice() computation.
  // Build playerId→normalizedName from all sources (auctionValues may be empty in practice drafts).
  const nameToAsv = new Map<string, number>();
  if (input.espnDomAuctionValues && Object.keys(input.espnDomAuctionValues).length > 0) {
    const idToName = new Map<number, string>();
    for (const av of input.auctionValues) {
      idToName.set(av.playerId, normalizeName(av.playerName));
    }
    for (const r of input.rankings) {
      if (!idToName.has(r.playerId)) {
        idToName.set(r.playerId, normalizeName(r.playerName));
      }
    }
    for (const pick of input.allPicks) {
      if (!idToName.has(pick.playerId)) {
        idToName.set(pick.playerId, normalizeName(pick.playerName));
      }
    }
    for (const [id, asv] of Object.entries(input.espnDomAuctionValues)) {
      if (asv > 0) {
        const name = idToName.get(Number(id));
        if (name) {
          nameToAsv.set(name, asv);
        }
      }
    }
  }

  // ----------------------------------------------------------------
  // Bid computation moved to Web Worker (Quick Task 58)
  // computeMaxBid + runMonteCarlo no longer run synchronously here.
  // Bid results arrive asynchronously via onBidComplete callback in
  // computeDraftEngine(). This function returns placeholder bid values.
  // ----------------------------------------------------------------

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

  const elapsed = Math.round((performance.now() - t0) * 10) / 10;
  logger.debug(`[DraftEngine] Roster optimization step: ${elapsed}ms`);

  return {
    maxBid: 0,
    expectedMarketPrice: 0,
    valueSurplus: 0,
    shouldBid: false,
    strategyBidCap: null,
    bidPath: null,
    capSource: null,
    topTargets,
    opponentPressure: opponentModel.competitionFactors,
    simulationEV: 0,
    simulationStdDev: 0,
    computeTimeMs: elapsed,
  };
}

// ============================================================
// computeIdealRoster
// ============================================================

/**
 * Classify a player's spend tier based on FanGraphs projected dollar value.
 * anchor: > $20, core: $5-$20, value: < $5
 */
function classifyTier(dollars: number): "anchor" | "core" | "value" {
  if (dollars > 20) return "anchor";
  if (dollars >= 5) return "core";
  return "value";
}

/**
 * Compute the ideal roster for the current draft state.
 *
 * Combines already-drafted players (myRoster) with optimizer picks for remaining
 * slots. Each player is assigned a roster slot and sorted by SLOT_ORDER so the
 * UI shows a roster-position-ordered list.
 *
 * Returns null when allPlayers is empty or leagueCategories is empty.
 */
function computeIdealRoster(
  allPlayers: PoolPlayer[],
  sgpValuesRaw: number[],
  input: DraftEngineInput,
  activeSlots: Record<string, number>,
  remainingSlots: Record<string, number>,
  nameToExternalRank: Map<string, number>,
): IdealRosterSignal | null {
  if (allPlayers.length === 0 || input.leagueCategories.length === 0) {
    return null;
  }

  const t0 = performance.now();

  // Use raw SGP values without rank boost for ideal roster construction.
  // Rank boost biases toward expensive top-ranked players, undermining value drafting.
  // Rank boost is still applied in bid-optimizer for bid recommendations.
  const adjustedSgpValues = allPlayers.map((_player, i) => sgpValuesRaw[i] ?? 0);

  // ---- Deficit-boost logic (when optimizeForTargets is enabled) ----
  // Boosts SGP values of players who contribute to deficit categories relative to winning targets.
  // Creates a new boostedSgpValues array; never modifies adjustedSgpValues.
  let sgpValuesForOptimizer = adjustedSgpValues;

  if (
    input.optimizeForTargets &&
    input.categoryTargets &&
    Object.keys(input.categoryTargets).length > 0 &&
    cachedSGPVectors &&
    cachedHitterProjMap &&
    cachedPitcherProjMap
  ) {
    // 1. Compute drafted totals per category from myRoster projections
    const draftedTotals: Record<string, number> = {};
    for (const drafted of input.myRoster) {
      const nName = normalizeName(drafted.playerName);
      const pitcher = cachedPitcherProjMap.get(nName);
      const hitter = cachedHitterProjMap.get(nName);
      if (pitcher) {
        for (const [k, v] of Object.entries({ W: pitcher.W, SV: pitcher.SV, HLD: pitcher.HLD, K: pitcher.SO, SO: pitcher.SO })) {
          draftedTotals[k] = (draftedTotals[k] ?? 0) + v;
        }
      } else if (hitter) {
        for (const [k, v] of Object.entries({ HR: hitter.HR, R: hitter.R, RBI: hitter.RBI, SB: hitter.SB })) {
          draftedTotals[k] = (draftedTotals[k] ?? 0) + v;
        }
      }
    }

    // 2. Compute deficit ratios for HIGHER_BETTER counting stat categories
    const deficits: { statKey: string; deficitRatio: number }[] = [];
    for (const cat of input.leagueCategories) {
      if (cat.direction === "LOWER_BETTER") continue; // Skip ERA, WHIP
      const target = input.categoryTargets[cat.stat_key];
      if (target == null || target <= 0) continue;
      const drafted = draftedTotals[cat.stat_key] ?? 0;
      const deficitRatio = Math.max(0, 1 - drafted / target);
      if (deficitRatio > 0.1) {
        deficits.push({ statKey: cat.stat_key, deficitRatio });
      }
    }

    if (deficits.length > 0) {
      // 3. Compute per-player deficit contribution scores
      const deficitScores = new Float64Array(allPlayers.length);
      let maxDeficitScore = 0;

      for (let i = 0; i < allPlayers.length; i++) {
        const player = allPlayers[i];
        const nName = player.normalizedName;
        const pitcher = cachedPitcherProjMap.get(nName);
        const hitter = cachedHitterProjMap.get(nName);
        let score = 0;

        for (const { statKey, deficitRatio } of deficits) {
          const catStats = cachedSGPVectors.categoryStats[statKey];
          if (!catStats || catStats.std === 0) continue;

          let playerStatValue = 0;
          if (hitter) {
            const hitterStats: Record<string, number> = { HR: hitter.HR, R: hitter.R, RBI: hitter.RBI, SB: hitter.SB };
            playerStatValue = hitterStats[statKey] ?? 0;
          } else if (pitcher) {
            const pitcherStats: Record<string, number> = { W: pitcher.W, SV: pitcher.SV, HLD: pitcher.HLD, K: pitcher.SO, SO: pitcher.SO, QS: pitcher.QS };
            playerStatValue = pitcherStats[statKey] ?? 0;
          }

          // Normalize by category std and weight by deficit ratio
          score += (playerStatValue / catStats.std) * deficitRatio;
        }

        deficitScores[i] = score;
        if (score > maxDeficitScore) maxDeficitScore = score;
      }

      // 4. Boost SGP values
      if (maxDeficitScore > 0) {
        const DEFICIT_BOOST_FACTOR = 0.5;
        const boosted = new Array<number>(allPlayers.length);
        for (let i = 0; i < allPlayers.length; i++) {
          const normalizedScore = deficitScores[i] / maxDeficitScore;
          boosted[i] = adjustedSgpValues[i] * (1 + DEFICIT_BOOST_FACTOR * normalizedScore);
        }
        sgpValuesForOptimizer = boosted;
      }
    }
  }

  // Use ESPN ASV (market price) as the cost for ideal roster construction.
  // This makes the ideal roster a realistic shopping list that sums to remaining
  // budget at market prices. As we draft below market, the savings flow into
  // upgrading remaining targets. Fall back to FG model dollars when no ASV available.
  //
  // espnAsvByName (normalized name → ASV) is built directly from the ESPN API
  // response in the content script — no cross-ID mapping needed.
  const asvByName = input.espnAsvByName ?? {};
  const asvByNameCount = Object.keys(asvByName).length;
  const hasAsvData = asvByNameCount > 0;

  logger.log(`[IdealRoster] ASV data: espnAsvByName has ${asvByNameCount} entries, espnDomAuctionValues has ${Object.keys(input.espnDomAuctionValues ?? {}).length} entries`);

  const playersForOptimizer = hasAsvData
    ? allPlayers.map(p => {
        const asv = asvByName[p.normalizedName];
        if (asv != null && asv > 0) {
          return { ...p, dollars: asv };
        }
        return p;
      })
    : allPlayers;

  const mappedCount = playersForOptimizer.filter((p, i) => p.dollars !== allPlayers[i].dollars).length;
  const unmappedSample = hasAsvData
    ? allPlayers.filter(p => !(p.normalizedName in asvByName)).slice(0, 3).map(p => p.normalizedName)
    : [];
  const mappedSample = hasAsvData
    ? allPlayers.filter(p => p.normalizedName in asvByName).slice(0, 3).map(p => `${p.name}: FG $${p.dollars} → ASV $${asvByName[p.normalizedName]}`)
    : [];

  logger.log(
    `[IdealRoster] ASV overlay: ${mappedCount}/${allPlayers.length} repriced.` +
    (mappedSample.length > 0 ? ` Mapped: [${mappedSample.join(", ")}]` : "") +
    (unmappedSample.length > 0 ? ` Unmapped: [${unmappedSample.join(", ")}]` : ""),
  );

  // ------------------------------------------------------------------
  // Category floor enforcement: detect zero-coverage active scoring
  // categories and force-lock 1 contributor per zero-coverage category.
  // Uses lockedPlayers so optimizeRoster treats them as pre-assigned.
  // ------------------------------------------------------------------
  const floorLockedPlayers: { player: PoolPlayer; cost: number }[] = [];

  // Compute total remaining slots to determine budget feasibility
  const totalRemainingSlots = Object.values(remainingSlots).reduce((s, v) => s + v, 0);
  const budgetPerSlot = totalRemainingSlots > 0
    ? input.remainingBudget / totalRemainingSlots
    : 0;

  // Only enforce floors when budget is not critically tight (>= $2 per slot average)
  if (budgetPerSlot >= 2) {
    const zeroCats = getZeroCoverageCategories(
      input.myRoster,
      input.leagueCategories,
      cachedPitcherProjMap ?? new Map(),
      cachedHitterProjMap ?? new Map(),
      playersForOptimizer,
    );

    if (import.meta.env.DEV && zeroCats.length > 0) {
      logger.log(`[IdealRoster] Zero-coverage categories: ${zeroCats.join(', ')}`);
    }

    // Track which players have been locked to avoid double-selection
    let availableForFloor = [...playersForOptimizer];

    for (const statKey of zeroCats) {
      // Max cost for floor pick: leave at least $1 per remaining slot (after this pick)
      const slotsAfterThis = totalRemainingSlots - floorLockedPlayers.length - 1;
      const maxFloorCost = Math.max(1, input.remainingBudget
        - floorLockedPlayers.reduce((s, lp) => s + lp.cost, 0)
        - slotsAfterThis);

      const floorPick = findBestFloorPick(statKey, availableForFloor, maxFloorCost);
      if (floorPick) {
        floorLockedPlayers.push({ player: floorPick, cost: floorPick.dollars });
        // Remove from available pool to prevent double-selection
        availableForFloor = availableForFloor.filter(
          p => p.normalizedName !== floorPick.normalizedName
        );

        if (import.meta.env.DEV) {
          logger.log(
            `[IdealRoster] Floor pick for ${statKey}: ${floorPick.name} ($${floorPick.dollars}, ` +
            `${statKey}=${floorPick.stats[statKey] ?? floorPick.stats['SO'] ?? floorPick.stats['K'] ?? 0})`
          );
        }
      }
    }
  }

  // Remove floor-locked players from main pool to prevent double-selection
  const poolAfterFloor = floorLockedPlayers.length > 0
    ? playersForOptimizer.filter(p =>
        !floorLockedPlayers.some(lp => lp.player.normalizedName === p.normalizedName)
      )
    : playersForOptimizer;

  // Rebuild SGP values aligned to poolAfterFloor by name-lookup into
  // allPlayers (which adjustedSgpValues is indexed against). This avoids
  // index misalignment when ASV overlay causes playersForOptimizer !== allPlayers.
  const sgpAfterFloor = floorLockedPlayers.length > 0
    ? poolAfterFloor.map(p => {
        const idx = allPlayers.findIndex(ap => ap.normalizedName === p.normalizedName);
        return idx >= 0 ? sgpValuesForOptimizer[idx] : 0;
      })
    : sgpValuesForOptimizer;

  // Cap pitcher prices by SP tier and enforce hitter budget allocation.
  // Without this, the optimizer selects $50 pitchers that the strategy would
  // never pay more than $18 for (SP1 cap), distorting the ideal roster.
  const PITCHER_POS = new Set(["SP", "RP"]);
  const spCount = input.myRoster.filter(
    p => p.positions.some(pos => pos.toUpperCase() === "SP"),
  ).length;
  const hitterSpent = input.myRoster
    .filter(p => !p.positions.some(pos => PITCHER_POS.has(pos.toUpperCase())))
    .reduce((s, p) => s + (p.cost ?? 0), 0);
  const HITTER_BUDGET_MAX = 200;
  const hitterBudgetRemaining = Math.max(0, HITTER_BUDGET_MAX - hitterSpent);

  const strategyAdjustedPool = poolAfterFloor.map((player) => {
    const isSP = player.positions.some(pos => pos.toUpperCase() === "SP");
    const isPitcher = player.isPitcher;

    if (isSP) {
      // Cap SP prices at their tier ceiling based on how many SPs are already drafted.
      // The optimizer's greedy fill will pick SPs in SGP/$ order, so the first SP
      // selected gets the SP(N+1) tier cap, the second gets SP(N+2), etc.
      // Using the current tier cap for ALL SPs is conservative but prevents the
      // optimizer from suggesting $50 pitchers the strategy would never pay for.
      const tierCap = getSpTierCap(spCount);
      if (player.dollars > tierCap) {
        return { ...player, dollars: tierCap };
      }
    }

    // Cap hitter costs to remaining hitter budget allocation
    if (!isPitcher && player.dollars > hitterBudgetRemaining) {
      return { ...player, dollars: Math.max(1, hitterBudgetRemaining) };
    }

    return player;
  });

  // Optimizer fills remaining slots with remaining budget
  const result = optimizeRoster(
    strategyAdjustedPool,
    sgpAfterFloor,
    input.remainingBudget,
    remainingSlots,
    floorLockedPlayers.length > 0 ? floorLockedPlayers : undefined,
  );

  // Cross-validate myRoster against allPicks to discard stale persisted entries.
  // After page reload, the team ID mismatch bug may leave myRoster populated from
  // chrome.storage.local with players the user never actually drafted. allPicks is
  // rebuilt from DOM on reload and is the authoritative source.
  // Match on playerId first (exact), fall back to normalizedName (handles id=0 edge case).
  const allPicksNormalizedNames = new Set(
    input.allPicks.map(p => normalizeName(p.playerName))
  );
  const allPicksPlayerIds = new Set(
    input.allPicks.filter(p => p.playerId > 0).map(p => p.playerId)
  );
  const validMyRoster = input.myRoster.filter(drafted => {
    if (drafted.playerId > 0 && allPicksPlayerIds.has(drafted.playerId)) return true;
    if (allPicksNormalizedNames.has(normalizeName(drafted.playerName))) return true;
    return false;
  });

  // Assign drafted players to slots using same priority logic
  const draftedSlotMap = new Map<string, number>();
  for (const [slot, count] of Object.entries(activeSlots)) {
    if (count > 0) draftedSlotMap.set(slot, count);
  }

  const draftedPlayers: IdealRosterPlayer[] = [];
  for (const drafted of validMyRoster) {
    const positions = drafted.positions.length > 0 ? drafted.positions : ['UTIL'];
    const slot = findBestSlotForPositions(positions, draftedSlotMap);
    if (slot) {
      const c = draftedSlotMap.get(slot)!;
      if (c > 1) draftedSlotMap.set(slot, c - 1);
      else draftedSlotMap.delete(slot);
    }
    draftedPlayers.push({
      name: drafted.playerName,
      positions: drafted.positions,
      dollars: drafted.cost ?? 0,
      tier: classifyTier(drafted.cost ?? 0),
      sgpValue: 0,
      slot: slot ?? "BN",
      isDrafted: true,
      externalRank: nameToExternalRank.get(normalizeName(drafted.playerName)),
    });
  }

  // Build optimizer picks with their slot assignments.
  // Match by normalizedName (not object identity) because ASV-overlaid players
  // are spread copies and won't === the originals in allPlayers.
  // Use the original allPlayers entry for FanGraphs dollars (tier display)
  // and raw SGP values — ASV overlay only affects optimizer budget math.
  const optimizerPlayers: IdealRosterPlayer[] = result.roster.map((player, i) => {
    const originalPlayer = allPlayers.find(p => p.normalizedName === player.normalizedName) ?? player;
    const poolIdx = allPlayers.indexOf(originalPlayer);
    const sgpValue = sgpValuesRaw[poolIdx] ?? 0;
    return {
      name: player.name,
      positions: player.positions,
      dollars: originalPlayer.dollars,    // FanGraphs $ for tier display (not ASV)
      tier: classifyTier(originalPlayer.dollars),
      sgpValue,
      slot: result.slotAssignments[i] ?? "BN",
      isDrafted: false,
      externalRank: nameToExternalRank.get(player.normalizedName),
    };
  });

  // Combine and sort by SLOT_ORDER
  const players = [...draftedPlayers, ...optimizerPlayers];
  const slotIndex = (slot: string) => {
    const idx = SLOT_ORDER.indexOf(slot);
    return idx >= 0 ? idx : SLOT_ORDER.length;
  };
  players.sort((a, b) => slotIndex(a.slot) - slotIndex(b.slot));

  // Count tier members (optimizer picks only — drafted players are already committed)
  const anchorCount = optimizerPlayers.filter(p => p.tier === "anchor").length;
  const coreCount = optimizerPlayers.filter(p => p.tier === "core").length;
  const valueCount = optimizerPlayers.filter(p => p.tier === "value").length;

  // Compute category progress against winning targets
  let categoryProgress: CategoryProgress[] | undefined;
  if (input.categoryTargets && Object.keys(input.categoryTargets).length > 0 && input.leagueCategories.length > 0 && cachedHitterProjMap && cachedPitcherProjMap) {
    // Accumulate components across ALL players in the ideal roster (drafted + optimizer picks)
    const components: Record<string, number> = {};
    for (const player of players) {
      const nName = normalizeName(player.name);
      const pitcher = cachedPitcherProjMap.get(nName);
      const hitter = cachedHitterProjMap.get(nName);
      if (pitcher) {
        for (const [k, v] of Object.entries({ W: pitcher.W, SV: pitcher.SV, HLD: pitcher.HLD, K: pitcher.SO, SO: pitcher.SO, IP: pitcher.IP, HA: pitcher.HA, ER: pitcher.ER, BBA: pitcher.BBA, QS: pitcher.QS, HRA: pitcher.HRA })) {
          components[k] = (components[k] ?? 0) + v;
        }
      } else if (hitter) {
        for (const [k, v] of Object.entries({ HR: hitter.HR, R: hitter.R, RBI: hitter.RBI, SB: hitter.SB, AB: hitter.AB, H: hitter.H, BB: hitter.BB, HBP: hitter.HBP, SF: hitter.SF, TB: hitter.TB, PA: hitter.PA })) {
          components[k] = (components[k] ?? 0) + v;
        }
      }
    }

    categoryProgress = [];
    for (const cat of input.leagueCategories) {
      const target = input.categoryTargets[cat.stat_key];
      if (target == null) continue;

      let projected: number;
      if (cat.type === "COUNTING") {
        projected = components[cat.stat_key] ?? 0;
      } else if (cat.type === "RATE" && cat.formula_id) {
        try {
          projected = calculateFinalRate(cat.formula_id, {}, components);
          if (!isFinite(projected)) projected = 0;
        } catch {
          projected = 0;
        }
      } else {
        continue;
      }

      let percent: number;
      if (cat.direction === "LOWER_BETTER") {
        // For LOWER_BETTER (ERA, WHIP), lower projected is better
        // percent > 100 means projected is below (better than) target
        percent = target > 0 && projected > 0 ? (target / projected) * 100 : 0;
      } else {
        percent = target > 0 ? (projected / target) * 100 : 0;
      }
      percent = Math.min(percent, 150);

      categoryProgress.push({
        statKey: cat.stat_key,
        label: cat.name ?? cat.stat_key,
        target,
        projected,
        percent,
        direction: cat.direction,
      });
    }
  }

  return {
    players,
    totalSGPValue: result.totalSGPValue,
    budgetUsed: result.budgetUsed,
    unfilledSlots: result.unfilledSlots,
    anchorCount,
    coreCount,
    valueCount,
    computeTimeMs: Math.round((performance.now() - t0) * 10) / 10,
    categoryProgress,
  };
}

// ============================================================
// computeDraftEngine
// ============================================================

export function computeDraftEngine(
  input: DraftEngineInput,
  onSimulationComplete?: (sim: ForwardSimulationSignal) => void,
  onBidComplete?: (bid: BidOptimizerWorkerResponse) => void,
): DraftEngineSignals {
  const t0 = performance.now();

  // Build rankingsMap for O(1) lookups
  const rankingsMap = new Map(input.rankings.map(r => [r.playerId, r]));

  // 1. Inflation model — live computation from draft state
  const inflation = computeInflation(
    input.allPicks,
    input.auctionValues,
    input.allTeamBudgets ?? [],
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

  // Compute initial budget from remaining + spent, split by hitter/pitcher
  const PITCHER_POSITIONS = new Set(["SP", "RP", "P"]);
  let hitterSpent = 0;
  let pitcherSpent = 0;
  for (const p of input.myRoster) {
    const cost = p.cost ?? 0;
    const isPitcher = p.positions.some(pos => PITCHER_POSITIONS.has(pos));
    if (isPitcher) {
      pitcherSpent += cost;
    } else {
      hitterSpent += cost;
    }
  }
  const mySpent = hitterSpent + pitcherSpent;
  const totalBudget = input.remainingBudget + mySpent;

  const budgetCurve = computeBudgetCurve(
    input.remainingBudget,
    remainingRosterSpots,
    totalBudget,
    input.rosterSize,
    inflation.inflationFactor,
    currentPlayerValue,
    hitterSpent,
    pitcherSpent,
  );

  // 5. Generate alerts from all signals
  const alerts = generateAlerts(inflation, scarcity, categoryGaps, budgetCurve);

  // 5b. Compute per-team drafted stat totals (needed by projected standings + simulation)
  let teamDraftedTotals: Map<string, Record<string, number>> | null = null;
  let teamDraftedComponents: Map<string, Record<string, number>> | null = null;
  let teamsAnalyzed = 0;

  if (input.leagueCategories.length > 0 && input.teamRosters.size > 0) {
    // Build FG projection lookup maps by normalized name (module-level cache since data is static)
    if (!cachedHitterProjMap) {
      cachedHitterProjMap = new Map();
      for (const h of fgLeaderboardHittersData) {
        cachedHitterProjMap.set(normalizeName(h.name), h);
      }
    }
    if (!cachedPitcherProjMap) {
      cachedPitcherProjMap = new Map();
      for (const p of fgLeaderboardPitchersData) {
        cachedPitcherProjMap.set(normalizeName(p.name), p);
      }
    }

    // Group allPicks by teamId
    const picksByTeam = new Map<string, Array<{ playerId: number; playerName: string }>>();
    for (const pick of input.allPicks) {
      let team = picksByTeam.get(pick.teamId);
      if (!team) { team = []; picksByTeam.set(pick.teamId, team); }
      team.push({ playerId: pick.playerId, playerName: pick.playerName });
    }

    teamDraftedTotals = new Map();
    teamDraftedComponents = new Map();

    for (const [teamId] of input.teamRosters) {
      const picks = picksByTeam.get(teamId) ?? [];
      if (picks.length === 0) continue;

      const teamComponents: Record<string, number> = {};
      for (const pick of picks) {
        const nName = normalizeName(pick.playerName);
        const pitcher = cachedPitcherProjMap.get(nName);
        const hitter = cachedHitterProjMap.get(nName);
        if (pitcher) {
          // Only accumulate COMPONENTS — never sum rate stats (ERA, WHIP).
          // Rate stats are recomputed from components via calculateFinalRate.
          for (const [k, v] of Object.entries({ W: pitcher.W, SV: pitcher.SV, HLD: pitcher.HLD, K: pitcher.SO, SO: pitcher.SO, IP: pitcher.IP, HA: pitcher.HA, ER: pitcher.ER, BBA: pitcher.BBA, QS: pitcher.QS, HRA: pitcher.HRA })) {
            teamComponents[k] = (teamComponents[k] ?? 0) + v;
          }
        } else if (hitter) {
          // Only accumulate COMPONENTS — never sum rate stats (AVG, OPS).
          // Rate stats are recomputed from components via calculateFinalRate.
          for (const [k, v] of Object.entries({ HR: hitter.HR, R: hitter.R, RBI: hitter.RBI, SB: hitter.SB, AB: hitter.AB, H: hitter.H, BB: hitter.BB, HBP: hitter.HBP, SF: hitter.SF, TB: hitter.TB, PA: hitter.PA })) {
            teamComponents[k] = (teamComponents[k] ?? 0) + v;
          }
        }
      }

      if (Object.keys(teamComponents).length === 0) continue;

      // Compute per-category totals from components
      const catTotals: Record<string, number> = {};
      for (const cat of input.leagueCategories) {
        if (cat.type === "COUNTING") {
          catTotals[cat.stat_key] = teamComponents[cat.stat_key] ?? 0;
        } else if (cat.type === "RATE" && cat.formula_id) {
          try {
            const rate = calculateFinalRate(cat.formula_id, {}, teamComponents);
            catTotals[cat.stat_key] = isFinite(rate) ? rate : 0;
          } catch { catTotals[cat.stat_key] = 0; }
        }
      }

      teamDraftedTotals.set(teamId, catTotals);
      teamDraftedComponents.set(teamId, teamComponents);
      teamsAnalyzed++;
    }
  }

  // Build drafted name set and FG player pool ONCE — shared across projected standings and roster optimization
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

  // Stamp espnAvgSalary onto PoolPlayers when ESPN DOM auction values available.
  // This lets nomination strategy compute overpricing (espnAvgSalary - model dollars).
  if (input.espnDomAuctionValues && Object.keys(input.espnDomAuctionValues).length > 0) {
    const idToNameNom = new Map<number, string>();
    for (const av of input.auctionValues) {
      idToNameNom.set(av.playerId, normalizeName(av.playerName));
    }
    for (const r of input.rankings) {
      if (!idToNameNom.has(r.playerId)) {
        idToNameNom.set(r.playerId, normalizeName(r.playerName));
      }
    }
    for (const pick of input.allPicks) {
      if (!idToNameNom.has(pick.playerId)) {
        idToNameNom.set(pick.playerId, normalizeName(pick.playerName));
      }
    }
    const nameToAsvNom = new Map<string, number>();
    for (const [id, asv] of Object.entries(input.espnDomAuctionValues)) {
      if (asv > 0) {
        const name = idToNameNom.get(Number(id));
        if (name) nameToAsvNom.set(name, asv);
      }
    }
    for (const p of undraftedPlayers) {
      const asv = nameToAsvNom.get(p.normalizedName);
      if (asv != null) {
        p.espnAvgSalary = asv;
      }
    }
  }

  // Top 200 for roster optimization (sort by dollar value)
  const allPlayersOpt: PoolPlayer[] = [...undraftedPlayers]
    .sort((a, b) => b.dollars - a.dollars)
    .slice(0, 200);

  // 5c. Projected standings engine
  let projectedStandings: ProjectedStandingsSignal | null = null;
  if (
    teamDraftedTotals !== null &&
    teamsAnalyzed >= 3 &&
    input.leagueCategories.length > 0
  ) {
    try {
      // Cache: only recompute when pick count or league changes
      const newProjectedStandingsCacheKey = `${input.leagueId ?? 'unknown'}_${input.allPicks.length}`;
      if (newProjectedStandingsCacheKey !== projectedStandingsCacheKey || cachedProjectedStandings === null) {
        cachedProjectedStandings = computeProjectedStandings(
          teamDraftedTotals,
          input.teamRosters,
          input.allPicks,
          input.myTeamId,
          input.leagueCategories,
          undraftedPlayers,
          input.rosterSize,
          input.totalTeams,
          teamDraftedComponents ?? new Map(),
        );
        projectedStandingsCacheKey = newProjectedStandingsCacheKey;
      }
      projectedStandings = cachedProjectedStandings;
    } catch (e) {
      if (import.meta.env.DEV) logger.warn("[DraftEngine] Projected standings failed:", e);
    }
  }

  // 6. Roster optimization (SGP-based max bid, Monte Carlo, opponent model)
  // Build shared player pool, SGP vectors, and opponent model (hoisted from computeRosterOptimization
  // so Step 7 simulation can access the same data without recomputation).
  // allPlayersOpt already built above (shared with projected standings).

  // Use detected roster slots when available, fall back to DEFAULT_ROSTER_SLOTS
  let activeSlotsOpt = input.rosterSlots ?? DEFAULT_ROSTER_SLOTS;

  // Reconcile slot total with rosterSize (source of truth from Position Tracker DOM).
  // If the slot definitions sum to a different total than rosterSize, adjust BN so
  // Ideal Roster and Budget Pacing show the same total roster count.
  const activeTotalOpt = Object.values(activeSlotsOpt).reduce((s, v) => s + v, 0);
  if (input.rosterSize > 0 && activeTotalOpt !== input.rosterSize) {
    const diff = input.rosterSize - activeTotalOpt;
    const reconciled = { ...activeSlotsOpt };
    reconciled.BN = Math.max(0, (reconciled.BN ?? 0) + diff);
    activeSlotsOpt = reconciled;
    if (import.meta.env.DEV) logger.log(
      `[DraftEngine] Reconciled roster slots: rosterSize=${input.rosterSize}, slotTotal=${activeTotalOpt}, BN adjusted by ${diff}`,
    );
  }

  // SGP cache: rebuild only when pick count or league changes
  const newSgpCacheKey = `${input.leagueId ?? 'unknown'}_${input.allPicks.length}`;
  if (newSgpCacheKey !== sgpCacheKey || cachedSGPVectors === null) {
    cachedSGPVectors = buildSGPVectors(
      allPlayersOpt,
      input.leagueCategories,
      activeSlotsOpt,
      input.totalTeams,
    );
    sgpCacheKey = newSgpCacheKey;
  }
  const sgpValuesOpt = cachedSGPVectors.playerSGPs;

  // Apply pitcher/hitter split weighting to create adjusted SGP values.
  // The base sgpValuesOpt is preserved (cache-safe); adjustedSgpValuesOpt is
  // used for all downstream optimizer and simulation calls.
  const splitValue = input.pitcherHitterSplit ?? 65;
  const hitterMultiplier = splitValue / 50;           // 65 → 1.3, 50 → 1.0, 20 → 0.4
  const pitcherMultiplier = (100 - splitValue) / 50;  // 65 → 0.7, 50 → 1.0, 80 → 0.4
  const adjustedSgpValuesOpt = sgpValuesOpt.map((sgp, i) => {
    const multiplier = allPlayersOpt[i].isPitcher ? pitcherMultiplier : hitterMultiplier;
    return sgp * multiplier;
  });

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

  // Build normalizedName → externalRank lookup from DraftRankings
  // Hoisted to computeDraftEngine scope so it can be shared with both computeRosterOptimization
  // and computeIdealRoster without duplication.
  const nameToExternalRankOpt = new Map<string, number>();
  for (const r of input.rankings) {
    if (r.externalRank != null) {
      nameToExternalRankOpt.set(normalizeName(r.playerName), r.externalRank);
    }
  }

  let optimization: RosterOptimizationSignal | null = null;
  if (input.leagueCategories.length > 0) {
    try {
      optimization = computeRosterOptimization(
        input,
        inflation,
        projectedStandings,
        scarcity,
        allPlayersOpt,
        adjustedSgpValuesOpt,
        opponentModelOpt,
        activeSlotsOpt,
        remainingSlotsOpt,
        needByPositionOpt,
        weakCategoriesOpt,
        nameToExternalRankOpt,
      );
    } catch (e) {
      if (import.meta.env.DEV) logger.warn("[DraftEngine] Roster optimization failed:", e);
    }
  }

  // 6a. Async bid optimizer dispatch (Quick Task 58 — moved to Web Worker)
  // Fire bid computation to worker when nominated player changes.
  // Results arrive asynchronously via onBidComplete callback.
  const newBidWorkerCacheKey = `${input.leagueId ?? 'unknown'}_${input.currentAuctionPlayerId ?? 'none'}_${input.allPicks.length}_${splitValue}`;

  if (newBidWorkerCacheKey !== bidWorkerCacheKey) {
    // Find nominated player in the available pool (same two-strategy lookup as before)
    let nominatedPlayer: PoolPlayer | undefined;

    if (input.currentAuctionPlayerId != null) {
      // Strategy 1: Match via auctionValues ID lookup -> FG pool name match
      const nominated = input.auctionValues.find(
        av => av.playerId === input.currentAuctionPlayerId,
      );
      if (nominated) {
        const nName = normalizeName(nominated.playerName ?? '');
        nominatedPlayer = allPlayersOpt.find(p => p.normalizedName === nName);
      }

      // Strategy 2: Direct name match from DOM-observed player name
      if (!nominatedPlayer && input.currentAuctionPlayerName) {
        const domName = normalizeName(input.currentAuctionPlayerName);
        nominatedPlayer = allPlayersOpt.find(p => p.normalizedName === domName);
      }
    }

    if (nominatedPlayer) {
      // Build nameToAsv lookup for ESPN ASV market price override
      const nameToAsvBid = new Map<string, number>();
      if (input.espnDomAuctionValues && Object.keys(input.espnDomAuctionValues).length > 0) {
        const idToNameBid = new Map<number, string>();
        for (const av of input.auctionValues) {
          idToNameBid.set(av.playerId, normalizeName(av.playerName));
        }
        for (const r of input.rankings) {
          if (!idToNameBid.has(r.playerId)) {
            idToNameBid.set(r.playerId, normalizeName(r.playerName));
          }
        }
        for (const pick of input.allPicks) {
          if (!idToNameBid.has(pick.playerId)) {
            idToNameBid.set(pick.playerId, normalizeName(pick.playerName));
          }
        }
        for (const [id, asv] of Object.entries(input.espnDomAuctionValues)) {
          if (asv > 0) {
            const name = idToNameBid.get(Number(id));
            if (name) nameToAsvBid.set(name, asv);
          }
        }
      }

      // Look up ESPN ASV by player ID first, then nameToAsv fallback
      const nominatedAsv =
        (input.currentAuctionPlayerId != null
          ? input.espnDomAuctionValues?.[input.currentAuctionPlayerId]
          : undefined)
        ?? nameToAsvBid.get(nominatedPlayer.normalizedName)
        ?? null;

      // Opponent budgets for Monte Carlo
      const opponentBudgets: number[] = [];
      for (const [, budget] of opponentModelOpt.teamBudgets) {
        opponentBudgets.push(budget);
      }

      // Compute my current roster SGP
      let myCurrentRosterSGP = 0;
      for (const drafted of input.myRoster) {
        const draftedNorm = normalizeName(drafted.playerName);
        const poolIdx = allPlayersOpt.findIndex(p => p.normalizedName === draftedNorm);
        if (poolIdx >= 0) {
          myCurrentRosterSGP += adjustedSgpValuesOpt[poolIdx] ?? 0;
        }
      }

      // Serialize OpponentModel Maps -> plain objects for structured clone
      const serializedTeamNeedsBid: Record<string, string[]> = {};
      for (const [teamId, posSet] of opponentModelOpt.teamNeeds.entries()) {
        serializedTeamNeedsBid[teamId] = Array.from(posSet);
      }
      const serializedTeamBudgetsBid: Record<string, number> = Object.fromEntries(
        opponentModelOpt.teamBudgets.entries(),
      );

      const capturedBidKey = newBidWorkerCacheKey;
      runBidOptimizerInWorker({
        nominatedPlayer,
        nominatedAsv,
        availablePlayers: allPlayersOpt,
        sgpValues: adjustedSgpValuesOpt,
        budget: input.remainingBudget,
        rosterSlots: remainingSlotsOpt,
        inflationFactor: inflation.inflationFactor,
        opponentModel: {
          teamNeeds: serializedTeamNeedsBid,
          teamBudgets: serializedTeamBudgetsBid,
          competitionFactors: opponentModelOpt.competitionFactors,
          leagueInflationFactor: opponentModelOpt.leagueInflationFactor,
        },
        myCurrentRosterSGP,
        opponentBudgets,
        numSimulations: 200,
      }).then(result => {
        cachedBidWorkerResult = result;
        bidWorkerCacheKey = capturedBidKey;
        onBidComplete?.(result);
      }).catch(e => {
        if (import.meta.env.DEV) logger.warn("[DraftEngine] Bid optimizer worker failed:", e);
      });
    } else {
      // No nominated player match — clear cache
      bidWorkerCacheKey = newBidWorkerCacheKey;
      cachedBidWorkerResult = null;
    }
  }

  // 7. Forward-looking draft simulation (Phase 28 → Phase 53: moved to Web Worker)
  // Returns cached result synchronously; fires async worker to update on next render.
  const newSimCacheKey = `${input.leagueId ?? 'unknown'}_${input.allPicks.length}_${input.currentAuctionPlayerId ?? 'none'}_${splitValue}`;

  if (newSimCacheKey !== simulationCacheKey || cachedSimulation === null) {
    if (
      input.leagueCategories.length === 0 ||
      input.teamRosters.size < 3 ||
      input.myTeamId == null
    ) {
      if (import.meta.env.DEV) logger.warn(
        `[DraftEngine] Simulation skipped: categories=${input.leagueCategories.length}, teamRosters=${input.teamRosters.size}, myTeamId=${input.myTeamId}`,
      );
      // Reset cache when conditions not met
      cachedSimulation = null;
      simulationCacheKey = newSimCacheKey;
    } else {
      // Performance safeguard: skip simulation in very early draft (< 5% picks made)
      const totalPicksExpected = input.totalTeams * input.rosterSize;
      const draftProgressFraction = totalPicksExpected > 0
        ? input.allPicks.length / totalPicksExpected
        : 0;

      if (import.meta.env.DEV) logger.log(`[DraftEngine] Simulation gate: ${input.allPicks.length}/${totalPicksExpected} picks (${(draftProgressFraction * 100).toFixed(1)}%), threshold=5%`);

      if (draftProgressFraction >= 0.05) {
        const simState = buildSimDraftState(
          allPlayersOpt,
          input,
          opponentModelOpt,
          activeSlotsOpt,
          remainingSlotsOpt,
          teamDraftedTotals,
          teamDraftedComponents,
        );

        if (simState === null) {
          if (import.meta.env.DEV) logger.warn('[DraftEngine] buildSimDraftState returned null — simulation aborted');
          cachedSimulation = null;
          simulationCacheKey = newSimCacheKey;
        } else {
          if (import.meta.env.DEV) logger.log(`[DraftEngine] Firing simulation to worker: ${simState.teamStates.length} teams, ${simState.availableIndices.size} available players, myTeamIdx=${simState.myTeamIndex}`);

          const SIMS_PER_DECISION = 200;
          const TEMPERATURE = 1.0;

          // Resolve nominated player index (stays on main thread — needs normalizeName + auctionValues)
          // Use cachedBidWorkerResult.maxBid when available (async bid worker may have returned);
          // fall back to $1 placeholder so simulation can still run decision comparison
          const bidMaxBid = cachedBidWorkerResult?.maxBid ?? 0;
          let currentAuctionPlayerIndex: number | null = null;
          if (input.currentAuctionPlayerId != null) {
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

            if (nomIdx >= 0) currentAuctionPlayerIndex = nomIdx;
          }

          // Build nomination input (serialize Maps -> plain objects for structured clone)
          const myIdx = simState.myTeamIndex;
          const oppStates = simState.teamStates.filter((_, i) => i !== myIdx);
          let nominationInput: SerializedNominationInput | null = null;
          if (oppStates.length > 0) {
            const availableIndicesArr = Array.from(simState.availableIndices);
            const availableSgps = availableIndicesArr.map(i => adjustedSgpValuesOpt[i] ?? 0);

            // Serialize OpponentModel Maps -> plain objects
            const serializedTeamNeeds: Record<string, string[]> = {};
            for (const [teamId, posSet] of opponentModelOpt.teamNeeds.entries()) {
              serializedTeamNeeds[teamId] = Array.from(posSet);
            }
            const serializedTeamBudgets: Record<string, number> = Object.fromEntries(
              opponentModelOpt.teamBudgets.entries(),
            );

            nominationInput = {
              myTeamIndex: myIdx,
              opponentStates: oppStates,
              availablePlayerIndices: availableIndicesArr,
              availableSgps,
              opponentModel: {
                teamNeeds: serializedTeamNeeds,
                teamBudgets: serializedTeamBudgets,
                competitionFactors: opponentModelOpt.competitionFactors,
                leagueInflationFactor: opponentModelOpt.leagueInflationFactor,
              },
            };
          }

          // Build top candidates for draft targets (top 5 by adjusted SGP)
          const topCandidates: SimulationWorkerRequest["topCandidates"] = [];
          const sortedByAdjSgp = allPlayersOpt
            .map((p, i) => ({ player: p, idx: i, sgp: adjustedSgpValuesOpt[i] ?? 0 }))
            .sort((a, b) => b.sgp - a.sgp);

          for (const entry of sortedByAdjSgp) {
            if (topCandidates.length >= 5) break;
            topCandidates.push({
              name: entry.player.name,
              pos: entry.player.positions[0] ?? '',
              idx: entry.idx,
              bid: Math.max(1, Math.ceil(entry.player.dollars)),
            });
          }

          // Build worker request (Set<number> -> number[])
          const workerRequest: Omit<SimulationWorkerRequest, "requestId"> = {
            allPlayers: allPlayersOpt,
            sgpValues: adjustedSgpValuesOpt,
            categories: input.leagueCategories,
            availableIndices: Array.from(simState.availableIndices),
            teamStates: simState.teamStates,
            myTeamIndex: simState.myTeamIndex,
            currentAuctionPlayerIndex,
            maxBid: bidMaxBid,
            nominationInput,
            topCandidates,
            simsPerDecision: SIMS_PER_DECISION,
            temperature: TEMPERATURE,
          };

          // Fire and forget — update cached result and call callback when done
          const capturedCacheKey = newSimCacheKey;
          runSimulationInWorker(workerRequest).then(result => {
            cachedSimulation = result;
            simulationCacheKey = capturedCacheKey;
            onSimulationComplete?.(result);
          }).catch(e => {
            if (import.meta.env.DEV) logger.warn("[DraftEngine] Simulation worker failed:", e);
          });
        }
      } else {
        // Draft < 5% — update cache key to prevent repeated evaluation on every render
        simulationCacheKey = newSimCacheKey;
        if (import.meta.env.DEV) logger.log('[DraftEngine] Simulation deferred — draft < 5% complete');
      }
    }
  }

  // 6b. Ideal roster optimizer (Phase 29)
  // Cache invalidates on: picks, budget, split, targets, ASV availability.
  // Must include remainingBudget so upgrades recalc when budget changes.
  // Must include ASV count so ideal roster reprices when ESPN API data arrives.
  const targetsKey = input.categoryTargets ? JSON.stringify(input.categoryTargets) : "";
  const asvNameCount = input.espnAsvByName ? Object.keys(input.espnAsvByName).length : 0;
  const newIdealRosterCacheKey = `${input.leagueId ?? 'unknown'}_${input.allPicks.length}_${input.remainingBudget}_${splitValue}_${targetsKey}_${input.optimizeForTargets ? '1' : '0'}_${asvNameCount}`;
  let idealRoster: IdealRosterSignal | null = null;
  if (idealRosterCacheKey !== newIdealRosterCacheKey || cachedIdealRoster === null) {
    try {
      cachedIdealRoster = computeIdealRoster(
        allPlayersOpt,
        adjustedSgpValuesOpt,
        input,
        activeSlotsOpt,
        remainingSlotsOpt,
        nameToExternalRankOpt,
      );
      idealRosterCacheKey = newIdealRosterCacheKey;
    } catch (e) {
      if (import.meta.env.DEV) logger.warn("[DraftEngine] Ideal roster failed:", e);
      cachedIdealRoster = null;
    }
  }
  idealRoster = cachedIdealRoster;

  const elapsed = performance.now() - t0;
  if (elapsed > 300) {
    if (import.meta.env.DEV) logger.warn(`[DraftEngine] Recompute took ${elapsed.toFixed(1)}ms -- exceeds 300ms budget`);
  }

  return {
    inflation,
    scarcity,
    categoryGaps,
    budgetCurve,
    alerts,
    computeTimeMs: Math.round(elapsed * 10) / 10,
    optimization,
    projectedStandings,
    simulation: cachedSimulation,
    idealRoster,
    remainingSlots: remainingSlotsOpt,
  };
}

/**
 * Reset all module-level engine caches.
 * Call at draft initialization when starting a new draft session or when the leagueId changes.
 * Ensures stale recommendations from a previous session do not persist.
 */
export function resetEngineCache(): void {
  cachedSGPVectors = null;
  sgpCacheKey = '';
  cachedBidWorkerResult = null;
  bidWorkerCacheKey = '';
  cachedProjectedStandings = null;
  projectedStandingsCacheKey = '';
  cachedSimulation = null;
  simulationCacheKey = '';
  cachedIdealRoster = null;
  idealRosterCacheKey = '';
  cachedHitterProjMap = null;
  cachedPitcherProjMap = null;
}
