import type { DraftEngineInput, DraftEngineSignals, SGPVectors, RosterOptimizationSignal, InflationSignal, IdealRosterSignal, IdealRosterPlayer } from "./types";
import { computeEnhancedScarcity } from "./scarcity";
import { computeCategoryGaps } from "./category-gap";
import { computeBudgetCurve } from "./budget-curve";
import { generateAlerts } from "./alerts";
import { buildFgPlayerPool, normalizeName } from "./archetype";
import { computeProjectedStandings } from "./projected-standings";
import { buildSGPVectors } from "./sgp";
import { optimizeRoster } from "./roster-optimizer";
import { computeMaxBid } from "./bid-optimizer";
import { buildOpponentModel, estimateMarketPrice, computePositionCompetition } from "./opponent-model";
import { runMonteCarlo } from "./monte-carlo";
import { computeExternalRankBoost } from "./rank-boost";
import { calculateFinalRate } from "@espn-fantasy/shared";
import { runSimulationInWorker } from "./simulation-worker-client";
import type { SimulationWorkerRequest, SerializedNominationInput } from "./simulation-worker";
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

let cachedIdealRoster: IdealRosterSignal | null = null;
let idealRosterCacheKey: string = '';  // allPicks.length + '_' + splitValue

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
    if (import.meta.env.DEV) console.warn(`[DraftEngine] buildSimDraftState early exit: myTeamId=${input.myTeamId}, teamRosters.size=${input.teamRosters.size}`);
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
    if (import.meta.env.DEV) console.warn(`[DraftEngine] buildSimDraftState: myTeamId="${input.myTeamId}" not found in teamRosters keys: [${teamIds.join(', ')}]`);
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
  // Bid cache: rebuild only when nomination OR pick count OR split changes
  // ----------------------------------------------------------------
  const newBidCacheKey = `${input.currentAuctionPlayerId ?? 'none'}_${input.allPicks.length}_${input.pitcherHitterSplit ?? 65}`;

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

  // Build rank-boosted SGP values for the optimizer
  const adjustedSgpValues = allPlayers.map((player, i) => {
    const rawSgp = sgpValuesRaw[i] ?? 0;
    const extRank = nameToExternalRank.get(player.normalizedName);
    const boost = computeExternalRankBoost(extRank);
    return rawSgp * boost;
  });

  // Build ASV overlay: replace player.dollars with ESPN ASV when available.
  // ASV reflects actual market price, making the optimizer's budget constraint
  // and SGP/$ efficiency sort use realistic auction costs instead of FanGraphs
  // projected values. FanGraphs dollars are preserved on the originals for
  // tier classification and sgpValue display.
  const nameToAsvIdeal = new Map<string, number>();
  if (input.espnDomAuctionValues) {
    for (const av of input.auctionValues) {
      const asv = input.espnDomAuctionValues[av.playerId];
      if (asv != null && asv > 0) {
        nameToAsvIdeal.set(normalizeName(av.playerName), asv);
      }
    }
  }

  const playersForOptimizer = nameToAsvIdeal.size > 0
    ? allPlayers.map(p => {
        const asv = nameToAsvIdeal.get(p.normalizedName);
        return asv != null ? { ...p, dollars: asv } : p;
      })
    : allPlayers;

  // Optimizer fills remaining slots with remaining budget
  const result = optimizeRoster(
    playersForOptimizer,
    adjustedSgpValues,
    input.remainingBudget,
    remainingSlots,
  );

  // Assign drafted players to slots using same priority logic
  const draftedSlotMap = new Map<string, number>();
  for (const [slot, count] of Object.entries(activeSlots)) {
    if (count > 0) draftedSlotMap.set(slot, count);
  }

  const draftedPlayers: IdealRosterPlayer[] = [];
  for (const drafted of input.myRoster) {
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

  return {
    players,
    totalSGPValue: result.totalSGPValue,
    budgetUsed: result.budgetUsed,
    unfilledSlots: result.unfilledSlots,
    anchorCount,
    coreCount,
    valueCount,
    computeTimeMs: Math.round((performance.now() - t0) * 10) / 10,
  };
}

// ============================================================
// computeDraftEngine
// ============================================================

