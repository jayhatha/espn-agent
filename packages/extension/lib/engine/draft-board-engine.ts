/**
 * Draft Board Engine
 *
 * Builds the ideal roster exclusively from draft board players (targets + reaches).
 * Tracks which positions are filled and computes max bids based on position need.
 * Recalculates after every pick.
 */

import draftBoard from "../../assets/draft-board.json";
import { normalizeName } from "./normalizer";

// ============================================================
// Types
// ============================================================

export interface BoardPlayer {
  name: string;
  normalizedName: string;
  tier: "target" | "reach";
  positions: string[]; // draft board positions (C, 1B, 2B, SS, 3B, OF, SP, RP)
  fgDollars: number;
  espnAsv: number;
}

export interface BoardSlot {
  position: string;       // C, 1B, 2B, SS, 3B, MI, CI, OF1-4, UTIL1-3, P1-9, BN1-5
  positionGroup: string;  // C, 1B, 2B, SS, 3B, OF, SP, RP
  filled: boolean;
  player: BoardPlayer | null;
  draftedName: string | null; // actual drafted player name
  draftedCost: number | null;
}

export interface DraftBoardState {
  slots: BoardSlot[];
  availablePlayers: BoardPlayer[];  // board players not yet drafted
  draftedPlayers: BoardPlayer[];    // board players we've drafted
  totalBudgetUsed: number;
  totalBudgetRemaining: number;
  positionsNeeded: string[];        // positions still needing a board player
  // For the nominated player:
  nominatedPlayerOnBoard: boolean;
  nominatedPlayerTier: "target" | "reach" | null;
  nominatedPositionNeeded: boolean; // do we still need this position?
  recommendedMaxBid: number;
  bidReason: string;
  cumulativeSurplus: number;       // total savings from drafting below FG$
  idealRemainingSpend: number;     // sum of best FG$ at each unfilled position slot
  surplusRatio: number;            // max(0, (budget - idealSpend) / idealSpend)
  surplusMultiplier: number;       // 1 + min(0.5, surplusRatio)
}

// ============================================================
// Roster structure — matches our league
// ============================================================

const ROSTER_SLOTS: Array<{ position: string; positionGroup: string; acceptsPitcher: boolean }> = [
  { position: "C", positionGroup: "C", acceptsPitcher: false },
  { position: "1B", positionGroup: "1B", acceptsPitcher: false },
  { position: "2B", positionGroup: "2B", acceptsPitcher: false },
  { position: "SS", positionGroup: "SS", acceptsPitcher: false },
  { position: "3B", positionGroup: "3B", acceptsPitcher: false },
  { position: "MI", positionGroup: "MI", acceptsPitcher: false },
  { position: "CI", positionGroup: "CI", acceptsPitcher: false },
  { position: "OF1", positionGroup: "OF", acceptsPitcher: false },
  { position: "OF2", positionGroup: "OF", acceptsPitcher: false },
  { position: "OF3", positionGroup: "OF", acceptsPitcher: false },
  { position: "OF4", positionGroup: "OF", acceptsPitcher: false },
  { position: "UTIL1", positionGroup: "UTIL", acceptsPitcher: false },
  { position: "UTIL2", positionGroup: "UTIL", acceptsPitcher: false },
  { position: "UTIL3", positionGroup: "UTIL", acceptsPitcher: false },
  { position: "P1", positionGroup: "P", acceptsPitcher: true },
  { position: "P2", positionGroup: "P", acceptsPitcher: true },
  { position: "P3", positionGroup: "P", acceptsPitcher: true },
  { position: "P4", positionGroup: "P", acceptsPitcher: true },
  { position: "P5", positionGroup: "P", acceptsPitcher: true },
  { position: "P6", positionGroup: "P", acceptsPitcher: true },
  { position: "P7", positionGroup: "P", acceptsPitcher: true },
  { position: "P8", positionGroup: "P", acceptsPitcher: true },
  { position: "P9", positionGroup: "P", acceptsPitcher: true },
  { position: "BN1", positionGroup: "BN", acceptsPitcher: true },
  { position: "BN2", positionGroup: "BN", acceptsPitcher: true },
  { position: "BN3", positionGroup: "BN", acceptsPitcher: true },
  { position: "BN4", positionGroup: "BN", acceptsPitcher: true },
  { position: "BN5", positionGroup: "BN", acceptsPitcher: true },
];

