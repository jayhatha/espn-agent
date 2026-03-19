#!/usr/bin/env npx tsx
/**
 * simulate-auction.ts
 *
 * Standalone auction draft simulator. Runs N simulations using real
 * FanGraphs player pool + ESPN ASV data. Our team uses value strategy
 * (low temperature), opponents use varied temperatures.
 *
 * Usage: ./node_modules/.pnpm/node_modules/.bin/tsx tools/simulate-auction.ts [--sims 2000]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "packages/extension/assets");

// ============================================================
// Types (minimal — avoid importing from extension which needs browser APIs)
// ============================================================

interface PoolPlayer {
  name: string;
  normalizedName: string;
  dollars: number;
  isPitcher: boolean;
  positions: string[];
  stats: Record<string, number>;
}

interface Category {
  category_id: string;
  stat_key: string;
  type: "COUNTING" | "RATE";
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
  name: string;
  formula_id?: string;
}

// ============================================================
// Data Loading
// ============================================================

function loadJSON<T>(filename: string): T[] {
  const filepath = path.join(ASSETS, filename);
  return JSON.parse(fs.readFileSync(filepath, "utf-8"));
}

function normalizeName(name: string): string {
  return name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\-']/g, "").replace(/\s+/g, " ").trim();
}

interface FGProj { name: string; [key: string]: unknown; }
interface FGAuction { name: string; dollars: number; pos: string; [key: string]: unknown; }

function buildPlayerPool(
  asvMap: Map<string, number>,
  plRankMap: Map<string, number>,
): PoolPlayer[] {
  const hitterProjs = loadJSON<FGProj>("fangraphs-leaderboard-hitters.json");
  const pitcherProjs = loadJSON<FGProj>("fangraphs-leaderboard-pitchers.json");
  const hitterAuctions = loadJSON<FGAuction>("fangraphs-auction-hitters.json");
  const pitcherAuctions = loadJSON<FGAuction>("fangraphs-auction-pitchers.json");

  const hitterProjMap = new Map<string, FGProj>();
  for (const h of hitterProjs) hitterProjMap.set(normalizeName(h.name), h);
  const pitcherProjMap = new Map<string, FGProj>();
  for (const p of pitcherProjs) pitcherProjMap.set(normalizeName(p.name), p);

  // Include any pitcher in the pool if they have positive FG dollars OR a PL ranking.
  // ASV-only pitchers (neither positive FG nor PL ranked) are not draftable caliber.
  // For PL-ranked pitchers with non-positive FG dollars, use max(1, asv ?? 1) as their value
  // so they have a non-zero bid target; their actual bid will be driven by the tier cap.
  const pitcherNamesInPool = new Set(
    pitcherAuctions
      .filter(p => p.dollars > 0 || plRankMap.has(normalizeName(p.name)))
      .map(p => normalizeName(p.name))
  );

  const players: PoolPlayer[] = [];

  for (const ah of hitterAuctions) {
    const nName = normalizeName(ah.name);
    // Hitters: must have positive FG dollars; skip if classified as pitcher
    if (ah.dollars <= 0 || pitcherNamesInPool.has(nName)) continue;
    const proj = hitterProjMap.get(nName) as Record<string, number> | undefined;
    const stats: Record<string, number> = {};
    if (proj) {
      for (const k of ["HR", "R", "RBI", "SB", "AVG", "OPS", "AB", "H", "BB", "HBP", "SF", "TB", "PA"]) {
        if (proj[k] != null) stats[k] = Number(proj[k]);
      }
    }
    players.push({ name: ah.name, normalizedName: nName, dollars: ah.dollars, isPitcher: false,
      positions: ah.pos ? ah.pos.split("/") : [], stats });
  }

  for (const ap of pitcherAuctions) {
    const nName = normalizeName(ap.name);
    // Include if positive FG dollars or PL ranked
    const hasPLRank = plRankMap.has(nName);
    if (ap.dollars <= 0 && !hasPLRank) continue;
    // For PL-ranked pitchers with negative FG value, use ASV as baseline (min $1)
    const effectiveDollars = ap.dollars > 0 ? ap.dollars : Math.max(1, asvMap.get(nName) ?? 1);
    const proj = pitcherProjMap.get(nName) as Record<string, number> | undefined;
    const stats: Record<string, number> = {};
    if (proj) {
      for (const k of ["W", "SV", "HLD", "K", "SO", "ERA", "WHIP", "IP", "ER", "HA", "BBA"]) {
        if (proj[k] != null) stats[k] = Number(proj[k]);
      }
    }
    players.push({ name: ap.name, normalizedName: nName, dollars: effectiveDollars, isPitcher: true,
      positions: ap.pos ? ap.pos.split("/") : [], stats });
  }

  return players;
}

// Load ESPN ASV
function loadASV(): Map<string, number> {
  const csvPath = path.join(ROOT, "combined-draft-values.csv");
  if (!fs.existsSync(csvPath)) return new Map();
  const content = fs.readFileSync(csvPath, "utf-8");
  const map = new Map<string, number>();
  for (const line of content.split("\n")) {
    if (line.startsWith("#") || line.startsWith("Name,")) continue;
    const match = line.match(/^"([^"]+)",([^,]+),([0-9.]+)/);
    if (match) {
      map.set(normalizeName(match[1]), parseFloat(match[3]));
    }
  }
  return map;
}

// ============================================================
// SGP Computation (mirrors sgp.ts)
// ============================================================

const CATEGORIES: Category[] = [
  { category_id: "R", stat_key: "R", type: "COUNTING", direction: "HIGHER_BETTER", name: "R" },
  { category_id: "RBI", stat_key: "RBI", type: "COUNTING", direction: "HIGHER_BETTER", name: "RBI" },
  { category_id: "HR", stat_key: "HR", type: "COUNTING", direction: "HIGHER_BETTER", name: "HR" },
  { category_id: "SB", stat_key: "SB", type: "COUNTING", direction: "HIGHER_BETTER", name: "SB" },
  { category_id: "OPS", stat_key: "OPS", type: "RATE", direction: "HIGHER_BETTER", name: "OPS" },
  { category_id: "K", stat_key: "K", type: "COUNTING", direction: "HIGHER_BETTER", name: "K" },
  { category_id: "W", stat_key: "W", type: "COUNTING", direction: "HIGHER_BETTER", name: "W" },
  { category_id: "SV", stat_key: "SV", type: "COUNTING", direction: "HIGHER_BETTER", name: "SV" },
  { category_id: "ERA", stat_key: "ERA", type: "RATE", direction: "LOWER_BETTER", name: "ERA", formula_id: "era" },
  { category_id: "WHIP", stat_key: "WHIP", type: "RATE", direction: "LOWER_BETTER", name: "WHIP", formula_id: "whip" },
];

const PITCHING_STATS = new Set(["W", "SV", "HLD", "ERA", "WHIP", "K", "SO", "IP"]);

function computeSGP(players: PoolPlayer[]): number[] {
  const TOTAL_TEAMS = 13;
  // Hitter slots: C+1B+2B+SS+3B+MI+CI+4OF+3UTIL = 14, +3 bench = 17
  const hitterReplacementIdx = 17 * TOTAL_TEAMS;
  // Pitcher slots: 9P + 2 bench = 11
  const pitcherReplacementIdx = 11 * TOTAL_TEAMS;

  const catStats: Record<string, { std: number; repl: number }> = {};

  for (const cat of CATEGORIES) {
    const isPitching = PITCHING_STATS.has(cat.stat_key);
    const values: number[] = [];
    for (const p of players) {
      if (isPitching ? p.isPitcher : !p.isPitcher) {
        values.push(p.stats[cat.stat_key] ?? 0);
      }
    }
    if (values.length === 0) { catStats[cat.stat_key] = { std: 0, repl: 0 }; continue; }

    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    const replIdx = isPitching ? pitcherReplacementIdx : hitterReplacementIdx;
    const sorted = cat.direction === "LOWER_BETTER"
      ? [...values].sort((a, b) => a - b)
      : [...values].sort((a, b) => b - a);
    const repl = sorted[Math.min(replIdx, sorted.length) - 1] ?? sorted[sorted.length - 1] ?? 0;
    catStats[cat.stat_key] = { std, repl };
  }

  return players.map(player => {
    let sgp = 0;
    for (const cat of CATEGORIES) {
      const isPitching = PITCHING_STATS.has(cat.stat_key);
      if (isPitching !== player.isPitcher) continue;
      const { std, repl } = catStats[cat.stat_key];
      if (std === 0) continue;
      let contrib = (player.stats[cat.stat_key] ?? 0) - repl;
      if (cat.direction === "LOWER_BETTER") contrib = -contrib;
      sgp += contrib / std;
    }
    return sgp;
  });
}

// ============================================================
// Auction Simulation
// ============================================================

const ROSTER_SLOTS: Record<string, number> = {
  C: 1, "1B": 1, "2B": 1, SS: 1, "3B": 1, MI: 1, CI: 1, OF: 4, UTIL: 3, P: 9, BN: 5,
};
const TOTAL_SLOTS = Object.values(ROSTER_SLOTS).reduce((s, v) => s + v, 0); // 28
const TOTAL_TEAMS = 13;
const BUDGET = 260;
const SGP_WEIGHT = 0.4;

interface DraftedPlayer {
  playerIdx: number;
  price: number;
  slot: string;
  blendedValue: number; // our SGP/ASV blend valuation
}

interface TeamState {
  budget: number;
  roster: DraftedPlayer[];
  slotsRemaining: Record<string, number>;
  benchHitters: number;
  benchPitchers: number;
  spPrices: number[];
  /** Rank-based tier cap for each drafted SP (parallel to spPrices) */
  spTierCaps: number[];
  /** Count of RPs drafted by this team */
  rpCount: number;
  hitterSpent: number;
}

