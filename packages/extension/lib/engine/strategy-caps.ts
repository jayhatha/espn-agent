/**
 * strategy-caps.ts
 *
 * Shared bid cap logic used by both the engine (for UI display) and the
 * auto-bid controller (for actual bidding). Keeps the sidebar's BidVerdict
 * and the controller's bid ceiling in sync.
 *
 * Pure functions: no Zustand reads, no DOM access, no side effects.
 */

import { getPositionalWeight, getSpTierCap } from "./draft-constants";

export interface StrategyCapInput {
  /** Raw maxBid from bid optimizer binary search */
  rawMaxBid: number;
  /** ESPN Average Salary for this player (null if not available) */
  espnAsv: number | null;
  /** Whether this player is in the ideal roster as anchor/core */
  isIdealTarget: boolean;
  /** Whether this player is PL undervalued (high rank, low ASV) */
  isPLUndervalued: boolean;
  /** Whether this player is an opportunity (ranked + below market) */
  isOpportunity: boolean;
  /** Whether this player is ranked value (sub-$5, ranked ≤200) */
  isRankedValue: boolean;
  /** External ranking position (e.g., PitcherList) */
  externalRank: number | null;
  /** Whether this player is a pitcher (SP or RP) */
  isPitcher: boolean;
  /** Whether this player is specifically SP */
  isSP: boolean;
  /** Player's eligible positions */
  positions: string[];
  /** Primary position (for catcher dampening) */
  primaryPosition: string | null;
  /** Pitcher/hitter budget split preference (0-100, default 75) */
  pitcherHitterSplit: number;
  /** Number of SPs already on my roster */
  spCount: number;
  /** Remaining C slots (0 = filled) */
  catcherSlotsRemaining: number;
  /** Whether endgame mode is active (budget ≤ $20) */
  isEndgame: boolean;
  /** Current inflation factor */
  inflationFactor: number;
}

export interface StrategyCapResult {
  /** Strategy-adjusted bid cap */
  bidCap: number;
  /** Whether the player qualifies for any bid path */
  shouldBid: boolean;
  /** Which bid path was used */
  bidPath: "IDEAL" | "PL_UNDERVALUED" | "RANKED_VALUE" | "OPPORTUNITY" | "NONE";
  /** Human-readable explanation of cap computation */
  capSource: string;
}

/**
 * Compute the strategy-adjusted bid cap for a nominated player.
 *
 * Applies the same caps used by the auto-bid controller:
 * 1. Base cap from bid path (IDEAL/PL_UNDERVALUED/RANKED_VALUE/OPPORTUNITY)
 * 2. Pitcher dampening (×pitcherMultiplier)
 * 3. Catcher dampening (×0.5 when C slot filled)
 * 4. Positional weight bonus (+1 to +4)
 * 5. SP tier cap ($18/$12/$10/$5/$3)
 * 6. Endgame dampening (×0.7)
 * 7. Inflation adjustment (+2 when > 1.10)
 */
export function computeStrategyBidCap(input: StrategyCapInput): StrategyCapResult {
  // Determine bid path and base cap
  let bidCap: number;
  let bidPath: StrategyCapResult["bidPath"];
  let capSource: string;

  if (input.isIdealTarget) {
    bidPath = "IDEAL";
    if (input.espnAsv != null) {
      bidCap = Math.ceil(input.espnAsv * 1.1);
      capSource = `IDEAL, ASV $${input.espnAsv} +10%`;
    } else {
      // No ASV — use raw engine maxBid
      bidCap = input.rawMaxBid;
      capSource = `IDEAL, engine maxBid $${input.rawMaxBid}`;
    }
  } else if (input.isPLUndervalued) {
    bidPath = "PL_UNDERVALUED";
    bidCap = Math.ceil(input.espnAsv! * 1.15);
    capSource = `PL UNDERVALUED, rank #${input.externalRank} ASV $${input.espnAsv} +15%`;
  } else if (input.isRankedValue) {
    bidPath = "RANKED_VALUE";
    const rank = input.externalRank!;
    const premium = rank <= 50 ? 2 : rank <= 100 ? 1 : 0;
    bidCap = Math.ceil(input.espnAsv! + premium);
    capSource = `RANKED VALUE, rank #${rank} ASV $${input.espnAsv} +$${premium}`;
  } else if (input.isOpportunity) {
    bidPath = "OPPORTUNITY";
    bidCap = input.espnAsv!;
    capSource = `OPPORTUNITY, ASV $${input.espnAsv}`;
  } else {
    // No qualifying path — use raw maxBid but mark as no-bid
    return {
      bidCap: input.rawMaxBid,
      shouldBid: false,
      bidPath: "NONE",
      capSource: "no qualifying bid path",
    };
  }

  // Apply pitcher dampening
  if (input.isPitcher) {
    const pitcherMultiplier = (100 - input.pitcherHitterSplit) / 50;
    bidCap = Math.max(1, Math.ceil(bidCap * pitcherMultiplier));
    capSource += ` → pitcher ×${pitcherMultiplier.toFixed(2)}`;
  }

  // Apply catcher dampening (50% when C slot already filled)
  if (input.primaryPosition === "C" && input.catcherSlotsRemaining <= 0) {
    bidCap = Math.max(1, Math.ceil(bidCap * 0.5));
    capSource += ` → C filled ×0.5`;
  }

  // Apply positional weight bonus
  const posWeight = getPositionalWeight(input.positions);
  if (posWeight > 0) {
    bidCap += posWeight;
    capSource += ` → pos +${posWeight}`;
  }

  // Apply SP tier cap
  if (input.isSP) {
    const tierCap = getSpTierCap(input.spCount);
    if (bidCap > tierCap) {
      bidCap = tierCap;
      capSource += ` → SP${input.spCount + 1} cap $${tierCap}`;
    }
  }

  // Apply endgame dampening (30% reduction)
  if (input.isEndgame) {
    bidCap = Math.max(1, Math.ceil(bidCap * 0.7));
    capSource += ` → endgame ×0.7`;
  }

  // Apply inflation adjustment (+$2 when inflation > 1.10)
  if (input.inflationFactor > 1.10) {
    bidCap += 2;
    capSource += ` → inflation +2`;
  }

  return {
    bidCap,
    shouldBid: true,
    bidPath,
    capSource,
  };
}

/**
 * Classify a player's bid path based on ideal roster match, external rank,
 * and ESPN ASV. Used by both the engine and auto-bid controller.
 */
export function classifyBidPath(params: {
  isIdealTarget: boolean;
  isPLUndervalued: boolean;
  isOpportunity: boolean;
  isRankedValue: boolean;
}): "IDEAL" | "PL_UNDERVALUED" | "RANKED_VALUE" | "OPPORTUNITY" | "NONE" {
  if (params.isIdealTarget) return "IDEAL";
  if (params.isPLUndervalued) return "PL_UNDERVALUED";
  if (params.isRankedValue) return "RANKED_VALUE";
  if (params.isOpportunity) return "OPPORTUNITY";
  return "NONE";
}

/**
 * Check if a player is PL undervalued based on external rank and ASV.
 */
export function isPLUndervaluedCheck(
  externalRank: number | null,
  espnAsv: number | null,
  isSP: boolean,
): boolean {
  if (externalRank == null || espnAsv == null) return false;
  if (isSP) {
    return (externalRank <= 50 && espnAsv < 15) || (externalRank <= 100 && espnAsv < 10);
  }
  return (externalRank <= 30 && espnAsv < 20) || (externalRank <= 75 && espnAsv < 12);
}
