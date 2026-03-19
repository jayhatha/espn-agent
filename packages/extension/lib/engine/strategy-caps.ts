/**
 * strategy-caps.ts
 *
 * Shared bid cap logic used by both the engine (for UI display) and the
 * auto-bid controller (for actual bidding). Keeps the sidebar's BidVerdict
 * and the controller's bid ceiling in sync.
 *
 * Value strategy: bid up to the engine's SGP-based maxBid (the highest price
 * where adding the player still improves total team SGP). Strategy adjustments
 * (SP tier caps, pitcher dampening, hitter budget, endgame, inflation) apply
 * on top. No tier-based bid path multipliers — every player gets the same
 * value-driven treatment.
 *
 * Pure functions: no Zustand reads, no DOM access, no side effects.
 */

import { getPositionalWeight, getSpTierCap, HITTER_BUDGET_MAX } from "./draft-constants";

/**
 * Determine where a player would be slotted given their eligible positions
 * and remaining roster slots.
 *
 * Priority: dedicated slot > flex slot (MI/CI) > UTIL > BN
 * Pitchers: P slot > BN (no UTIL for pitchers).
 */
export function determineSlotDestination(
  positions: string[],
  remainingSlots: Record<string, number>,
  isPitcher: boolean,
): "dedicated" | "flex" | "UTIL" | "BN" {
  if (isPitcher) {
    // Pitchers only go to P or BN — no UTIL
    if ((remainingSlots["P"] ?? 0) > 0) return "dedicated";
    return "BN";
  }

  // Check dedicated slots first
  for (const pos of positions) {
    const upper = pos.toUpperCase();
    if ((remainingSlots[upper] ?? 0) > 0) return "dedicated";
  }

  // Check flex slots: MI covers 2B/SS, CI covers 1B/3B
  for (const pos of positions) {
    const upper = pos.toUpperCase();
    if ((upper === "2B" || upper === "SS") && (remainingSlots["MI"] ?? 0) > 0) return "flex";
    if ((upper === "1B" || upper === "3B") && (remainingSlots["CI"] ?? 0) > 0) return "flex";
  }

  // Check UTIL
  if ((remainingSlots["UTIL"] ?? 0) > 0) return "UTIL";

  // No slots available
  return "BN";
}

export interface StrategyCapInput {
  /** Raw maxBid from bid optimizer binary search */
  rawMaxBid: number;
  /** Whether this player is a pitcher (SP or RP) */
  isPitcher: boolean;
  /** Whether this player is specifically SP */
  isSP: boolean;
  /** Player's eligible positions */
  positions: string[];
  /** Primary position (for catcher dampening) */
  primaryPosition: string | null;
  /** Number of SPs already on my roster */
  spCount: number;
  /** Remaining C slots (0 = filled) */
  catcherSlotsRemaining: number;
  /** Whether endgame mode is active (budget ≤ $20) */
  isEndgame: boolean;
  /** Current inflation factor */
  inflationFactor: number;
  /** Total spent on hitters so far */
  hitterSpent: number;
  /** Total spent on pitchers so far */
  pitcherSpent: number;
  /** Remaining roster slots by position (e.g. { OF: 2, SS: 0, UTIL: 1, P: 5 }) */
  remainingSlots?: Record<string, number>;
  /** External ranking (e.g. PitcherList) — used for SP quality gating */
  externalRank?: number;
}

export interface StrategyCapResult {
  /** Strategy-adjusted bid cap */
  bidCap: number;
  /** Human-readable explanation of cap computation */
  capSource: string;
}

/**
 * Compute the strategy-adjusted bid cap for a nominated player.
 *
 * Base: engine's SGP-based maxBid (highest profitable price).
 * Then applies structural adjustments:
 * 1. Pitcher dampening (×pitcherMultiplier)
 * 2. Catcher dampening (×0.5 when C slot filled)
 * 3. Positional weight bonus (+1 to +4)
 * 4. Hitter budget allocation cap ($200 max)
 * 5. SP tier cap ($18/$12/$10/$5/$3)
 * 6. Endgame dampening (×0.7)
 * 7. Inflation adjustment (+2 when > 1.10)
 */