// Which draft board positions can fill which roster slots
const POSITION_TO_SLOTS: Record<string, string[]> = {
  C: ["C"],
  "1B": ["1B", "CI", "UTIL"],
  "2B": ["2B", "MI", "UTIL"],
  SS: ["SS", "MI", "UTIL"],
  "3B": ["3B", "CI", "UTIL"],
  OF: ["OF", "UTIL"],
  SP: ["P", "BN"],
  RP: ["P", "BN"],
};

// ============================================================
// Build board players from draft-board.json + FG/ASV data
// ============================================================

export function buildBoardPlayers(
  fgDollarsLookup: Map<string, number>,
  asvLookup: Map<string, number>,
): BoardPlayer[] {
  const players: BoardPlayer[] = [];

  for (const [pos, list] of Object.entries(draftBoard)) {
    for (const name of (list as any).targets ?? []) {
      const n = normalizeName(name);
      // Skip if already added (multi-position)
      if (players.some(p => p.normalizedName === n)) {
        // Add this position to existing entry
        const existing = players.find(p => p.normalizedName === n)!;
        if (!existing.positions.includes(pos)) existing.positions.push(pos);
        continue;
      }
      players.push({
        name,
        normalizedName: n,
        tier: "target",
        positions: [pos],
        fgDollars: fgDollarsLookup.get(n) ?? 0,
        espnAsv: asvLookup.get(n) ?? 0,
      });
    }
    for (const name of (list as any).reaches ?? []) {
      const n = normalizeName(name);
      if (players.some(p => p.normalizedName === n)) {
        const existing = players.find(p => p.normalizedName === n)!;
        if (!existing.positions.includes(pos)) existing.positions.push(pos);
        continue;
      }
      players.push({
        name,
        normalizedName: n,
        tier: "reach",
        positions: [pos],
        fgDollars: fgDollarsLookup.get(n) ?? 0,
        espnAsv: asvLookup.get(n) ?? 0,
      });
    }
  }

  return players;
}

// ============================================================
// Slot destination logic
// ============================================================

function findBestOpenSlot(
  player: BoardPlayer,
  remainingSlots: Record<string, number>,
): "dedicated" | "flex" | "UTIL" | "BN" | null {
  const isPitcher = player.positions.some(p => p === "SP" || p === "RP");

  if (isPitcher) {
    if (remainingSlots["P"] > 0) return "dedicated";
    if (remainingSlots["BN"] > 0) return "BN";
    return null;
  }

  // Check dedicated position slot
  for (const pos of player.positions) {
    if (remainingSlots[pos] != null && remainingSlots[pos] > 0) return "dedicated";
  }

  // Check flex slots (MI for 2B/SS, CI for 1B/3B)
  if (player.positions.some(p => p === "2B" || p === "SS") && remainingSlots["MI"] > 0) return "flex";
  if (player.positions.some(p => p === "1B" || p === "3B") && remainingSlots["CI"] > 0) return "flex";

  // UTIL (hitters only)
  if (remainingSlots["UTIL"] > 0) return "UTIL";

  // Bench
  if (remainingSlots["BN"] > 0) return "BN";

  return null;
}

// ============================================================
// Position eligibility (module scope so computeIdealRemainingSpend can use it)
// ============================================================

function isEligible(player: BoardPlayer, pos: string): boolean {
  if (player.positions.includes(pos)) return true;
  // Flex eligibility: 1B/3B → CI, 2B/SS → MI
  if (pos === "CI" && (player.positions.includes("1B") || player.positions.includes("3B"))) return true;
  if (pos === "MI" && (player.positions.includes("2B") || player.positions.includes("SS"))) return true;
  return false;
}

// ============================================================
// Ideal remaining spend
// ============================================================

/**
 * Computes how much budget is "needed" for the rest of the draft by summing
 * the best available FG$ at each unfilled position slot.
 *
 * Positions are processed in specificity order (C, SS, 2B first) so that the
 * rarest positions claim the best multi-eligible players before flex positions.
 * A Set prevents any player from being counted twice.
 */