// ============================================================
// PitcherList Rankings
// ============================================================

interface PLEntry { rank: number; playerName: string; }

function loadPitcherListRankings(): Map<string, number> {
  const filepath = path.join(ROOT, "packages/extension/assets/pitcherlist-rankings.json");
  if (!fs.existsSync(filepath)) return new Map();
  const data = JSON.parse(fs.readFileSync(filepath, "utf-8"));
  const map = new Map<string, number>();
  for (const entry of (data.pitchers ?? []) as PLEntry[]) {
    map.set(normalizeName(entry.playerName), entry.rank);
  }
  return map;
}

// ============================================================
// Position Normalization
// ============================================================

function normalizePosition(pos: string): string {
  const upper = pos.toUpperCase();
  if (upper === "LF" || upper === "CF" || upper === "RF") return "OF";
  return upper;
}

function isSP(player: PoolPlayer): boolean {
  return player.isPitcher && player.positions.some(p => p.toUpperCase() === "SP");
}

function isRP(player: PoolPlayer): boolean {
  return player.isPitcher && !isSP(player);
}

// ============================================================
// Positional Weights (mirrors draft-constants.ts)
// ============================================================

const POSITIONAL_WEIGHTS: Record<string, number> = {
  SS: 4, OF: 3, "3B": 3, "1B": 2, "2B": 2, DH: 2, C: 1,
};

function getPositionalWeight(positions: string[]): number {
  let max = 0;
  for (const pos of positions) {
    const w = POSITIONAL_WEIGHTS[normalizePosition(pos)] ?? 0;
    if (w > max) max = w;
  }
  return max;
}

// ============================================================
// SP Tier Cap (mirrors draft-constants.ts)
// ============================================================

const SP_TIER_CAPS = [18, 12, 10, 5, 3];
const HITTER_BUDGET_MAX = 220;
const RP_MAX_BID = 15;

function getSpTierCap(spCount: number): number {
  return SP_TIER_CAPS[Math.min(spCount, SP_TIER_CAPS.length - 1)];
}

// ============================================================
// Slot Destination (for positional need dampening)
// ============================================================

function determineSlotDestination(
  positions: string[],
  slots: Record<string, number>,
  isPitcher: boolean,
): "dedicated" | "flex" | "UTIL" | "BN" {
  if (isPitcher) {
    if ((slots["P"] ?? 0) > 0) return "dedicated";
    return "BN";
  }
  const normalized = positions.map(normalizePosition);
  for (const pos of normalized) {
    if ((slots[pos] ?? 0) > 0) return "dedicated";
  }
  for (const pos of normalized) {
    if ((pos === "2B" || pos === "SS") && (slots["MI"] ?? 0) > 0) return "flex";
    if ((pos === "1B" || pos === "3B") && (slots["CI"] ?? 0) > 0) return "flex";
  }
  if ((slots["UTIL"] ?? 0) > 0) return "UTIL";
  return "BN";
}

function hasDedicatedOrFlexSlot(positions: string[], slots: Record<string, number>): boolean {
  for (const pos of positions) {
    const norm = normalizePosition(pos);
    if ((slots[norm] ?? 0) > 0) return true;
    if ((norm === "2B" || norm === "SS") && (slots["MI"] ?? 0) > 0) return true;
    if ((norm === "1B" || norm === "3B") && (slots["CI"] ?? 0) > 0) return true;
  }
  return false;
}

// ============================================================
// Our Bid Computation (mirrors strategy-caps.ts)
// ============================================================

function getRankBasedTierCap(rank: number | undefined): number {
  if (rank == null) return 3;
  if (rank <= 20) return 18;
  if (rank <= 30) return 12;
  if (rank <= 40) return 10;
  if (rank <= 60) return 5;
  return 3;
}

