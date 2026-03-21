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
// Compute draft board state
// ============================================================

export function computeDraftBoardState(
  allBoardPlayers: BoardPlayer[],
  myRoster: Array<{ playerName: string; cost?: number }>,
  budget: number,
  nominatedPlayerName?: string,
  surplusPerSlot?: number, // avg $/slot for reach eligibility
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

  // Count how many board players we've drafted that are eligible at each position
  function isEligible(player: BoardPlayer, pos: string): boolean {
    if (player.positions.includes(pos)) return true;
    // Flex eligibility: 1B/3B → CI, 2B/SS → MI
    if (pos === "CI" && (player.positions.includes("1B") || player.positions.includes("3B"))) return true;
    if (pos === "MI" && (player.positions.includes("2B") || player.positions.includes("SS"))) return true;
    return false;
  }

  for (const [pos, limit] of Object.entries(positionLimits)) {
    const filledCount = draftedPlayers.filter(p => isEligible(p, pos)).length;
    if (filledCount < limit) {
      positionsNeeded.push(pos);
    }
  }

  // Compute total budget used
  const totalBudgetUsed = myRoster.reduce((s, p) => s + (p.cost ?? 0), 0);
  const totalBudgetRemaining = TOTAL_BUDGET - totalBudgetUsed;

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

      if (nominatedPositionNeeded) {
        if (boardPlayer.tier === "target") {
          // Target at a needed position: bid up to FG$ × 1.25
          recommendedMaxBid = Math.round(boardPlayer.fgDollars * 1.25);
          bidReason = `TARGET at ${boardPlayer.positions.join("/")} — bid aggressively`;
        } else {
          // Reach at a needed position: bid up to ASV if surplus exists
          const hasSurplus = (surplusPerSlot ?? 0) > 8;
          if (hasSurplus) {
            recommendedMaxBid = Math.max(Math.round(boardPlayer.fgDollars), boardPlayer.espnAsv);
            bidReason = `REACH at ${boardPlayer.positions.join("/")} — surplus available`;
          } else {
            recommendedMaxBid = Math.round(boardPlayer.fgDollars);
            bidReason = `REACH at ${boardPlayer.positions.join("/")} — no surplus, bid FG$ only`;
          }
        }
      } else {
        // Position already filled — bid conservatively (only if cheap)
        recommendedMaxBid = Math.round(boardPlayer.fgDollars * 0.5);
        bidReason = `${boardPlayer.positions.join("/")} filled — only if cheap`;
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
  };
}
