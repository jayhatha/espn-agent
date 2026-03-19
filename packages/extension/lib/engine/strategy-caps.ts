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
  /** Prices paid for each drafted SP (for tier savings reallocation) */
  draftedSpPrices?: number[];
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

  // Apply SP tier cap based on PitcherList rank (not draft order).
  // The player's rank determines their tier — a PL #30 is an SP2-tier
  // pitcher whether he's the first or fourth SP you draft. This lets you
  // draft SPs out of order: save the $18 slot for a top-20 guy later.
  //
  // Rank → tier mapping:
  //   PL top 20  → SP1 tier ($18)
  //   PL 21-30   → SP2 tier ($12)
  //   PL 31-40   → SP3 tier ($10)
  //   PL 41-60   → SP4 tier ($5)
  //   PL 61+     → SP5 tier ($3)
  //   Unranked   → fall back to spCount-based tier (original behavior)
  //
  // Additionally: once you've drafted 7 SPs, all further SPs cap at $3.
  if (input.isSP) {
    let tierCap: number;
    const rank = input.externalRank;

    if (input.spCount >= 7) {
      // Already have 7 SPs — no more needed, filler price only
      tierCap = 3;
      capSource += ` → SP${input.spCount + 1} cap $3 (full)`;
    } else if (rank != null) {
      // Rank-based tier: the player's quality determines the price
      if (rank <= 20) {
        tierCap = 18;
        capSource += ` → PL#${rank} SP1-tier $18`;
      } else if (rank <= 30) {
        tierCap = 12;
        capSource += ` → PL#${rank} SP2-tier $12`;
      } else if (rank <= 40) {
        tierCap = 10;
        capSource += ` → PL#${rank} SP3-tier $10`;
      } else if (rank <= 60) {
        tierCap = 5;
        capSource += ` → PL#${rank} SP4-tier $5`;
      } else {
        tierCap = 3;
        capSource += ` → PL#${rank} SP5-tier $3`;
      }
    } else {
      // No PL rank available — fall back to spCount-based tier
      tierCap = getSpTierCap(input.spCount);
      capSource += ` → SP${input.spCount + 1} cap $${tierCap} (no rank)`;
    }

    // Reallocate savings from SPs drafted below their tier cap.
    // If you got an SP3-tier guy for $6 instead of $10, the $4 savings
    // rolls up to the current SP (if it's a higher tier) or to RPs.
    // Compute: ideal spending for drafted SPs vs actual spending.
    if (input.draftedSpPrices && input.draftedSpPrices.length > 0) {
      // Ideal: each drafted SP should have cost their rank-based tier cap.
      // We don't know their ranks, so use the slot-based tier caps as ideal.
      // The sum of tier caps for spCount SPs = sum of SP_TIER_CAPS[0..spCount-1]
      let idealSpSpend = 0;
      for (let s = 0; s < input.draftedSpPrices.length; s++) {
        idealSpSpend += getSpTierCap(s); // $18 + $12 + $10 + ...
      }
      const actualSpSpend = input.draftedSpPrices.reduce((s, v) => s + v, 0);
      const savings = Math.max(0, idealSpSpend - actualSpSpend);
      if (savings > 0) {
        tierCap += savings;
        capSource += ` → +$${savings} SP savings`;
      }
    }

    if (bidCap > tierCap) {
      bidCap = tierCap;
    }
  }

  // Reallocate SP savings to RPs when starting SP slots (SP1-5) are filled.
  // If you saved $10 across your SP picks, that budget flows to RP bids.
  if (!input.isSP && input.isPitcher && input.draftedSpPrices && input.spCount >= 5) {
    let idealSpSpend = 0;
    for (let s = 0; s < input.draftedSpPrices.length; s++) {
      idealSpSpend += getSpTierCap(s);
    }
    const actualSpSpend = input.draftedSpPrices.reduce((s, v) => s + v, 0);
    const savings = Math.max(0, idealSpSpend - actualSpSpend);
    if (savings > 0) {
      bidCap += savings;
      capSource += ` → +$${savings} SP savings (to RP)`;
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