export function computeStrategyBidCap(input: StrategyCapInput): StrategyCapResult {
  let bidCap = input.rawMaxBid;
  let capSource = `engine maxBid $${input.rawMaxBid}`;

  // Pitcher spending is controlled by SP tier caps ($18/$12/$10/$5/$3) — no
  // additional bid dampening needed. The SGP split (pitcherHitterSplit) already
  // reduces pitcher SGP values in the optimizer, so the binary search maxBid
  // naturally produces lower bids for pitchers. Applying a bid cap multiplier
  // on top would double-dampen.

  // Apply catcher dampening (50% when C slot already filled)
  if (input.primaryPosition === "C" && input.catcherSlotsRemaining <= 0) {
    bidCap = Math.max(1, Math.ceil(bidCap * 0.5));
    capSource += ` → C filled ×0.5`;
  }

  // Apply need multiplier — reduce bid when player would go to UTIL or BN
  const ELITE_THRESHOLD = 30;
  if (input.remainingSlots && !input.isPitcher) {
    const destination = determineSlotDestination(input.positions, input.remainingSlots, false);
    if (input.rawMaxBid < ELITE_THRESHOLD) {
      if (destination === "UTIL") {
        bidCap = Math.max(1, Math.ceil(bidCap * 0.7));
        capSource += ` → need ×0.7 (UTIL)`;
      } else if (destination === "BN") {
        bidCap = Math.max(1, Math.ceil(bidCap * 0.5));
        capSource += ` → need ×0.5 (BN)`;
      }
      // dedicated and flex get no reduction (1.0x)
    } else {
      if (destination === "UTIL" || destination === "BN") {
        capSource += ` → need ×1.0 (elite override)`;
      }
    }
  }
  // For pitchers: check P slots
  if (input.remainingSlots && input.isPitcher) {
    const destination = determineSlotDestination(input.positions, input.remainingSlots, true);
    if (destination === "BN" && input.rawMaxBid < ELITE_THRESHOLD) {
      bidCap = Math.max(1, Math.ceil(bidCap * 0.5));
      capSource += ` → need ×0.5 (BN)`;
    }
  }

  // Apply positional weight bonus — only when the player fills a dedicated slot.
  // If all dedicated slots for the player's positions are filled, they'd go to
  // UTIL/BN — no positional scarcity bonus (prevents piling up at one position).
  const posWeight = getPositionalWeight(input.positions);
  if (posWeight > 0 && input.remainingSlots) {
    const hasDedicatedSlot = input.positions.some(pos => {
      const upper = pos.toUpperCase();
      // Check dedicated slot
      if ((input.remainingSlots![upper] ?? 0) > 0) return true;
      // Check flex slots (MI covers 2B/SS, CI covers 1B/3B)
      if ((upper === "2B" || upper === "SS") && (input.remainingSlots!["MI"] ?? 0) > 0) return true;
      if ((upper === "1B" || upper === "3B") && (input.remainingSlots!["CI"] ?? 0) > 0) return true;
      return false;
    });
    if (hasDedicatedSlot) {
      bidCap += posWeight;
      capSource += ` → pos +${posWeight}`;
    } else {
      capSource += ` → pos +0 (slots full)`;
    }
  } else if (posWeight > 0) {
    // No slot data available — apply bonus (backward compat)
    bidCap += posWeight;
    capSource += ` → pos +${posWeight}`;
  }

  // Apply hitter budget allocation cap ($200 max for hitters)
  if (!input.isPitcher && !input.isEndgame) {
    const projectedHitterSpend = input.hitterSpent + bidCap;
    if (projectedHitterSpend > HITTER_BUDGET_MAX) {
      const headroom = Math.max(1, HITTER_BUDGET_MAX - input.hitterSpent);
      if (bidCap > headroom) {
        bidCap = headroom;
        capSource += ` → hitter cap $${HITTER_BUDGET_MAX} (spent $${input.hitterSpent})`;
      }
    }
  }

  // Apply SP tier cap with PitcherList rank quality gating.
  // Tier caps are the ceiling, but the SP must be ranked well enough to
  // deserve the full tier price. Target: 4 SPs in PL top 60.
  //   SP1 ($18): PL top 20 gets full cap, top 40 gets $12, worse gets $8
  //   SP2 ($12): PL top 30 gets full cap, top 60 gets $8, worse gets $5
  //   SP3 ($10): PL top 40 gets full cap, top 60 gets $6, worse gets $3
  //   SP4 ($5):  PL top 60 gets full cap, worse gets $3
  //   SP5+ ($3): no rank gating (filler)
  if (input.isSP) {
    let tierCap = getSpTierCap(input.spCount);
    const rank = input.externalRank;

    if (rank != null && input.spCount < 4) {
      // Rank-gated tier caps: reduce cap when pitcher is outside target rank range
      const SP_RANK_GATES: Array<{ maxRankForFull: number; fallbackCap: number; minCap: number }> = [
        { maxRankForFull: 20, fallbackCap: 12, minCap: 8 },  // SP1
        { maxRankForFull: 30, fallbackCap: 8,  minCap: 5 },  // SP2
        { maxRankForFull: 40, fallbackCap: 6,  minCap: 3 },  // SP3
        { maxRankForFull: 60, fallbackCap: 3,  minCap: 3 },  // SP4
      ];
      const gate = SP_RANK_GATES[input.spCount];
      if (rank <= gate.maxRankForFull) {
        // Quality match — full tier cap
        capSource += ` → SP${input.spCount + 1} PL#${rank} (full $${tierCap})`;
      } else if (rank <= 60) {
        // Decent but not ideal — reduced cap
        tierCap = Math.min(tierCap, gate.fallbackCap);
        capSource += ` → SP${input.spCount + 1} PL#${rank} (reduced $${tierCap})`;
      } else {
        // Outside top 60 — minimum cap
        tierCap = Math.min(tierCap, gate.minCap);
        capSource += ` → SP${input.spCount + 1} PL#${rank} (min $${tierCap})`;
      }
    }

    if (bidCap > tierCap) {
      bidCap = tierCap;
      if (!capSource.includes("SP" + (input.spCount + 1))) {
        capSource += ` → SP${input.spCount + 1} cap $${tierCap}`;
      }
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

  return { bidCap, capSource };
}