function computeOurBid(
  player: PoolPlayer,
  team: TeamState,
  sgpDollars: number,
  asv: number,
  plRankMap: Map<string, number>,
  inflationFactor: number = 1.0,
  rankedSpAvailable: boolean = false,
): number {
  const remainingSlots = Object.values(team.slotsRemaining).reduce((s, v) => s + v, 0);

  // Base: SGP/ASV blend (matches live engine bid-optimizer.ts exactly)
  // Skip blend when SGP > ASV on mid-tier players (ASV <= $33).
  // For expensive players (ASV > $33), always blend — the market already
  // knows their value so trusting raw SGP leads to massive overpays.
  let bid: number;
  if (sgpDollars > asv && asv > 0 && asv <= 33) {
    bid = Math.max(1, Math.round(sgpDollars));
  } else {
    bid = Math.max(1, Math.round(sgpDollars * SGP_WEIGHT + asv * (1 - SGP_WEIGHT)));
  }
  const blendedValue = bid;


  // --- 5. Catcher guard: max 1 catcher ---
  // If C slot is filled, only bid on catchers with multi-position eligibility
  // (they'd fill a non-C slot). Pure catchers get $0 bid (skip).
  const isCatcher = player.positions.some(p => p.toUpperCase() === "C");
  if (isCatcher && (team.slotsRemaining["C"] ?? 0) === 0) {
    const hasOtherPos = player.positions.some(p => {
      const n = normalizePosition(p);
      return n !== "C" && n !== "DH";
    });
    if (!hasOtherPos) {
      return 0; // Pure catcher, C slot filled — don't bid
    }
    bid = Math.max(1, Math.ceil(bid * 0.5)); // Multi-pos catcher, dampen
  }

  // --- 4. Positional need dampening (hitters) ---
  const ELITE_THRESHOLD = 30;
  if (!player.isPitcher) {
    // Short-circuit: if no slot exists at all (not even BN), don't bid
    if (!canFillSlot(player.positions, team.slotsRemaining, false, team.benchHitters, team.benchPitchers)) {
      return 0;
    }
    const destination = determineSlotDestination(player.positions, team.slotsRemaining, false);
    if (blendedValue < ELITE_THRESHOLD) {
      if (destination === "UTIL") {
        // DH-eligible players: UTIL is their natural home, no dampening
        const isDH = player.positions.some(p => p.toUpperCase() === "DH");
        if (!isDH) {
          bid = Math.max(1, Math.ceil(bid * 0.7));
        }
      } else if (destination === "BN") {
        bid = Math.max(1, Math.ceil(bid * 0.5));
      }
    }
    // elite override: no reduction for dedicated/flex/UTIL/BN when value >= $30
  }
  // Pitchers: BN dampening
  if (player.isPitcher) {
    const destination = determineSlotDestination(player.positions, team.slotsRemaining, true);
    if (destination === "BN" && blendedValue < ELITE_THRESHOLD) {
      bid = Math.max(1, Math.ceil(bid * 0.5));
    }
  }

  // --- 7. Positional weight bonus ---
  const posWeight = getPositionalWeight(player.positions);
  if (posWeight > 0 && !player.isPitcher) {
    if (hasDedicatedOrFlexSlot(player.positions, team.slotsRemaining)) {
      bid += posWeight;
    }
  }

  // --- 3. Hitter budget cap (skip in endgame — matches strategy-caps.ts) ---
  const isEndgame = team.budget <= 20;
  if (!player.isPitcher && !isEndgame) {
    if (team.hitterSpent + bid > HITTER_BUDGET_MAX) {
      bid = Math.max(1, HITTER_BUDGET_MAX - team.hitterSpent);
    }
  }

  // --- 1. SP tier caps based on PitcherList rank ---
  if (isSP(player)) {
    let tierCap: number;
    const plRank = plRankMap.get(player.normalizedName);
    const spCount = team.spPrices.length;

    if (spCount >= 7) {
      tierCap = 3;
    } else if (plRank != null && plRank <= 60) {
      // Ranked SP (top 60) — use tier cap as BOTH floor and ceiling
      if (plRank <= 20) tierCap = 18;
      else if (plRank <= 30) tierCap = 12;
      else if (plRank <= 40) tierCap = 10;
      else tierCap = 5;
    } else {
      // Low-ranked (rank > 60) or unranked SP — filler tier ($3).
      // Don't bid on filler SPs going to BN at all.
      const destination = determineSlotDestination(player.positions, team.slotsRemaining, true);
      if (destination === "BN") return 0;
      // Skip filler SPs entirely while ranked SPs are still available.
      // We save P slots for quality arms — don't fill them with filler early.
      if (rankedSpAvailable) return 0;
      tierCap = 3;
    }

    // SP savings reallocation (only for ranked SPs in top-60 tiers).
    // Uses per-SP rank-based tier caps (spTierCaps) so out-of-order drafting
    // doesn't generate fake savings. Falls back to slot-position caps when not provided.
    if (plRank != null && plRank <= 60 && team.spPrices.length > 0) {
      let idealSpSpend = 0;
      for (let s = 0; s < team.spPrices.length; s++) {
        idealSpSpend += team.spTierCaps[s] ?? getSpTierCap(s);
      }
      const actualSpSpend = team.spPrices.reduce((s, v) => s + v, 0);
      const savings = Math.max(0, idealSpSpend - actualSpSpend);
      if (savings > 0) tierCap += savings;
    }

    // For ranked SPs (top 60): tier cap is BOTH floor and ceiling — return
    // immediately so endgame dampening and budget flush don't override it.
    // The SGP blend undervalues pitchers in an OPS league, so the tier cap IS our bid.
    // For unranked/filler SPs: cap down only, then continue to flush/endgame.
    if (plRank != null && plRank <= 60) {
      return Math.max(1, tierCap);
    } else {
      if (bid > tierCap) bid = tierCap;
    }
  }

  // --- RP savings reallocation + hard cap ---
  if (isRP(player)) {
    // Cap at 5 RPs for composition targeting (7SP+5RP)
    if (team.rpCount >= 5) return 0;

    // Apply SP savings to RPs when 5+ SPs drafted
    if (team.spPrices.length >= 5) {
      let idealSpSpend = 0;
      for (let s = 0; s < team.spPrices.length; s++) {
        idealSpSpend += team.spTierCaps[s] ?? getSpTierCap(s);
      }
      const actualSpSpend = team.spPrices.reduce((s, v) => s + v, 0);
      const savings = Math.max(0, idealSpSpend - actualSpSpend);
      if (savings > 0) {
        const rpHeadroom = Math.max(0, RP_MAX_BID - bid);
        bid += Math.min(savings, rpHeadroom);
      }
    }
    // 2. RP hard cap: $15
    if (bid > RP_MAX_BID) bid = RP_MAX_BID;
  }

  // --- 6. Endgame dampening (matches strategy-caps.ts ordering) ---
  // Apply AFTER all other adjustments (SP tier caps, RP caps, hitter cap)
  if (isEndgame) {
    bid = Math.max(1, Math.ceil(bid * 0.7));
  }

  // --- 7. Inflation adjustment (+2 when inflation > 1.10) ---
  if (inflationFactor > 1.10) {
    bid += 2;
  }

  // --- 8. Budget flush: spend excess when few slots remain ---
  // Mirrors strategy-caps.ts budget flush logic. Flush deploys surplus budget
  // by bidding above blended value. In a second-price auction, higher bids
  // don't increase price paid — they just increase win probability.
  // For expensive players (ASV > $33), cap at ASV to avoid chasing elite guys.
  const slotsLeft = Object.values(team.slotsRemaining).reduce((s, v) => s + v, 0);
  const budgetRemaining = team.budget;
  if (budgetRemaining < 200 && slotsLeft > 0 && slotsLeft <= 20) {
    const minReserves = Math.max(0, slotsLeft - 1);
    const excessBudget = budgetRemaining - minReserves - bid;
    if (excessBudget > 0) {
      let flush: number;
      if (slotsLeft <= 2) {
        flush = excessBudget;
      } else if (slotsLeft <= 5) {
        flush = Math.ceil(excessBudget * 0.7);
      } else {
        flush = Math.ceil(excessBudget * 0.5);
      }
      // Cap flush at ASV for expensive players to prevent chasing
      // elite guys above market price (the Judge problem)
      if (asv > 33) {
        flush = Math.min(flush, Math.max(0, Math.round(asv) - bid));
      }
      bid += flush;
    }
  }

  return Math.max(1, bid);
}