export function computeDraftEngine(
  input: DraftEngineInput,
  onSimulationComplete?: (sim: ForwardSimulationSignal) => void,
): DraftEngineSignals {
  const t0 = performance.now();

  // Build rankingsMap for O(1) lookups
  const rankingsMap = new Map(input.rankings.map(r => [r.playerId, r]));

  // 1. Inflation model — disabled (neutral 1.0 factor), kept as placeholder for type compatibility
  const inflation: InflationSignal = {
    inflationFactor: 1.0,
    rawInflationFactor: 1.0,
    totalRemainingBudget: 0,
    totalRemainingValue: 0,
    confidence: "high",
    percentOverMarket: 0,
  };

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
  const alerts = generateAlerts(scarcity, categoryGaps, budgetCurve);

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
          for (const [k, v] of Object.entries({ W: pitcher.W, SV: pitcher.SV, HLD: pitcher.HLD, K: pitcher.SO, SO: pitcher.SO, IP: pitcher.IP, HA: pitcher.HA, ER: pitcher.ER, BBA: pitcher.BBA, QS: pitcher.QS, HRA: pitcher.HRA, ERA: pitcher.ERA, WHIP: pitcher.WHIP })) {
            teamComponents[k] = (teamComponents[k] ?? 0) + v;
          }
        } else if (hitter) {
          for (const [k, v] of Object.entries({ HR: hitter.HR, R: hitter.R, RBI: hitter.RBI, SB: hitter.SB, AVG: hitter.AVG, OPS: hitter.OPS, AB: hitter.AB, H: hitter.H, BB: hitter.BB, HBP: hitter.HBP, SF: hitter.SF, TB: hitter.TB, PA: hitter.PA })) {
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
      // Cache: only recompute when pick count changes
      if (projectedStandingsCacheKey !== input.allPicks.length || cachedProjectedStandings === null) {
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
        projectedStandingsCacheKey = input.allPicks.length;
      }
      projectedStandings = cachedProjectedStandings;
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[DraftEngine] Projected standings failed:", e);
    }
  }

  // 6. Roster optimization (SGP-based max bid, Monte Carlo, opponent model)
  // Build shared player pool, SGP vectors, and opponent model (hoisted from computeRosterOptimization
  // so Step 7 simulation can access the same data without recomputation).
  // allPlayersOpt already built above (shared with projected standings).

  // Use detected roster slots when available, fall back to DEFAULT_ROSTER_SLOTS
  const activeSlotsOpt = input.rosterSlots ?? DEFAULT_ROSTER_SLOTS;

  // Warn if rosterSize differs from active slot total
  const activeTotalOpt = Object.values(activeSlotsOpt).reduce((s, v) => s + v, 0);
  if (input.rosterSize !== activeTotalOpt) {
    if (import.meta.env.DEV) console.warn(
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
      if (import.meta.env.DEV) console.warn("[DraftEngine] Roster optimization failed:", e);
    }
  }

  // 7. Forward-looking draft simulation (Phase 28 → Phase 53: moved to Web Worker)
  // Returns cached result synchronously; fires async worker to update on next render.
  const newSimCacheKey = `${input.allPicks.length}_${input.currentAuctionPlayerId ?? 'none'}_${splitValue}`;

  if (newSimCacheKey !== simulationCacheKey || cachedSimulation === null) {
    if (
      optimization === null ||
      input.leagueCategories.length === 0 ||
      input.teamRosters.size < 3 ||
      input.myTeamId == null
    ) {
      if (import.meta.env.DEV) console.warn(
        `[DraftEngine] Simulation skipped: optimization=${optimization != null}, categories=${input.leagueCategories.length}, teamRosters=${input.teamRosters.size}, myTeamId=${input.myTeamId}`,
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

      if (import.meta.env.DEV) console.log(`[DraftEngine] Simulation gate: ${input.allPicks.length}/${totalPicksExpected} picks (${(draftProgressFraction * 100).toFixed(1)}%), threshold=5%`);

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
          if (import.meta.env.DEV) console.warn('[DraftEngine] buildSimDraftState returned null — simulation aborted');
          cachedSimulation = null;
          simulationCacheKey = newSimCacheKey;
        } else {
          if (import.meta.env.DEV) console.log(`[DraftEngine] Firing simulation to worker: ${simState.teamStates.length} teams, ${simState.availableIndices.size} available players, myTeamIdx=${simState.myTeamIndex}`);

          const SIMS_PER_DECISION = 200;
          const TEMPERATURE = 1.0;

          // Resolve nominated player index (stays on main thread — needs normalizeName + auctionValues)
          let currentAuctionPlayerIndex: number | null = null;
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
            maxBid: optimization.maxBid,
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
            if (import.meta.env.DEV) console.warn("[DraftEngine] Simulation worker failed:", e);
          });
        }
      }
    }
  }

  // 6b. Ideal roster optimizer (Phase 29)
  // Cache invalidates on allPicks.length or split change — recomputes when a new pick is made or split changes.
  const newIdealRosterCacheKey = `${input.allPicks.length}_${splitValue}`;
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
      if (import.meta.env.DEV) console.warn("[DraftEngine] Ideal roster failed:", e);
      cachedIdealRoster = null;
    }
  }
  idealRoster = cachedIdealRoster;

  const elapsed = performance.now() - t0;
  if (elapsed > 300) {
    if (import.meta.env.DEV) console.warn(`[DraftEngine] Recompute took ${elapsed.toFixed(1)}ms -- exceeds 300ms budget`);
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
  };
}