export function computeIdealRemainingSpend(
  positionsNeeded: string[],
  positionLimits: Record<string, number>,
  draftedPlayers: BoardPlayer[],
  availablePlayers: BoardPlayer[],
): number {
  const used = new Set<string>();
  let total = 0;

  // Rarest positions first so they claim the best multi-eligible players
  const specificityOrder = ["C", "SS", "2B", "1B", "3B", "MI", "CI", "OF", "SP", "RP"];

  // Build list of (position, slotsNeeded) pairs
  const posSlots: Array<{ pos: string; slotsNeeded: number }> = [];
  for (const pos of specificityOrder) {
    if (!positionsNeeded.includes(pos)) continue;
    const limit = positionLimits[pos] ?? 1;
    const filledCount = draftedPlayers.filter(p => isEligible(p, pos)).length;
    const needed = Math.max(0, limit - filledCount);
    if (needed > 0) posSlots.push({ pos, slotsNeeded: needed });
  }

  for (const { pos, slotsNeeded } of posSlots) {
    const eligible = availablePlayers
      .filter(p => !used.has(p.normalizedName) && isEligible(p, pos))
      .sort((a, b) => b.fgDollars - a.fgDollars);
    for (let i = 0; i < Math.min(slotsNeeded, eligible.length); i++) {
      used.add(eligible[i].normalizedName);
      total += eligible[i].fgDollars;
    }
  }
  return total;
}

// ============================================================
// Compute draft board state
// ============================================================