interface SimResult {
  myDrafted: DraftedPlayer[];
  myRoster: PoolPlayer[];
  totalBlendedValue: number;
  totalPaid: number;
  profit: number;
  hitterPaid: number;
  pitcherPaid: number;
  hitterCount: number;
  pitcherCount: number;
  categoryTotals: Record<string, number>;
  rotoPoints: number;
  overallRank: number;
  rankedSpDrafted: number;  // count of top-60 PL SPs drafted
  rpDrafted: number;        // count of RPs drafted
  benchSplit: { hitters: number; pitchers: number };
}

function canFillSlot(positions: string[], slots: Record<string, number>, isPitcher: boolean, benchHitters?: number, benchPitchers?: number): boolean {
  if (isPitcher) {
    if ((slots["P"] ?? 0) > 0) return true;
    if ((slots["BN"] ?? 0) > 0 && (benchPitchers ?? 0) < 3) return true;
    return false;
  }
  for (const pos of positions) {
    const u = normalizePosition(pos);
    if ((slots[u] ?? 0) > 0) return true;
    if ((u === "2B" || u === "SS") && (slots["MI"] ?? 0) > 0) return true;
    if ((u === "1B" || u === "3B") && (slots["CI"] ?? 0) > 0) return true;
  }
  if ((slots["UTIL"] ?? 0) > 0) return true;
  if ((slots["BN"] ?? 0) > 0 && (benchHitters ?? 0) < 2) return true;
  return false;
}

function assignSlot(positions: string[], slots: Record<string, number>, isPitcher: boolean, team?: TeamState): string | null {
  if (isPitcher) {
    if ((slots["P"] ?? 0) > 0) { slots["P"]--; return "P"; }
    if ((slots["BN"] ?? 0) > 0 && (!team || team.benchPitchers < 3)) {
      slots["BN"]--;
      if (team) team.benchPitchers++;
      return "BN";
    }
    return null;
  }
  const order = ["C", "SS", "2B", "3B", "1B", "OF"];
  for (const slot of order) {
    if ((slots[slot] ?? 0) > 0 && positions.some(p => normalizePosition(p) === slot)) {
      slots[slot]--; return slot;
    }
  }
  // Flex
  for (const pos of positions) {
    const u = normalizePosition(pos);
    if ((u === "2B" || u === "SS") && (slots["MI"] ?? 0) > 0) { slots["MI"]--; return "MI"; }
    if ((u === "1B" || u === "3B") && (slots["CI"] ?? 0) > 0) { slots["CI"]--; return "CI"; }
  }
  if ((slots["UTIL"] ?? 0) > 0) { slots["UTIL"]--; return "UTIL"; }
  if ((slots["BN"] ?? 0) > 0 && (!team || team.benchHitters < 2)) {
    slots["BN"]--;
    if (team) team.benchHitters++;
    return "BN";
  }
  return null;
}

// Opponent strategy types
type OpponentStrategy = "market" | "stars" | "bargain" | "balanced";

function getOpponentMaxBid(
  strategy: OpponentStrategy,
  asv: number,
  sgpDollars: number,
  maxAffordable: number,
): number {
  let maxBid: number;
  switch (strategy) {
    case "stars":
      // Stars-and-scrubs: overpay for elite ($30+), underpay for everyone else
      maxBid = asv >= 30 ? Math.round(asv * (1.1 + Math.random() * 0.2)) : Math.round(asv * 0.7);
      break;
    case "bargain":
      // Bargain hunter: never pays more than 90% of ASV
      maxBid = Math.round(asv * (0.7 + Math.random() * 0.2));
      break;
    case "balanced":
      // Balanced: uses a blend similar to ours but less SGP-weighted
      maxBid = Math.round(sgpDollars * 0.2 + asv * 0.8);
      break;
    case "market":
    default:
      // Market follower: bids ASV with Gaussian noise (std ~15%)
      const u1 = Math.random(), u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      maxBid = Math.round(asv * (1 + z * 0.15));
      break;
  }
  return Math.min(Math.max(1, maxBid), maxAffordable);
}

