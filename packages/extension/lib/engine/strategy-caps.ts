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

import { getPositionalWeight, getSpTierCap, getRankBasedTierCap, HITTER_BUDGET_MAX } from "./draft-constants";
import draftBoard from "../../assets/draft-board.json";
import { normalizeName } from "./normalizer";

// Build draft board lookup at module load time
const draftBoardTargets = new Set<string>();
const draftBoardReaches = new Set<string>();
for (const pos of Object.values(draftBoard)) {
  for (const name of (pos as any).targets ?? []) draftBoardTargets.add(normalizeName(name));
  for (const name of (pos as any).reaches ?? []) draftBoardReaches.add(normalizeName(name));
}

/** Total auction draft budget */
const TOTAL_BUDGET = 260;

/**
 * Determine where a player would be slotted given their eligible positions
 * and remaining roster slots.
 *
 * Priority: dedicated slot > flex slot (MI/CI) > UTIL > BN
 * Pitchers: P slot > BN (no UTIL for pitchers).
 */
/** Normalize position string to match roster slot keys (LF/CF/RF → OF, DH → DH) */
function normalizePosition(pos: string): string {
  const upper = pos.toUpperCase();
  if (upper === "LF" || upper === "CF" || upper === "RF") return "OF";
  return upper;
}

export function determineSlotDestination(
  positions: string[],
  remainingSlots: Record<string, number>,
  isPitcher: boolean,
): "dedicated" | "flex" | "UTIL" | "BN" {
  if (isPitcher) {
    if ((remainingSlots["P"] ?? 0) > 0) return "dedicated";
    return "BN";
  }

  // Normalize positions (LF/CF/RF → OF)
  const normalized = positions.map(normalizePosition);

  // Check dedicated slots first
  for (const pos of normalized) {
    if ((remainingSlots[pos] ?? 0) > 0) return "dedicated";
  }

  // Check flex slots: MI covers 2B/SS, CI covers 1B/3B
  for (const pos of normalized) {
    if ((pos === "2B" || pos === "SS") && (remainingSlots["MI"] ?? 0) > 0) return "flex";
    if ((pos === "1B" || pos === "3B") && (remainingSlots["CI"] ?? 0) > 0) return "flex";
  }

  // DH-eligible players can fill UTIL
  // Any hitter can fill UTIL
  if ((remainingSlots["UTIL"] ?? 0) > 0) return "UTIL";

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
  /** Rank-based tier caps for each drafted SP (parallel to draftedSpPrices) */
  draftedSpTierCaps?: number[];
  /** Player name (for draft board lookup) */
  playerName?: string;
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
 * 1. Catcher dampening (×0.5 when C slot filled)
 * 2. Need multiplier (×0.7 UTIL / ×0.5 BN when not elite)
 * 3. Positional weight bonus (+1 to +4)
 * 4. Hitter budget allocation cap ($220 max)
 * 5. SP tier cap ($18/$12/$10/$5/$3 based on PL rank)
 * 6. Endgame dampening (×0.7)
 * 7. Inflation adjustment (+2 when > 1.10)
 * 8. Budget flush (deploy excess budget in final slots)
 */
export function computeStrategyBidCap(input: StrategyCapInput): StrategyCapResult {
  let bidCap = input.rawMaxBid;
  let capSource = `engine maxBid $${input.rawMaxBid}`;

  // Draft board boost: bid more aggressively on curated target/reach players.
  // Targets always get boosted. Reaches only when we have surplus budget
  // (avg $/remaining slot > $8 means we're ahead of pace).
  if (input.playerName) {
    const normalizedName = normalizeName(input.playerName);
    if (draftBoardTargets.has(normalizedName)) {
      bidCap = Math.ceil(bidCap * 1.25);
      capSource += ` → TARGET ×1.25`;
    } else if (draftBoardReaches.has(normalizedName)) {
      const totalSpent = input.hitterSpent + input.pitcherSpent;
      const budgetLeft = TOTAL_BUDGET - totalSpent;
      const slotsLeft = input.remainingSlots
        ? Object.values(input.remainingSlots).reduce((s, v) => s + v, 0)
        : 28;
      const avgPerSlot = slotsLeft > 0 ? budgetLeft / slotsLeft : 0;
      if (avgPerSlot > 8) {
        bidCap = Math.ceil(bidCap * 1.15);
        capSource += ` → REACH ×1.15 (surplus $${Math.round(avgPerSlot)}/slot)`;
      } else {
        capSource += ` → REACH skipped (no surplus, $${Math.round(avgPerSlot)}/slot)`;
      }
    }
  }

  // Apply catcher dampening (50% when C slot already filled)
  if (input.primaryPosition === "C" && input.catcherSlotsRemaining <= 0) {
    bidCap = Math.max(1, Math.ceil(bidCap * 0.5));
    capSource += ` → C filled ×0.5`;
  }

  // Apply need multiplier — reduce bid when player would go to UTIL or BN
  // Exception: DH-eligible players going to UTIL are not penalized — UTIL is
  // their natural slot (DH can only play UTIL, not dedicated positions).
  // BN dampening still applies to DH players — being bench-bound is genuinely bad.
  // No elite override — the EV-based priority score already accounts for
  // player value. UTIL/BN dampening applies to everyone regardless of price.
  if (input.remainingSlots && !input.isPitcher) {
    const destination = determineSlotDestination(input.positions, input.remainingSlots, false);

    // Check BN overflow: if destination is BN and BN slots are full (or not tracked),
    // return bid=0 — there is genuinely no roster slot for this hitter.
    if (destination === "BN" && (input.remainingSlots["BN"] ?? -1) === 0) {
      return { bidCap: 0, capSource: capSource + ` → NO SLOT (BN full)` };
    }

    {
      if (destination === "UTIL") {
        // DH-eligible players: UTIL is their natural home, no dampening
        const isDH = input.positions.some(p => p.toUpperCase() === "DH");
        if (isDH) {
          capSource += ` -> need x1.0 (DH natural UTIL)`;
        } else {
          // Check remaining UTIL slots — fewer slots = steeper dampening
          const utilLeft = input.remainingSlots["UTIL"] ?? 0;
          const utilFactor = utilLeft <= 1 ? 0.4 : 0.7;
          bidCap = Math.max(1, Math.ceil(bidCap * utilFactor));
          capSource += ` → need ×${utilFactor} (UTIL, ${utilLeft} left)`;
        }
      } else if (destination === "BN") {
        bidCap = Math.max(1, Math.ceil(bidCap * 0.5));
        capSource += ` → need ×0.5 (BN)`;
      }
      // dedicated and flex get no reduction (1.0x)
    }
  }
  // For pitchers: check P slots
  if (input.remainingSlots && input.isPitcher) {
    const destination = determineSlotDestination(input.positions, input.remainingSlots, true);
    if (destination === "BN") {
      bidCap = Math.max(1, Math.ceil(bidCap * 0.5));
      capSource += ` → need ×0.5 (BN)`;
    }
  }

  // Positional weights removed — EV-based priority score already accounts
  // for positional scarcity via FanGraphs replacement-level adjustments.

  // Budget pacing: scale bids when budget-per-remaining-slot gets tight.
  // Without this, we spend freely early and run out late.
  if (input.remainingSlots) {
    const totalSlotsLeft = Object.values(input.remainingSlots).reduce((s, v) => s + v, 0);
    if (totalSlotsLeft > 0) {
      const totalSpent = input.hitterSpent + input.pitcherSpent;
      const budgetLeft = TOTAL_BUDGET - totalSpent;
      const avgPerSlot = budgetLeft / totalSlotsLeft;
      // If average budget per slot drops below $5, start dampening aggressively
      // to preserve $1/slot for remaining picks
      if (avgPerSlot < 5 && bidCap > avgPerSlot) {
        const pacingFactor = Math.max(0.3, avgPerSlot / 5);
        bidCap = Math.max(1, Math.ceil(bidCap * pacingFactor));
        capSource += ` → pacing ×${pacingFactor.toFixed(2)} ($${budgetLeft}/${totalSlotsLeft} slots)`;
      }
    }
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
      // Rank-based tier: the player's quality determines the price.
      // Uses getRankBasedTierCap so a PL #28 always gets $12 cap regardless
      // of how many SPs have already been drafted (fixes slot-based bug).
      tierCap = getRankBasedTierCap(rank);
      if (rank <= 20) {
        capSource += ` → PL#${rank} SP1-tier $18`;
      } else if (rank <= 30) {
        capSource += ` → PL#${rank} SP2-tier $12`;
      } else if (rank <= 40) {
        capSource += ` → PL#${rank} SP3-tier $10`;
      } else if (rank <= 60) {
        capSource += ` → PL#${rank} SP4-tier $5`;
      } else {
        capSource += ` → PL#${rank} SP5-tier $3`;
      }
    } else {
      // No PL rank available — fall back to spCount-based tier
      tierCap = getSpTierCap(input.spCount);
      capSource += ` → SP${input.spCount + 1} cap $${tierCap} (no rank)`;
    }

    // Reallocate savings from SPs drafted below their rank-based tier cap.
    // Uses per-SP rank-based tier caps (draftedSpTierCaps) so out-of-order
    // drafting doesn't generate fake savings. Falls back to slot-position caps
    // (getSpTierCap(s)) when tier caps are not provided.
    // Only apply to SPs in the top 60 (SP1-SP4 tiers) — don't boost filler.
    if (input.draftedSpPrices && input.draftedSpPrices.length > 0 && (rank == null || rank <= 60)) {
      let idealSpSpend = 0;
      for (let s = 0; s < input.draftedSpPrices.length; s++) {
        idealSpSpend += input.draftedSpTierCaps?.[s] ?? getSpTierCap(s);
      }
      const actualSpSpend = input.draftedSpPrices.reduce((s, v) => s + v, 0);
      const savings = Math.max(0, idealSpSpend - actualSpSpend);
      if (savings > 0) {
        tierCap += savings;
        capSource += ` → +$${savings} SP savings`;
      }
    }

    // For ranked SPs (top 60): tier cap is both ceiling AND floor.
    // The SGP blend undervalues pitchers in an OPS league, so we commit
    // to spending the tier amount on quality arms.
    // For unranked/filler SPs: cap down only.
    if (rank != null && rank <= 60) {
      bidCap = tierCap;
    } else if (bidCap > tierCap) {
      bidCap = tierCap;
    }
  }

  // Reallocate SP savings to RPs when starting SP slots (SP1-5) are filled.
  // Cap total RP bid at $15 — savings help stretch for good closers but
  // don't let you overpay. Relievers are replaceable.
  const RP_MAX_BID = 15;
  if (!input.isSP && input.isPitcher && input.draftedSpPrices && input.spCount >= 5) {
    let idealSpSpend = 0;
    for (let s = 0; s < input.draftedSpPrices.length; s++) {
      idealSpSpend += input.draftedSpTierCaps?.[s] ?? getSpTierCap(s);
    }
    const actualSpSpend = input.draftedSpPrices.reduce((s, v) => s + v, 0);
    const savings = Math.max(0, idealSpSpend - actualSpSpend);
    if (savings > 0) {
      const rpHeadroom = Math.max(0, RP_MAX_BID - bidCap);
      const applied = Math.min(savings, rpHeadroom);
      if (applied > 0) {
        bidCap += applied;
        capSource += ` → +$${applied} SP savings (to RP, max $${RP_MAX_BID})`;
      }
    }
  }
  // Hard cap for all RPs regardless of savings
  if (!input.isSP && input.isPitcher && bidCap > RP_MAX_BID) {
    bidCap = RP_MAX_BID;
    capSource += ` → RP cap $${RP_MAX_BID}`;
  }

  // Apply endgame dampening (30% reduction)
  if (input.isEndgame) {
    bidCap = Math.max(1, Math.ceil(bidCap * 0.7));
    capSource += ` → endgame ×0.7`;
  }

  // Re-enforce ranked SP tier floor after endgame dampening.
  // Locked decision: tier cap is both floor AND ceiling for top-60 SPs.
  // Endgame dampening must NOT reduce below the committed tier spend.
  // Exception: 7+ SPs already drafted — those are capped at $3 (full), no floor applies.
  if (input.isSP && input.externalRank != null && input.externalRank <= 60 && input.spCount < 7) {
    const spFloor = getRankBasedTierCap(input.externalRank);
    bidCap = Math.max(spFloor, bidCap);
    capSource += ` → re-enforce SP tier floor $${spFloor}`;
  }

  // Apply inflation adjustment (+$2 when inflation > 1.10)
  if (input.inflationFactor > 1.10) {
    bidCap += 2;
    capSource += ` → inflation +2`;
  }

  // Budget flush boost — spend all $260 when few slots remain.
  // Only applies when the draft is substantially complete (spent > $200 total),
  // meaning few slots remain and excess budget needs to be deployed.
  // This ensures the full $260 is spent rather than leaving money on the table.
  const totalSpent = input.hitterSpent + input.pitcherSpent;
  if (input.remainingSlots != null && totalSpent > 200) {
    const slotsRemaining = Object.values(input.remainingSlots).reduce((s, v) => s + v, 0);
    if (slotsRemaining > 0 && slotsRemaining <= 5) {
      const budgetRemaining = TOTAL_BUDGET - totalSpent;
      // Must reserve $1 per slot after this pick
      const minReserves = Math.max(0, slotsRemaining - 1);
      const excessBudget = budgetRemaining - minReserves - bidCap;
      if (excessBudget > 0) {
        let boost: number;
        if (slotsRemaining <= 2) {
          // Last 1-2 picks: spend everything — unspent dollars are wasted
          boost = excessBudget;
        } else {
          // 3-5 picks: flush up to rawMaxBid so we don't overpay when
          // we still have future picks to allocate budget to
          boost = Math.min(
            Math.ceil(excessBudget * 0.5),
            Math.max(0, input.rawMaxBid - bidCap),
          );
        }
        if (boost > 0) {
          bidCap += boost;
          capSource += ` → budget flush +${boost}`;
        }
      }
    }
  }

  return { bidCap, capSource };
}