export function computeDraftBoardState(
  allBoardPlayers: BoardPlayer[],
  myRoster: Array<{ playerName: string; cost?: number; positions?: string[] }>,
  budget: number,
  nominatedPlayerName?: string,
  surplusPerSlot?: number,
  fgDollarsLookup?: Map<string, number>, // FG$ lookup for surplus calculation
): DraftBoardState {
  const TOTAL_BUDGET = 260;

  // Build set of drafted player names (normalized)
  const draftedNames = new Set(myRoster.map(p => normalizeName(p.playerName)));

  // Split board players into drafted and available
  const draftedPlayers = allBoardPlayers.filter(p => draftedNames.has(p.normalizedName));
  const availablePlayers = allBoardPlayers.filter(p => !draftedNames.has(p.normalizedName));

  // Initialize slots
  const slots: BoardSlot[] = ROSTER_SLOTS.map(s => ({
    position: s.position,
    positionGroup: s.positionGroup,
    filled: false,
    player: null,
    draftedName: null,
    draftedCost: null,
  }));

  // Fill slots with drafted board players
  for (const drafted of draftedPlayers) {
    const rosterEntry = myRoster.find(p => normalizeName(p.playerName) === drafted.normalizedName);
    const cost = rosterEntry?.cost ?? 0;

    // Find best open slot for this player
    const eligibleSlotGroups = drafted.positions.flatMap(pos => POSITION_TO_SLOTS[pos] ?? []);
    let assigned = false;
    for (const group of eligibleSlotGroups) {
      const slot = slots.find(s => s.positionGroup === group && !s.filled);
      if (slot) {
        slot.filled = true;
        slot.player = drafted;
        slot.draftedName = drafted.name;
        slot.draftedCost = cost;
        assigned = true;
        break;
      }
    }
    // If no dedicated slot, try BN
    if (!assigned) {
      const bnSlot = slots.find(s => s.positionGroup === "BN" && !s.filled);
      if (bnSlot) {
        bnSlot.filled = true;
        bnSlot.player = drafted;
        bnSlot.draftedName = drafted.name;
        bnSlot.draftedCost = cost;
      }
    }
  }

  // Also mark slots filled by non-board players from myRoster
  for (const rp of myRoster) {
    const n = normalizeName(rp.playerName);
    if (draftedNames.has(n) && draftedPlayers.some(p => p.normalizedName === n)) continue; // already handled
    // Non-board player — fill a generic slot
    // We don't know their position precisely, so just count them as filling a slot
  }

  // Determine which position groups still need a board player.
  // 1B/3B also fill CI. 2B/SS also fill MI. Need 4 OF (not 3).
  const positionsNeeded: string[] = [];
  const positionLimits: Record<string, number> = {
    C: 1, "1B": 1, "2B": 1, SS: 1, "3B": 1, OF: 4,
    MI: 1, CI: 1, SP: 99, RP: 99,
  };

  // isEligible is defined at module scope — see above.

  for (const [pos, limit] of Object.entries(positionLimits)) {
    const filledCount = draftedPlayers.filter(p => isEligible(p, pos)).length;
    if (filledCount < limit) {
      positionsNeeded.push(pos);
    }
  }

  // Compute ideal remaining spend and surplus fields
  const idealRemainingSpend = computeIdealRemainingSpend(
    positionsNeeded,
    positionLimits,
    draftedPlayers,
    availablePlayers,
  );
  const surplusRatio = idealRemainingSpend > 0
    ? Math.max(0, (budget - idealRemainingSpend) / idealRemainingSpend)
    : 0;
  const surplusMultiplier = 1 + Math.min(0.5, surplusRatio);

  // Track remaining roster slots (count all roster picks, not just board players)
  const remainingRosterSlots: Record<string, number> = {
    C: 1, "1B": 1, "2B": 1, SS: 1, "3B": 1, MI: 1, CI: 1,
    OF: 4, UTIL: 3, P: 9, BN: 5,
  };
  // Subtract slots used by ALL drafted players (not just board players)
  for (const rp of myRoster) {
    // Try to assign to best slot based on positions
    const positions = (rp as any).positions ?? [];
    const posUpper = positions.map((p: string) => p.toUpperCase());
    const isPitcher = posUpper.some((p: string) => ["SP", "RP", "P"].includes(p));

    if (isPitcher) {
      if (remainingRosterSlots["P"] > 0) remainingRosterSlots["P"]--;
      else if (remainingRosterSlots["BN"] > 0) remainingRosterSlots["BN"]--;
    } else {
      // Try dedicated slot first
      let assigned = false;
      for (const pos of posUpper) {
        const norm = pos === "LF" || pos === "CF" || pos === "RF" ? "OF" : pos;
        if (remainingRosterSlots[norm] != null && remainingRosterSlots[norm] > 0) {
          remainingRosterSlots[norm]--;
          assigned = true;
          break;
        }
      }
      // Try flex
      if (!assigned) {
        if (posUpper.some((p: string) => p === "2B" || p === "SS") && remainingRosterSlots["MI"] > 0) {
          remainingRosterSlots["MI"]--;
          assigned = true;
        } else if (posUpper.some((p: string) => p === "1B" || p === "3B") && remainingRosterSlots["CI"] > 0) {
          remainingRosterSlots["CI"]--;
          assigned = true;
        }
      }
      // Try UTIL
      if (!assigned && remainingRosterSlots["UTIL"] > 0) {
        remainingRosterSlots["UTIL"]--;
        assigned = true;
      }
      // BN
      if (!assigned && remainingRosterSlots["BN"] > 0) {
        remainingRosterSlots["BN"]--;
      }
    }
  }

  // Compute total budget used and cumulative surplus from all drafted players.
  // Surplus = sum of (FG$ - cost) for players drafted below FG value.
  // This tracks how much "free money" we've banked from bargain picks.
  const totalBudgetUsed = myRoster.reduce((s, p) => s + (p.cost ?? 0), 0);
  const totalBudgetRemaining = TOTAL_BUDGET - totalBudgetUsed;

  let cumulativeSurplus = 0;
  for (const rp of myRoster) {
    const n = normalizeName(rp.playerName);
    const fgVal = fgDollarsLookup?.get(n) ?? 0;
    const cost = rp.cost ?? 0;
    if (fgVal > cost) {
      cumulativeSurplus += Math.round(fgVal - cost);
    }
  }

  // Evaluate nominated player
  let nominatedPlayerOnBoard = false;
  let nominatedPlayerTier: "target" | "reach" | null = null;
  let nominatedPositionNeeded = false;
  let recommendedMaxBid = 0;
  let bidReason = "";

  if (nominatedPlayerName) {
    const normNominated = normalizeName(nominatedPlayerName);
    const boardPlayer = allBoardPlayers.find(p => p.normalizedName === normNominated);

    if (boardPlayer) {
      nominatedPlayerOnBoard = true;
      nominatedPlayerTier = boardPlayer.tier;

      // Check if any of this player's positions (including flex) are still needed
      nominatedPositionNeeded = positionsNeeded.some(pos => isEligible(boardPlayer, pos));

      // Check where this player would actually slot in the roster
      // Slot priority: dedicated → flex (MI/CI) → UTIL → BN
      const slotDestination = findBestOpenSlot(boardPlayer, remainingRosterSlots);

      // Check if we should spread first: if ANY hitter position group has zero
      // board players drafted and this player's position already has one,
      // deprioritize to fill gaps first. Spread before depth.
      const hitterPositionGroups = ["C", "1B", "2B", "SS", "3B", "OF"];
      const emptyHitterPositions = hitterPositionGroups.filter(pos => {
        const count = draftedPlayers.filter(p => isEligible(p, pos)).length;
        return count === 0 && positionsNeeded.includes(pos);
      });
      const thisPlayerPositionCount = boardPlayer.positions.reduce((max, pos) => {
        const count = draftedPlayers.filter(p => p.positions.includes(pos)).length;
        return Math.max(max, count);
      }, 0);
      const shouldSpreadFirst = emptyHitterPositions.length > 0
        && thisPlayerPositionCount >= 1
        && !boardPlayer.positions.some(p => p === "SP" || p === "RP") // pitchers exempt
        && !boardPlayer.positions.some(p => emptyHitterPositions.includes(p)); // unless filling an empty pos

      if (shouldSpreadFirst) {
        // We already have someone at this position but other positions are empty
        recommendedMaxBid = Math.round(boardPlayer.fgDollars * 0.5);
        bidReason = `${boardPlayer.positions.join("/")} has ${thisPlayerPositionCount} — fill ${emptyHitterPositions.join(",")} first`;
      } else if (nominatedPositionNeeded && (slotDestination === "dedicated" || slotDestination === "flex")) {
        // Going to a real position slot — bid aggressively
        if (boardPlayer.tier === "target") {
          recommendedMaxBid = Math.round(boardPlayer.fgDollars * 1.25);
          bidReason = `TARGET at ${boardPlayer.positions.join("/")} — bid aggressively`;
        } else {
          // REACH: need cumulative surplus to cover the premium, OR no targets left
          const reachPremium = Math.max(0, boardPlayer.espnAsv - boardPlayer.fgDollars);
          const noTargetsAtPos = boardPlayer.positions.every(pos => {
            const targetsAtPos = allBoardPlayers.filter(
              p => p.tier === "target" && p.positions.includes(pos) && !draftedNames.has(p.normalizedName)
            );
            return targetsAtPos.length === 0;
          });

          if (noTargetsAtPos) {
            // Forced reach — no targets left at this position, must pay market
            recommendedMaxBid = Math.max(Math.round(boardPlayer.fgDollars), boardPlayer.espnAsv);
            bidReason = `REACH at ${boardPlayer.positions.join("/")} — no targets left, forced (max $${recommendedMaxBid})`;
          } else if (cumulativeSurplus >= reachPremium) {
            // Surplus covers the premium — reach is funded
            recommendedMaxBid = Math.round(boardPlayer.fgDollars) + Math.min(cumulativeSurplus, reachPremium);
            bidReason = `REACH at ${boardPlayer.positions.join("/")} — surplus $${cumulativeSurplus} covers $${reachPremium} premium`;
          } else {
            // Not enough surplus — bid FG$ only, don't overpay
            recommendedMaxBid = Math.round(boardPlayer.fgDollars);
            bidReason = `REACH at ${boardPlayer.positions.join("/")} — need $${reachPremium} surplus, have $${cumulativeSurplus}`;
          }
        }
      } else if (slotDestination === "UTIL") {
        // Would go to UTIL — only bid if it's a strong hitter (OF/DH types)
        const isOFtype = boardPlayer.positions.includes("OF") || boardPlayer.positions.includes("DH");
        if (isOFtype) {
          recommendedMaxBid = Math.round(boardPlayer.fgDollars);
          bidReason = `UTIL (OF/DH) — bid at FG$`;
        } else {
          recommendedMaxBid = Math.round(boardPlayer.fgDollars * 0.5);
          bidReason = `UTIL (${boardPlayer.positions.join("/")}) — position full, only if cheap`;
        }
      } else if (slotDestination === "BN") {
        recommendedMaxBid = Math.round(boardPlayer.fgDollars * 0.3);
        bidReason = `BN only — deep discount`;
      } else {
        // No slot available
        recommendedMaxBid = 0;
        bidReason = `No roster slot available`;
      }
    } else {
      // Not on board — standard EV bid (handled by existing engine)
      bidReason = "Not on draft board — standard EV bid";
    }
  }

  return {
    slots,
    availablePlayers,
    draftedPlayers,
    totalBudgetUsed,
    totalBudgetRemaining,
    positionsNeeded,
    nominatedPlayerOnBoard,
    nominatedPlayerTier,
    nominatedPositionNeeded,
    recommendedMaxBid,
    bidReason,
    cumulativeSurplus,
    idealRemainingSpend,
    surplusRatio,
    surplusMultiplier,
  };
}