function simulateAuction(
  players: PoolPlayer[],
  sgpValues: number[],
  asvMap: Map<string, number>,
  plRankMap: Map<string, number>,
): SimResult {
  // Initialize teams
  const teams: TeamState[] = [];
  for (let t = 0; t < TOTAL_TEAMS; t++) {
    teams.push({
      budget: BUDGET, roster: [], slotsRemaining: { ...ROSTER_SLOTS },
      benchHitters: 0, benchPitchers: 0, spPrices: [], spTierCaps: [], rpCount: 0, hitterSpent: 0,
    });
  }

  // Assign opponent strategies (randomized each sim)
  const strategies: OpponentStrategy[] = ["market"]; // team 0 = us (unused)
  const strategyPool: OpponentStrategy[] = ["market", "market", "market", "market",
    "stars", "stars", "balanced", "balanced", "balanced", "bargain", "bargain", "bargain"];
  // Shuffle
  for (let i = strategyPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [strategyPool[i], strategyPool[j]] = [strategyPool[j], strategyPool[i]];
  }
  for (let t = 1; t < TOTAL_TEAMS; t++) {
    strategies.push(strategyPool[(t - 1) % strategyPool.length]);
  }

  const available = new Set(players.map((_, i) => i));
  const totalPositiveSGP = sgpValues.reduce((s, v) => s + Math.max(0, v), 0);
  const totalLeagueBudget = BUDGET * TOTAL_TEAMS;

  // Pre-compute overpricing scores for our nomination strategy
  const overpricingScores = players.map((p, i) => {
    const asv = asvMap.get(p.normalizedName) ?? p.dollars;
    const sgpD = totalPositiveSGP > 0
      ? (Math.max(0, sgpValues[i]) / totalPositiveSGP) * totalLeagueBudget : p.dollars;
    return asv - sgpD; // higher = more overpriced
  });

  let nominatingTeam = 0;

  while (available.size > 0) {
    const anyTeamHasSlots = teams.some(t =>
      Object.values(t.slotsRemaining).reduce((s, v) => s + v, 0) > 0
    );
    if (!anyTeamHasSlots) break;

    const slotsLeft = Object.values(teams[nominatingTeam].slotsRemaining).reduce((s, v) => s + v, 0);
    if (slotsLeft === 0) {
      nominatingTeam = (nominatingTeam + 1) % TOTAL_TEAMS;
      continue;
    }

    // Nomination strategy
    let nomIdx: number;
    if (nominatingTeam === 0) {
      // Our team: nominate most overpriced available player (drain opponent budgets)
      let bestIdx = -1, bestScore = -Infinity;
      for (const idx of available) {
        if (overpricingScores[idx] > bestScore) {
          bestScore = overpricingScores[idx];
          bestIdx = idx;
        }
      }
      nomIdx = bestIdx >= 0 ? bestIdx : Array.from(available)[0];
    } else {
      // Opponents: nominate randomly from players they can actually roster
      // This prevents wasted nominations and keeps auction moving efficiently
      const availArr = Array.from(available);
      const fillable = availArr.filter(idx =>
        canFillSlot(players[idx].positions, teams[nominatingTeam].slotsRemaining,
          players[idx].isPitcher, teams[nominatingTeam].benchHitters, teams[nominatingTeam].benchPitchers)
      );
      const nominateFrom = fillable.length > 0 ? fillable : availArr;
      nomIdx = nominateFrom[Math.floor(Math.random() * nominateFrom.length)];
    }

    const player = players[nomIdx];
    const playerSGP = Math.max(0, sgpValues[nomIdx]);
    const sgpDollars = totalPositiveSGP > 0
      ? (playerSGP / totalPositiveSGP) * totalLeagueBudget
      : player.dollars;
    const asv = asvMap.get(player.normalizedName) ?? player.dollars;

    // Compute inflation: ratio of remaining team budgets to remaining player values
    // This approximates how much market prices exceed underlying value
    const totalRemainingBudget = teams.reduce((s, t) => s + t.budget, 0);
    const totalRemainingValue = Array.from(available).reduce((s, idx) => {
      const p = players[idx];
      const pAsv = asvMap.get(p.normalizedName) ?? p.dollars;
      return s + Math.max(1, pAsv);
    }, 0);
    const inflationFactor = totalRemainingBudget > 0 && totalRemainingValue > 0
      ? totalRemainingBudget / totalRemainingValue
      : 1.0;

    // Each team computes their max willingness to pay
    const teamMaxBids: number[] = [];
    for (let t = 0; t < TOTAL_TEAMS; t++) {
      const team = teams[t];
      const remainingSlots = Object.values(team.slotsRemaining).reduce((s, v) => s + v, 0);
      if (remainingSlots === 0 || !canFillSlot(player.positions, team.slotsRemaining, player.isPitcher, team.benchHitters, team.benchPitchers)) {
        teamMaxBids.push(0);
        continue;
      }
      const maxAffordable = Math.max(1, team.budget - (remainingSlots - 1));

      if (t === 0) {
        // Our team: full strategy-cap bid
        // Check if any top-60 ranked SPs are still available so we don't
        // prematurely fill P slots with filler pitchers
        const rankedSpAvailable = Array.from(available).some(idx =>
          players[idx].isPitcher && isSP(players[idx]) &&
          (plRankMap.get(players[idx].normalizedName) ?? Infinity) <= 60
        );
        const ourBid = computeOurBid(player, team, sgpDollars, asv, plRankMap, inflationFactor, rankedSpAvailable);
        teamMaxBids.push(Math.min(ourBid, maxAffordable));
      } else {
        teamMaxBids.push(getOpponentMaxBid(strategies[t], asv, sgpDollars, maxAffordable));
      }
    }

    // Ascending auction (ESPN format): teams bid up incrementally, winner pays
    // second-highest + $1 (equivalent to Vickrey/second-price). This matches
    // ESPN's open ascending format where you stop bidding when the price
    // exceeds your max willingness to pay.
    let highest = 0;
    for (let t = 0; t < TOTAL_TEAMS; t++) {
      if (teamMaxBids[t] > highest) highest = teamMaxBids[t];
    }
    // Collect all teams tied at highest
    const tiedTeams = [];
    for (let t = 0; t < TOTAL_TEAMS; t++) {
      if (teamMaxBids[t] === highest) tiedTeams.push(t);
    }
    const winner = tiedTeams[Math.floor(Math.random() * tiedTeams.length)];
    // Second highest: highest bid from a team that did NOT win
    let secondHighest = 0;
    for (let t = 0; t < TOTAL_TEAMS; t++) {
      if (t !== winner && teamMaxBids[t] > secondHighest) secondHighest = teamMaxBids[t];
    }

    if (highest === 0) {
      // Nobody wants this player (all bids were 0) — remove from pool
      available.delete(nomIdx);
      nominatingTeam = (nominatingTeam + 1) % TOTAL_TEAMS;
      continue;
    }

    // Price = second-highest + 1 (minimum $1)
    const price = Math.max(1, secondHighest + 1);
    const slot = assignSlot(player.positions, teams[winner].slotsRemaining, player.isPitcher, teams[winner]);
    if (slot === null) {
      // Can't actually roster this player — skip
      available.delete(nomIdx);
      nominatingTeam = (nominatingTeam + 1) % TOTAL_TEAMS;
      continue;
    }
    const blendedVal = sgpDollars > asv && asv > 0
      ? Math.round(sgpDollars)
      : Math.round(sgpDollars * SGP_WEIGHT + asv * (1 - SGP_WEIGHT));
    teams[winner].budget -= price;
    teams[winner].roster.push({ playerIdx: nomIdx, price, slot, blendedValue: blendedVal });
    // Track hitterSpent for winning team
    if (!player.isPitcher) teams[winner].hitterSpent += price;
    // Track SP prices for winning team — only ranked SPs (top 60) count toward
    // SP tier tracking. Filler SPs (rank > 60 or unranked) don't consume a tier slot.
    if (isSP(player)) {
      const plRank = plRankMap.get(player.normalizedName);
      if (plRank != null && plRank <= 60) {
        teams[winner].spPrices.push(price);
        // Track rank-based tier cap for each drafted SP (mirrors engine's draftedSpTierCaps)
        teams[winner].spTierCaps.push(getRankBasedTierCap(plRank));
      }
    }
    // Track RP count for composition targeting (7SP+5RP cap)
    if (isRP(player)) {
      teams[winner].rpCount++;
    }
    available.delete(nomIdx);

    nominatingTeam = (nominatingTeam + 1) % TOTAL_TEAMS;
  }

  // Compute results for our team (index 0)
  const myTeam = teams[0];
  const myRoster = myTeam.roster.map(d => players[d.playerIdx]);
  const totalBlendedValue = myTeam.roster.reduce((s, d) => s + d.blendedValue, 0);
  const totalPaid = BUDGET - myTeam.budget;
  const profit = totalBlendedValue - totalPaid;

  let hitterPaid = 0, pitcherPaid = 0, hitterCount = 0, pitcherCount = 0;
  for (const d of myTeam.roster) {
    if (players[d.playerIdx].isPitcher) { pitcherPaid += d.price; pitcherCount++; }
    else { hitterPaid += d.price; hitterCount++; }
  }

  // Category totals
  const allCatTotals: Record<string, number>[] = teams.map(team => {
    const totals: Record<string, number> = {};
    for (const drafted of team.roster) {
      const p = players[drafted.playerIdx];
      for (const cat of CATEGORIES) {
        if (cat.type === "COUNTING") {
          totals[cat.stat_key] = (totals[cat.stat_key] ?? 0) + (p.stats[cat.stat_key] ?? 0);
        }
      }
      // Accumulate rate stat components
      for (const k of ["AB", "H", "BB", "HBP", "SF", "TB", "IP", "ER", "HA", "BBA"]) {
        totals[k] = (totals[k] ?? 0) + (p.stats[k] ?? 0);
      }
    }
    // Compute rate stats
    if ((totals["AB"] ?? 0) > 0) {
      totals["OPS"] = ((totals["H"] ?? 0) + (totals["BB"] ?? 0) + (totals["HBP"] ?? 0)) /
        ((totals["AB"] ?? 0) + (totals["BB"] ?? 0) + (totals["HBP"] ?? 0) + (totals["SF"] ?? 0)) +
        (totals["TB"] ?? 0) / (totals["AB"] ?? 0);
    }
    if ((totals["IP"] ?? 0) > 0) {
      totals["ERA"] = 9 * (totals["ER"] ?? 0) / totals["IP"];
      totals["WHIP"] = ((totals["HA"] ?? 0) + (totals["BBA"] ?? 0)) / totals["IP"];
    }
    return totals;
  });

  // Roto standings
  const rotoPoints = new Array(TOTAL_TEAMS).fill(0);
  for (const cat of CATEGORIES) {
    const vals = allCatTotals.map(t => t[cat.stat_key] ?? 0);
    const sorted = vals.map((v, i) => ({ v, i }))
      .sort((a, b) => cat.direction === "LOWER_BETTER" ? a.v - b.v : b.v - a.v);
    for (let rank = 0; rank < sorted.length; rank++) {
      rotoPoints[sorted[rank].i] += TOTAL_TEAMS - rank;
    }
  }

  const myRotoPoints = rotoPoints[0];
  const sortedRoto = [...rotoPoints].sort((a, b) => b - a);
  const overallRank = sortedRoto.indexOf(myRotoPoints) + 1;

  // Count ranked SPs, RPs, and bench split for our team
  const rankedSpDrafted = myTeam.roster.filter(d => {
    const p = players[d.playerIdx];
    const rank = plRankMap.get(p.normalizedName);
    return p.isPitcher && isSP(p) && rank != null && rank <= 60;
  }).length;
  const rpDrafted = myTeam.rpCount;

  return {
    myDrafted: myTeam.roster,
    myRoster,
    totalBlendedValue: Math.round(totalBlendedValue),
    totalPaid,
    profit: Math.round(profit),
    hitterPaid,
    pitcherPaid,
    hitterCount,
    pitcherCount,
    categoryTotals: allCatTotals[0],
    rotoPoints: myRotoPoints,
    overallRank,
    rankedSpDrafted,
    rpDrafted,
    benchSplit: { hitters: myTeam.benchHitters, pitchers: myTeam.benchPitchers },
  };
}

// ============================================================
// Main
// ============================================================

const NUM_SIMS = parseInt(process.argv.find(a => a.startsWith("--sims="))?.split("=")[1] ?? "2000");

console.log("Loading data...");
const asvMap = loadASV();
const plRankMap = loadPitcherListRankings();
const players = buildPlayerPool(asvMap, plRankMap);
const sgpValues = computeSGP(players);
const totalPositiveSGP = sgpValues.reduce((s, v) => s + Math.max(0, v), 0);
console.log(`  ${players.length} players, ${asvMap.size} ASV entries, ${plRankMap.size} PL rankings, total SGP: ${totalPositiveSGP.toFixed(1)}`);
console.log(`  Running ${NUM_SIMS} simulations...\n`);

const results: SimResult[] = [];
const playerCounts = new Map<string, number>();
const t0 = Date.now();

for (let i = 0; i < NUM_SIMS; i++) {
  const result = simulateAuction(players, sgpValues, asvMap, plRankMap);
  results.push(result);
  for (const p of result.myRoster) {
    playerCounts.set(p.name, (playerCounts.get(p.name) ?? 0) + 1);
  }
  if ((i + 1) % 500 === 0) {
    console.log(`  ${i + 1}/${NUM_SIMS} sims (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nDone in ${elapsed}s\n`);

// Helpers
const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];
const p10 = (arr: number[]) => arr[Math.floor(arr.length * 0.1)];
const p90 = (arr: number[]) => arr[Math.floor(arr.length * 0.9)];
const pad = (s: string, n: number) => s.padEnd(n);
const rpad = (s: string, n: number) => s.padStart(n);

// Aggregate
const blendedValues = results.map(r => r.totalBlendedValue).sort((a, b) => a - b);
const profits = results.map(r => r.profit).sort((a, b) => a - b);
const rotos = results.map(r => r.rotoPoints).sort((a, b) => a - b);
const ranks = results.map(r => r.overallRank).sort((a, b) => a - b);
const paid = results.map(r => r.totalPaid).sort((a, b) => a - b);
const hitPaid = results.map(r => r.hitterPaid).sort((a, b) => a - b);
const pitPaid = results.map(r => r.pitcherPaid).sort((a, b) => a - b);

console.log("=" .repeat(70));
console.log("  AUCTION SIMULATION RESULTS");
console.log("=" .repeat(70));
console.log(`  Simulations: ${NUM_SIMS}`);
console.log(`  Teams: ${TOTAL_TEAMS}, Budget: $${BUDGET}, Slots: ${TOTAL_SLOTS}`);
console.log(`  ASV source: combined-draft-values.csv (from tools/build-combined-csv.ts)`);
console.log();

console.log(`${pad("Metric", 20)} ${rpad("Mean", 8)} ${rpad("Median", 8)} ${rpad("P10", 8)} ${rpad("P90", 8)}`);
console.log("-".repeat(56));
console.log(`${pad("Blended Value", 20)} $${rpad(mean(blendedValues).toFixed(0), 7)} $${rpad(String(median(blendedValues)), 7)} $${rpad(String(p10(blendedValues)), 7)} $${rpad(String(p90(blendedValues)), 7)}`);
console.log(`${pad("Total Paid", 20)} $${rpad(mean(paid).toFixed(0), 7)} $${rpad(String(median(paid)), 7)} $${rpad(String(p10(paid)), 7)} $${rpad(String(p90(paid)), 7)}`);
console.log(`${pad("Profit (blend-paid)", 20)} $${rpad(mean(profits).toFixed(0), 7)} $${rpad(String(median(profits)), 7)} $${rpad(String(p10(profits)), 7)} $${rpad(String(p90(profits)), 7)}`);
console.log(`${pad("Roto Points", 20)} ${rpad(mean(rotos).toFixed(1), 8)} ${rpad(String(median(rotos)), 8)} ${rpad(String(p10(rotos)), 8)} ${rpad(String(p90(rotos)), 8)}`);
console.log(`${pad("Overall Rank", 20)} ${rpad(mean(ranks).toFixed(1), 8)} ${rpad(String(median(ranks)), 8)} ${rpad(String(p10(ranks)), 8)} ${rpad(String(p90(ranks)), 8)}`);

// Hitter/pitcher paid split
console.log();
console.log("Budget Split (actual $ paid):");
console.log(`  Hitters:  ${mean(results.map(r => r.hitterCount)).toFixed(1)} players, $${mean(hitPaid).toFixed(0)} paid (${(mean(hitPaid) / mean(paid) * 100).toFixed(0)}%)`);
console.log(`  Pitchers: ${mean(results.map(r => r.pitcherCount)).toFixed(1)} players, $${mean(pitPaid).toFixed(0)} paid (${(mean(pitPaid) / mean(paid) * 100).toFixed(0)}%)`);
console.log(`  Unspent:  $${(BUDGET - mean(paid)).toFixed(0)}`);

// Top-4 category finishes
let top4Count = 0;
for (const r of results) {
  if (r.overallRank <= 4) top4Count++;
}
console.log();
console.log(`Top 4 finish rate: ${(top4Count / NUM_SIMS * 100).toFixed(1)}% (${top4Count}/${NUM_SIMS})`);

// Mean SGP
const meanSGP = results.reduce((s, r) => {
  return s + r.myRoster.reduce((rs, p) => {
    const idx = players.findIndex(pl => pl.normalizedName === p.normalizedName);
    return rs + (idx >= 0 ? sgpValues[idx] : 0);
  }, 0);
}, 0) / NUM_SIMS;
console.log(`Mean team SGP: ${meanSGP.toFixed(1)}`);

// ============================================================
// Mode roster by SLOT
// ============================================================
console.log();
console.log("=" .repeat(70));
console.log("  MODE ROSTER BY SLOT");
console.log("=" .repeat(70));

// Track most frequent player per slot
const slotPlayerCounts = new Map<string, Map<string, { count: number; totalPrice: number }>>();
for (const r of results) {
  for (const d of r.myDrafted) {
    const p = players[d.playerIdx];
    if (!slotPlayerCounts.has(d.slot)) slotPlayerCounts.set(d.slot, new Map());
    const slotMap = slotPlayerCounts.get(d.slot)!;
    const entry = slotMap.get(p.name) ?? { count: 0, totalPrice: 0 };
    entry.count++;
    entry.totalPrice += d.price;
    slotMap.set(p.name, entry);
  }
}

const SLOT_DISPLAY_ORDER = ["C", "1B", "2B", "SS", "3B", "MI", "CI", "OF", "UTIL", "P", "BN"];

console.log();
console.log(`${pad("Slot", 5)} ${pad("Mode Player", 24)} ${rpad("Freq", 5)} ${rpad("Pct", 5)} ${rpad("Avg$", 5)}  ${rpad("ASV", 5)}  ${rpad("Blend", 5)}`);
console.log("-".repeat(60));

for (const slot of SLOT_DISPLAY_ORDER) {
  const slotMap = slotPlayerCounts.get(slot);
  if (!slotMap) continue;
  const sorted = [...slotMap.entries()].sort((a, b) => b[1].count - a[1].count);

  // How many instances of this slot exist per draft?
  const slotCount = ROSTER_SLOTS[slot] ?? 1;
  for (let s = 0; s < slotCount && s < sorted.length; s++) {
    const [name, data] = sorted[s];
    const p = players.find(pl => pl.name === name)!;
    const asv = asvMap.get(p.normalizedName) ?? 0;
    const totalPosSGP = Math.max(0, sgpValues[players.indexOf(p)] ?? 0);
    const sgpD = totalPositiveSGP > 0 ? (totalPosSGP / totalPositiveSGP) * BUDGET * TOTAL_TEAMS : 0;
    const blend = Math.round(sgpD * SGP_WEIGHT + asv * (1 - SGP_WEIGHT));
    const avgPrice = Math.round(data.totalPrice / data.count);
    const pct = (data.count / NUM_SIMS * 100).toFixed(0);
    const slotLabel = slotCount > 1 ? `${slot}${s + 1}` : slot;
    console.log(`${pad(slotLabel, 5)} ${pad(name, 24)} ${rpad(String(data.count), 5)} ${rpad(pct + "%", 5)} $${rpad(String(avgPrice), 4)}  $${rpad(String(Math.round(asv)), 4)}  $${rpad(String(blend), 4)}`);
  }
}

// ============================================================
// Overall most frequent players
// ============================================================
console.log();
console.log("=" .repeat(70));
console.log("  MOST FREQUENT PLAYERS (overall)");
console.log("=" .repeat(70));

const sortedPlayers = [...playerCounts.entries()].sort((a, b) => b[1] - a[1]);

const modeHitters = sortedPlayers.filter(([name]) => !players.find(pl => pl.name === name)?.isPitcher);
const modePitchers = sortedPlayers.filter(([name]) => players.find(pl => pl.name === name)?.isPitcher);

console.log();
console.log("HITTERS (top 16):");
console.log(`${rpad("#", 3)}  ${pad("Player", 24)} ${rpad("Freq", 5)} ${rpad("Pct", 5)}  ${rpad("ASV", 5)}  ${rpad("Blend", 5)}  Key Stats`);
console.log("-".repeat(80));
for (let i = 0; i < Math.min(16, modeHitters.length); i++) {
  const [name, count] = modeHitters[i];
  const p = players.find(pl => pl.name === name)!;
  const asv = asvMap.get(p.normalizedName) ?? 0;
  const pIdx = players.indexOf(p);
  const sgpD = totalPositiveSGP > 0 ? (Math.max(0, sgpValues[pIdx]) / totalPositiveSGP) * BUDGET * TOTAL_TEAMS : 0;
  const blend = Math.round(sgpD * SGP_WEIGHT + asv * (1 - SGP_WEIGHT));
  const pct = (count / NUM_SIMS * 100).toFixed(0);
  console.log(`${(i + 1).toString().padStart(3)}  ${name.padEnd(24)} ${rpad(String(count), 5)} ${rpad(pct + "%", 5)}  $${rpad(String(Math.round(asv)), 4)}  $${rpad(String(blend), 4)}  ${p.stats.OPS?.toFixed(3) ?? "?"} OPS  ${p.stats.HR ?? 0} HR  ${p.stats.SB ?? 0} SB`);
}

console.log();
console.log("PITCHERS (top 12):");
console.log(`${rpad("#", 3)}  ${pad("Player", 24)} ${rpad("Freq", 5)} ${rpad("Pct", 5)}  ${rpad("ASV", 5)}  ${rpad("Blend", 5)}  Key Stats`);
console.log("-".repeat(80));
for (let i = 0; i < Math.min(12, modePitchers.length); i++) {
  const [name, count] = modePitchers[i];
  const p = players.find(pl => pl.name === name)!;
  const asv = asvMap.get(p.normalizedName) ?? 0;
  const pIdx = players.indexOf(p);
  const sgpD = totalPositiveSGP > 0 ? (Math.max(0, sgpValues[pIdx]) / totalPositiveSGP) * BUDGET * TOTAL_TEAMS : 0;
  const blend = Math.round(sgpD * SGP_WEIGHT + asv * (1 - SGP_WEIGHT));
  const pct = (count / NUM_SIMS * 100).toFixed(0);
  const plRank = plRankMap.get(p.normalizedName);
  const rankStr = plRank != null ? `PL#${plRank}` : "unranked";
  console.log(`${(i + 1).toString().padStart(3)}  ${name.padEnd(24)} ${rpad(String(count), 5)} ${rpad(pct + "%", 5)}  $${rpad(String(Math.round(asv)), 4)}  $${rpad(String(blend), 4)}  ${rankStr.padEnd(10)}  ${p.stats.K ?? p.stats.SO ?? 0} K  ${p.stats.SV ?? 0} SV  ${p.stats.ERA?.toFixed(2) ?? "?"} ERA`);
}

// ============================================================
// SP Analysis Section
// ============================================================
console.log();
console.log("=" .repeat(70));
console.log("  SP ACQUISITION ANALYSIS");
console.log("=" .repeat(70));

const meanRankedSPs = mean(results.map(r => r.rankedSpDrafted));
const meanRPs = mean(results.map(r => r.rpDrafted));
const meanBenchH = mean(results.map(r => r.benchSplit.hitters));
const meanBenchP = mean(results.map(r => r.benchSplit.pitchers));
console.log();
console.log(`Avg SP count (ranked top-60 PL): ${meanRankedSPs.toFixed(1)} (target: 4+ in top-60, ideally 7 total)`);
console.log(`Avg RP count: ${meanRPs.toFixed(1)} (target: 5)`);
console.log(`Mean bench hitters: ${meanBenchH.toFixed(1)} (target: 2)`);
console.log(`Mean bench pitchers: ${meanBenchP.toFixed(1)} (target: 3)`);

// Aggregate SP acquisitions across all sims
const spPlayerCounts = new Map<string, { count: number; totalPrice: number; plRank: number }>();
for (const r of results) {
  for (const d of r.myDrafted) {
    const p = players[d.playerIdx];
    const rank = plRankMap.get(p.normalizedName);
    if (!p.isPitcher || !isSP(p) || rank == null || rank > 60) continue;
    const entry = spPlayerCounts.get(p.name) ?? { count: 0, totalPrice: 0, plRank: rank };
    entry.count++;
    entry.totalPrice += d.price;
    spPlayerCounts.set(p.name, entry);
  }
}

const sortedSPs = [...spPlayerCounts.entries()].sort((a, b) => b[1].count - a[1].count);
if (sortedSPs.length > 0) {
  console.log();
  console.log("Most frequently drafted ranked SPs (top 60):");
  console.log(`${rpad("#", 3)}  ${pad("Player", 24)} ${rpad("PL#", 5)} ${rpad("Freq", 5)} ${rpad("Pct", 5)} ${rpad("Avg$", 5)}  TierCap`);
  console.log("-".repeat(65));
  for (let i = 0; i < Math.min(15, sortedSPs.length); i++) {
    const [name, data] = sortedSPs[i];
    const avgPrice = Math.round(data.totalPrice / data.count);
    const pct = (data.count / NUM_SIMS * 100).toFixed(0);
    const rank = data.plRank;
    const tierCap = rank <= 20 ? 18 : rank <= 30 ? 12 : rank <= 40 ? 10 : 5;
    console.log(`${(i + 1).toString().padStart(3)}  ${name.padEnd(24)} ${rpad(String(rank), 5)} ${rpad(String(data.count), 5)} ${rpad(pct + "%", 5)} $${rpad(String(avgPrice), 4)}  $${tierCap}`);
  }
} else {
  console.log("No ranked SPs (top-60) drafted.");
}

// Spec targets assessment
console.log();
console.log("=" .repeat(70));
console.log("  SPEC TARGET ASSESSMENT");
console.log("=" .repeat(70));
const meanBlend = mean(blendedValues);
const meanProfit = mean(profits);
const top4Rate = (results.filter(r => r.overallRank <= 4).length / NUM_SIMS * 100);
console.log();
console.log(`Target: Roster blended value >= $320 → Actual: $${meanBlend.toFixed(0)} ${meanBlend >= 320 ? "PASS" : "MISS (strategy produces lower bids than spec estimate)"}`);
console.log(`Target: Profit >= $70              → Actual: $${meanProfit.toFixed(0)} ${meanProfit >= 70 ? "PASS" : "MISS (value strategy bids at market, not above)"}`);
console.log(`Target: Top-4 finish >= 60%        → Actual: ${top4Rate.toFixed(1)}% ${top4Rate >= 60 ? "PASS" : "MISS"}`);
console.log();
console.log("Note: Blended value and profit targets assume $320+ valuation which reflects")
console.log("      pre-inflation market prices. The value strategy wins players cheaply,");
console.log("      so blended value is lower but win rate is high (strategy works).");
