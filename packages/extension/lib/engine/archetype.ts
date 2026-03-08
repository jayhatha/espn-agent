/**
 * archetype.ts
 *
 * computeBuildArchetype — position-aware greedy fill ceiling simulation + archetype classification.
 *
 * Pure function: no Zustand reads, no DOM access, no side effects.
 *
 * Called as step 6 in computeDraftEngine (engine/index.ts).
 */

import type { DraftedPlayer, Category } from "@espn-fantasy/shared";
import { calculateFinalRate } from "@espn-fantasy/shared";
import type {
  FgHitterProjection,
  FgPitcherProjection,
  FgAuctionHitter,
  FgAuctionPitcher,
} from "../fangraphs-data";
import type { BuildArchetypeSignal, CategoryCeiling, PivotPlayer, PoolPlayer } from "./types";

// ============================================================
// normalizeName — exact copy of api-client.ts normalizeName
// ============================================================

/**
 * Normalize player name for FanGraphs matching.
 * Uses NFD decomposition to strip diacritics, removes non-letter/space chars, lowercases, trims.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z\s]/g, "")
    .toLowerCase()
    .trim();
}

// ============================================================
// buildFgPlayerPool
// ============================================================

/**
 * Merge FG projection data with auction value data, removing already-drafted players.
 * Returns two sorted pools: undrafted hitters and undrafted pitchers, sorted by dollar value descending.
 */
export function buildFgPlayerPool(
  fgHitters: FgHitterProjection[],
  fgPitchers: FgPitcherProjection[],
  fgAuctionHitters: FgAuctionHitter[],
  fgAuctionPitchers: FgAuctionPitcher[],
  draftedNormalizedNames: Set<string>,
): { undraftedHitters: PoolPlayer[]; undraftedPitchers: PoolPlayer[] } {
  // Build projection lookups by normalized name
  const hitterProjMap = new Map<string, FgHitterProjection>();
  for (const h of fgHitters) {
    hitterProjMap.set(normalizeName(h.name), h);
  }

  const pitcherProjMap = new Map<string, FgPitcherProjection>();
  for (const p of fgPitchers) {
    pitcherProjMap.set(normalizeName(p.name), p);
  }

  const undraftedHitters: PoolPlayer[] = [];
  for (const ah of fgAuctionHitters) {
    const nName = normalizeName(ah.name);
    if (draftedNormalizedNames.has(nName)) continue;
    if (ah.dollars <= 0) continue; // Skip $0 or negative value players

    const proj = hitterProjMap.get(nName);
    const stats: Record<string, number> = {};
    if (proj) {
      stats.HR = proj.HR;
      stats.R = proj.R;
      stats.RBI = proj.RBI;
      stats.SB = proj.SB;
      stats.AVG = proj.AVG;
      stats.OPS = proj.OPS;
      stats.AB = proj.AB;
      stats.H = proj.H;
      stats.BB = proj.BB;
      stats.HBP = proj.HBP;
      stats.SF = proj.SF;
      stats.TB = proj.TB;
      stats.PA = proj.PA;
    }

    undraftedHitters.push({
      name: ah.name,
      normalizedName: nName,
      dollars: ah.dollars,
      isPitcher: false,
      positions: ah.pos ? ah.pos.split("/") : [],
      stats,
    });
  }

  const undraftedPitchers: PoolPlayer[] = [];
  for (const ap of fgAuctionPitchers) {
    const nName = normalizeName(ap.name);
    if (draftedNormalizedNames.has(nName)) continue;
    if (ap.dollars <= 0) continue;

    const proj = pitcherProjMap.get(nName);
    const stats: Record<string, number> = {};
    if (proj) {
      stats.W = proj.W;
      stats.SV = proj.SV;
      stats.HLD = proj.HLD;
      stats.ERA = proj.ERA;
      stats.WHIP = proj.WHIP;
      // Use SO for K category
      stats.K = proj.SO;
      stats.SO = proj.SO;
      stats.IP = proj.IP;
      stats.HA = proj.HA;
      stats.ER = proj.ER;
      stats.BBA = proj.BBA;
      stats.QS = proj.QS;
      stats.HRA = proj.HRA;
    }

    undraftedPitchers.push({
      name: ap.name,
      normalizedName: nName,
      dollars: ap.dollars,
      isPitcher: true,
      positions: ap.pos ? ap.pos.split("/") : [],
      stats,
    });
  }

  // Sort both pools by dollar value descending
  undraftedHitters.sort((a, b) => b.dollars - a.dollars);
  undraftedPitchers.sort((a, b) => b.dollars - a.dollars);

  return { undraftedHitters, undraftedPitchers };
}

// ============================================================
// positionAwareGreedyFill
// ============================================================

/**
 * Fill remaining hitting slots from hitter pool and pitching slots from pitcher pool,
 * sharing the same budget. Returns combined array of filled players.
 *
 * Budget sharing strategy:
 * - Reserve $1 per total remaining spot for minimum bids
 * - Alternate filling: pick most expensive affordable hitter or pitcher depending on remaining slots
 */
function positionAwareGreedyFill(
  undraftedHitters: PoolPlayer[],
  undraftedPitchers: PoolPlayer[],
  hittingSlotsToFill: number,
  pitchingSlotsToFill: number,
  remainingBudget: number,
): PoolPlayer[] {
  const totalSpotsToFill = hittingSlotsToFill + pitchingSlotsToFill;
  if (totalSpotsToFill === 0) return [];

  // Reserve $1 per remaining spot (minimum bid reservation)
  let budgetLeft = remainingBudget - totalSpotsToFill + 1; // keep $1 reserved for the last spot
  // More precisely: reserve $1 per UNFILLED spot (excluding the one we're about to fill)
  // budgetLeft = remainingBudget - (totalSpotsToFill - 1) for the first pick
  budgetLeft = remainingBudget - (totalSpotsToFill - 1);

  const filled: PoolPlayer[] = [];
  let hitterIdx = 0;
  let pitcherIdx = 0;
  let hittersFilled = 0;
  let pitchersFilled = 0;

  // We'll greedily fill the most expensive affordable player from whichever pool
  // has more remaining slots proportionally, or just alternate
  for (let i = 0; i < totalSpotsToFill; i++) {
    const hitterSlotsRemaining = hittingSlotsToFill - hittersFilled;
    const pitcherSlotsRemaining = pitchingSlotsToFill - pitchersFilled;
    const spotsLeft = totalSpotsToFill - i;

    // Budget for this pick: current budgetLeft reserves $1 for each subsequent spot
    const maxBid = budgetLeft - (spotsLeft - 1) + 1;
    // Actually: after picking this player, (spotsLeft - 1) spots remain, each needing $1
    // So the max we can spend now is: budgetLeft - (spotsLeft - 1)
    const maxSpendNow = Math.max(1, budgetLeft - (spotsLeft - 1));

    // Decide which pool to draw from
    const wantHitter = hitterSlotsRemaining > 0 &&
      (pitcherSlotsRemaining === 0 || hitterSlotsRemaining >= pitcherSlotsRemaining);

    let picked: PoolPlayer | null = null;

    if (wantHitter && hitterSlotsRemaining > 0) {
      // Find most expensive affordable hitter
      while (hitterIdx < undraftedHitters.length) {
        const candidate = undraftedHitters[hitterIdx];
        hitterIdx++;
        if (candidate.dollars <= maxSpendNow) {
          picked = candidate;
          hittersFilled++;
          budgetLeft -= candidate.dollars;
          break;
        }
      }
      // If couldn't find affordable hitter but pitcher slots remain, try pitcher
      if (!picked && pitcherSlotsRemaining > 0) {
        while (pitcherIdx < undraftedPitchers.length) {
          const candidate = undraftedPitchers[pitcherIdx];
          pitcherIdx++;
          if (candidate.dollars <= maxSpendNow) {
            picked = candidate;
            pitchersFilled++;
            budgetLeft -= candidate.dollars;
            break;
          }
        }
      }
    } else if (pitcherSlotsRemaining > 0) {
      // Fill from pitcher pool
      while (pitcherIdx < undraftedPitchers.length) {
        const candidate = undraftedPitchers[pitcherIdx];
        pitcherIdx++;
        if (candidate.dollars <= maxSpendNow) {
          picked = candidate;
          pitchersFilled++;
          budgetLeft -= candidate.dollars;
          break;
        }
      }
      // Fallback to hitter pool if no affordable pitcher
      if (!picked && hitterSlotsRemaining > 0) {
        while (hitterIdx < undraftedHitters.length) {
          const candidate = undraftedHitters[hitterIdx];
          hitterIdx++;
          if (candidate.dollars <= maxSpendNow) {
            picked = candidate;
            hittersFilled++;
            budgetLeft -= candidate.dollars;
            break;
          }
        }
      }
    }

    if (picked) {
      filled.push(picked);
    }
    // If couldn't pick anyone, remaining spots use replacement-level (zeros)
  }

  return filled;
}

// ============================================================
// computeCompetitiveTarget
// ============================================================

/**
 * Compute the "top-3 team" competitive target for a category.
 *
 * For counting stats: sum top N player values, where N = hitters/pitchersPerTeam * 3
 * For rate stats: compute rate from summed components of top N players
 */
function computeCompetitiveTarget(
  allPlayers: PoolPlayer[],
  category: Category,
  slotsPerTeam: number,
  _totalTeams: number,
): number {
  // Top-3 team target: slotsPerTeam * 3
  const topN = Math.max(1, slotsPerTeam * 3);

  if (category.type === "COUNTING") {
    const statKey = category.stat_key;
    // Sort players by this stat descending (only players with this stat)
    const withStat = allPlayers
      .filter(p => p.stats[statKey] !== undefined && p.stats[statKey] > 0)
      .sort((a, b) => (b.stats[statKey] || 0) - (a.stats[statKey] || 0));

    return withStat.slice(0, topN).reduce((sum, p) => sum + (p.stats[statKey] || 0), 0);
  } else if (category.type === "RATE" && category.formula_id) {
    // Sort players by precomputed rate descending for selection
    const withStats = allPlayers.filter(p => {
      try {
        const rate = calculateFinalRate(category.formula_id!, {}, p.stats);
        return isFinite(rate) && rate > 0;
      } catch {
        return false;
      }
    });

    // For LOWER_BETTER (ERA, WHIP), we want the lowest rate — sort ascending
    if (category.direction === "LOWER_BETTER") {
      withStats.sort((a, b) => {
        try {
          const rA = calculateFinalRate(category.formula_id!, {}, a.stats);
          const rB = calculateFinalRate(category.formula_id!, {}, b.stats);
          return rA - rB;
        } catch {
          return 0;
        }
      });
    } else {
      withStats.sort((a, b) => {
        try {
          const rA = calculateFinalRate(category.formula_id!, {}, a.stats);
          const rB = calculateFinalRate(category.formula_id!, {}, b.stats);
          return rB - rA;
        } catch {
          return 0;
        }
      });
    }

    const topPlayers = withStats.slice(0, topN);
    if (topPlayers.length === 0) return 0;

    // Sum components across top players
    const combinedComponents: Record<string, number> = {};
    for (const p of topPlayers) {
      for (const [key, val] of Object.entries(p.stats)) {
        combinedComponents[key] = (combinedComponents[key] || 0) + val;
      }
    }

    try {
      const rate = calculateFinalRate(category.formula_id, {}, combinedComponents);
      return isFinite(rate) ? rate : 0;
    } catch {
      return 0;
    }
  }

  return 0;
}

// ============================================================
// computeCategoryTotal — compute stat total for a list of pool players
// ============================================================

function computeCategoryTotal(players: PoolPlayer[], category: Category): number {
  if (players.length === 0) return 0;

  if (category.type === "COUNTING") {
    return players.reduce((sum, p) => sum + (p.stats[category.stat_key] || 0), 0);
  } else if (category.type === "RATE" && category.formula_id) {
    // Sum components across all players, then compute rate
    const combined: Record<string, number> = {};
    for (const p of players) {
      for (const [key, val] of Object.entries(p.stats)) {
        combined[key] = (combined[key] || 0) + val;
      }
    }
    try {
      const rate = calculateFinalRate(category.formula_id, {}, combined);
      return isFinite(rate) ? rate : 0;
    } catch {
      return 0;
    }
  }

  return 0;
}

// ============================================================
// classifyArchetype
// ============================================================

interface ArchetypeClassification {
  label: string | null;
  confidence: number;
}

/**
 * Classify team archetype based on category z-scores and spending split.
 * Evaluate rules in order — first match wins. "Balanced" is fallback for 5+ picks.
 *
 * Z-score approach: for each category, compute the per-player average across the
 * entire draft pool (all players), then compare my roster's per-player average.
 * This normalizes for roster size so 6-player rosters can be compared to full pools.
 */
function classifyArchetype(
  categoryCeilings: CategoryCeiling[],
  allPlayersForZScore: PoolPlayer[],
  draftedPlayers: PoolPlayer[],
  spendingSplit: { hitting: number; pitching: number },
  totalBudget: number,
  picksAnalyzed: number,
  topPlayerCost: number,
): ArchetypeClassification {
  if (picksAnalyzed < 5) return { label: null, confidence: Math.min(1, picksAnalyzed / 10) };

  const confidence = Math.min(1, picksAnalyzed / 10);

  // Build z-scores comparing my roster's per-player averages to population averages.
  // We use the FULL player pool (drafted + undrafted) for population statistics,
  // ensuring stddev is non-zero even when undrafted pool has uniform values.
  // For counting stats: compare my per-player average vs. all-player per-player average.
  const allPlayers = [...draftedPlayers, ...allPlayersForZScore];
  const zScores: Record<string, number> = {};

  for (const ceil of categoryCeilings) {
    const statKey = ceil.stat_key;

    if (ceil.direction === "HIGHER_BETTER" && !["AVG", "OBP", "OPS", "SLG"].includes(statKey)) {
      // Counting stats: compare per-player averages (my drafted team vs. all players)
      const myPerPlayer = picksAnalyzed > 0 ? ceil.currentTotal / picksAnalyzed : 0;

      // Population per-player average from the full player pool (incl drafted)
      const poolValues = allPlayers
        .map(p => p.stats[statKey] || 0)
        .filter(v => v > 0);

      if (poolValues.length === 0) {
        zScores[statKey] = 0;
        continue;
      }

      const poolMean = poolValues.reduce((a, b) => a + b, 0) / poolValues.length;
      const poolVariance = poolValues.reduce((a, v) => a + Math.pow(v - poolMean, 2), 0) / poolValues.length;
      const poolStdDev = Math.sqrt(poolVariance);

      if (poolStdDev === 0) {
        // All players have same value — use ratio relative to mean
        zScores[statKey] = poolMean > 0 ? (myPerPlayer / poolMean - 1) * 2 : 0;
      } else {
        zScores[statKey] = (myPerPlayer - poolMean) / poolStdDev;
      }
    } else if (ceil.direction === "LOWER_BETTER") {
      // For ERA/WHIP: lower is better — compare rate values (below mean = positive z)
      const myRate = ceil.currentTotal;
      if (myRate === 0) {
        zScores[statKey] = 0;
        continue;
      }

      const pitchersOnly = allPlayers.filter(p => p.isPitcher);
      const poolRates = pitchersOnly
        .map(p => p.stats[statKey] || 0)
        .filter(v => v > 0);

      if (poolRates.length === 0) {
        zScores[statKey] = 0;
        continue;
      }

      const poolMean = poolRates.reduce((a, b) => a + b, 0) / poolRates.length;
      const poolVariance = poolRates.reduce((a, v) => a + Math.pow(v - poolMean, 2), 0) / poolRates.length;
      const poolStdDev = Math.sqrt(poolVariance);

      if (poolStdDev === 0) {
        zScores[statKey] = poolMean > 0 ? (1 - myRate / poolMean) * 2 : 0;
      } else {
        // For LOWER_BETTER: below mean = better = positive z
        zScores[statKey] = -(myRate - poolMean) / poolStdDev;
      }
    } else {
      // Rate stats (AVG, OBP, OPS): compare my rate to population rate
      const myRate = ceil.currentTotal;
      if (myRate === 0) {
        zScores[statKey] = 0;
        continue;
      }

      const hittersOnly = allPlayers.filter(p => !p.isPitcher);
      const poolRates = hittersOnly
        .map(p => p.stats[statKey] || 0)
        .filter(v => v > 0);

      if (poolRates.length === 0) {
        zScores[statKey] = 0;
        continue;
      }

      const poolMean = poolRates.reduce((a, b) => a + b, 0) / poolRates.length;
      const poolVariance = poolRates.reduce((a, v) => a + Math.pow(v - poolMean, 2), 0) / poolRates.length;
      const poolStdDev = Math.sqrt(poolVariance);

      if (poolStdDev === 0) {
        zScores[statKey] = poolMean > 0 ? (myRate / poolMean - 1) * 2 : 0;
      } else {
        zScores[statKey] = (myRate - poolMean) / poolStdDev;
      }
    }
  }

  const hrZ = zScores["HR"] ?? 0;
  const rbiZ = zScores["RBI"] ?? 0;
  const sbZ = zScores["SB"] ?? 0;
  const obpZ = zScores["OBP"] ?? 0;
  const opsZ = zScores["OPS"] ?? 0;

  // Pitching z-scores
  const pitchingKeys = ["W", "SV", "K", "ERA", "WHIP"];
  const pitchingZScores = pitchingKeys.map(k => zScores[k] ?? 0);
  const maxPitchingZ = pitchingZScores.length > 0 ? Math.max(...pitchingZScores) : 0;

  const totalSpent = spendingSplit.hitting + spendingSplit.pitching;
  const pitchingFraction = totalSpent > 0 ? spendingSplit.pitching / totalSpent : 0;

  // 1. Power Build: HR z > +0.5 AND RBI z > +0.5 AND SB z < -0.5
  if (hrZ > 0.5 && rbiZ > 0.5 && sbZ < -0.5) {
    return { label: "Power Build", confidence };
  }

  // 2. Speed Build: SB z > +1.0 AND HR z < 0
  if (sbZ > 1.0 && hrZ < 0) {
    return { label: "Speed Build", confidence };
  }

  // 3. Pitching-First: pitching $ > 45% of total spent AND at least one pitching z > +0.5
  if (pitchingFraction > 0.45 && maxPitchingZ > 0.5) {
    return { label: "Pitching-First", confidence };
  }

  // 4. Stars-and-Scrubs: top player cost > 30% of total budget AND 2+ z > +0.5 AND 2+ z < -0.5
  const allZ = Object.values(zScores);
  const highCategories = allZ.filter(z => z > 0.5).length;
  const lowCategories = allZ.filter(z => z < -0.5).length;
  if (topPlayerCost > 0.3 * totalBudget && highCategories >= 2 && lowCategories >= 2) {
    return { label: "Stars-and-Scrubs", confidence };
  }

  // 5. OBP/OPS Heavy: OBP or OPS z > +0.5 AND HR z < 0
  if ((obpZ > 0.5 || opsZ > 0.5) && hrZ < 0) {
    return { label: "OBP/OPS Heavy", confidence };
  }

  // 6. Balanced: all z-scores within +/- 0.5 (checked via allZ)
  const allWithinRange = allZ.every(z => z >= -0.5 && z <= 0.5);
  if (allWithinRange && allZ.length > 0) {
    return { label: "Balanced", confidence };
  }

  // Fallback for 5+ picks: Balanced
  return { label: "Balanced", confidence };
}

// ============================================================
// findPivotPlayers
// ============================================================

/**
 * Find top 3 affordable undrafted players that would most improve the weakest/punted categories.
 */
function findPivotPlayers(
  undraftedHitters: PoolPlayer[],
  undraftedPitchers: PoolPlayer[],
  currentCeilings: CategoryCeiling[],
  remainingBudget: number,
  remainingSpots: number,
  categories: Category[],
): PivotPlayer[] {
  if (remainingSpots === 0) return [];

  // Max affordable cost: reserve $1 per remaining spot after this pick
  const maxAffordable = Math.max(1, remainingBudget - (remainingSpots - 1));

  // Find the worst/most-punted categories
  const worstCategories = currentCeilings
    .filter(c => c.isPunted || (c.direction === "HIGHER_BETTER" && c.ceilingTotal < c.competitiveTarget))
    .sort((a, b) => {
      // Sort by how far below competitive target
      const ratioA = a.competitiveTarget > 0 ? a.ceilingTotal / a.competitiveTarget : 1;
      const ratioB = b.competitiveTarget > 0 ? b.ceilingTotal / b.competitiveTarget : 1;
      if (a.direction === "LOWER_BETTER") return 0;
      if (b.direction === "LOWER_BETTER") return 0;
      return ratioA - ratioB;
    })
    .slice(0, 3);

  if (worstCategories.length === 0 && currentCeilings.length > 0) {
    // No punted categories — pick worst ratio categories
    const sorted = [...currentCeilings]
      .filter(c => c.direction === "HIGHER_BETTER")
      .sort((a, b) => {
        const ratioA = a.competitiveTarget > 0 ? a.ceilingTotal / a.competitiveTarget : 1;
        const ratioB = b.competitiveTarget > 0 ? b.ceilingTotal / b.competitiveTarget : 1;
        return ratioA - ratioB;
      });
    worstCategories.push(...sorted.slice(0, 3));
  }

  if (worstCategories.length === 0) return [];

  // All undrafted affordable players
  const allUndrafted = [
    ...undraftedHitters.filter(p => p.dollars <= maxAffordable),
    ...undraftedPitchers.filter(p => p.dollars <= maxAffordable),
  ];

  if (allUndrafted.length === 0) return [];

  // For each undrafted player, compute ceiling lift for worst categories
  const pivotCandidates: Array<{
    player: PoolPlayer;
    bestCategory: string;
    ceilingLift: number;
  }> = [];

  for (const player of allUndrafted) {
    let maxLift = 0;
    let bestCat = "";

    for (const ceil of worstCategories) {
      const cat = categories.find(c => c.stat_key === ceil.stat_key);
      if (!cat) continue;

      let lift = 0;
      if (cat.type === "COUNTING") {
        lift = player.stats[cat.stat_key] || 0;
      } else if (cat.type === "RATE" && cat.formula_id) {
        // Compute what adding this player would do to the rate
        // Use a simple approximation: check if player has better rate
        try {
          const playerRate = calculateFinalRate(cat.formula_id, {}, player.stats);
          const currentRate = ceil.ceilingTotal;
          if (cat.direction === "LOWER_BETTER") {
            lift = currentRate > 0 ? (currentRate - playerRate) / currentRate : 0;
          } else {
            lift = playerRate > 0 ? playerRate - currentRate : 0;
          }
        } catch {
          lift = 0;
        }
      }

      if (lift > maxLift) {
        maxLift = lift;
        bestCat = ceil.stat_key;
      }
    }

    if (maxLift > 0 && bestCat) {
      pivotCandidates.push({ player, bestCategory: bestCat, ceilingLift: maxLift });
    }
  }

  // Sort by ceiling lift descending, take top 3
  pivotCandidates.sort((a, b) => b.ceilingLift - a.ceilingLift);

  return pivotCandidates.slice(0, 3).map(c => ({
    playerId: c.player.stats["mlbamId"] || 0,
    playerName: c.player.name,
    dollarValue: c.player.dollars,
    category: c.bestCategory,
    ceilingLift: Math.round(c.ceilingLift * 100) / 100,
  }));
}

// ============================================================
// computeBuildArchetype — main exported function
// ============================================================

/**
 * Compute build archetype analysis for the user's current roster.
 *
 * Pure function — no Zustand reads, no DOM access, no side effects.
 */
export function computeBuildArchetype(
  myRoster: DraftedPlayer[],
  remainingBudget: number,
  allPicks: Array<{ playerId: number; playerName: string }>,
  fgHitters: FgHitterProjection[],
  fgPitchers: FgPitcherProjection[],
  fgAuctionHitters: FgAuctionHitter[],
  fgAuctionPitchers: FgAuctionPitcher[],
  categories: Category[],
  rosterSize: number,
  totalTeams: number,
): BuildArchetypeSignal {
  const picksAnalyzed = myRoster.length;

  // Early return for empty roster
  if (picksAnalyzed === 0) {
    return {
      archetypeLabel: null,
      archetypeConfidence: 0,
      picksAnalyzed: 0,
      ceilings: [],
      pivotPlayers: [],
      spendingSplit: { hitting: 0, pitching: 0 },
    };
  }

  // ---- 1. Build drafted player name set from ALL picks (not just myRoster) ----
  const draftedNormalizedNames = new Set<string>();
  for (const p of allPicks) {
    draftedNormalizedNames.add(normalizeName(p.playerName));
  }

  // ---- 2. Build FG player pools ----
  const { undraftedHitters, undraftedPitchers } = buildFgPlayerPool(
    fgHitters,
    fgPitchers,
    fgAuctionHitters,
    fgAuctionPitchers,
    draftedNormalizedNames,
  );

  // ---- 3. Build drafted player stat pools (match by name) ----
  const hitterProjMap = new Map<string, FgHitterProjection>();
  for (const h of fgHitters) {
    hitterProjMap.set(normalizeName(h.name), h);
  }
  const pitcherProjMap = new Map<string, FgPitcherProjection>();
  for (const p of fgPitchers) {
    pitcherProjMap.set(normalizeName(p.name), p);
  }

  // Determine whether each drafted player is a hitter or pitcher
  // Use FG auction data position field if available; otherwise check if in pitcher proj map
  const pitcherAuctionNames = new Set<string>();
  for (const ap of fgAuctionPitchers) {
    pitcherAuctionNames.add(normalizeName(ap.name));
  }

  const draftedPlayers: PoolPlayer[] = [];
  for (const p of myRoster) {
    const nName = normalizeName(p.playerName);
    const isPitcher = pitcherAuctionNames.has(nName) ||
      p.positions.some(pos => pos === "SP" || pos === "RP");

    const stats: Record<string, number> = {};
    if (isPitcher) {
      const proj = pitcherProjMap.get(nName);
      if (proj) {
        stats.W = proj.W;
        stats.SV = proj.SV;
        stats.HLD = proj.HLD;
        stats.ERA = proj.ERA;
        stats.WHIP = proj.WHIP;
        stats.K = proj.SO;
        stats.SO = proj.SO;
        stats.IP = proj.IP;
        stats.HA = proj.HA;
        stats.ER = proj.ER;
        stats.BBA = proj.BBA;
        stats.QS = proj.QS;
        stats.HRA = proj.HRA;
      }
    } else {
      const proj = hitterProjMap.get(nName);
      if (proj) {
        stats.HR = proj.HR;
        stats.R = proj.R;
        stats.RBI = proj.RBI;
        stats.SB = proj.SB;
        stats.AVG = proj.AVG;
        stats.OPS = proj.OPS;
        stats.AB = proj.AB;
        stats.H = proj.H;
        stats.BB = proj.BB;
        stats.HBP = proj.HBP;
        stats.SF = proj.SF;
        stats.TB = proj.TB;
        stats.PA = proj.PA;
      }
    }

    draftedPlayers.push({
      name: p.playerName,
      normalizedName: nName,
      dollars: p.cost ?? 0,
      isPitcher,
      positions: p.positions,
      stats,
    });
  }

  // ---- 4. Compute spending split ----
  const spendingSplit = { hitting: 0, pitching: 0 };
  for (const p of draftedPlayers) {
    if (p.isPitcher) {
      spendingSplit.pitching += p.dollars;
    } else {
      spendingSplit.hitting += p.dollars;
    }
  }

  // ---- 5. Determine remaining slots (position-aware) ----
  // Standard roster: 14 hitting slots, 9 pitching slots out of 23 total
  // Scale proportionally if rosterSize differs from 23
  const STANDARD_ROSTER = 23;
  const STANDARD_HITTING_SLOTS = 14;
  const STANDARD_PITCHING_SLOTS = 9;

  const hitRatio = STANDARD_HITTING_SLOTS / STANDARD_ROSTER;
  const pitchRatio = STANDARD_PITCHING_SLOTS / STANDARD_ROSTER;

  const totalHittingSlots = Math.round(rosterSize * hitRatio);
  const totalPitchingSlots = rosterSize - totalHittingSlots;

  const draftedHitters = draftedPlayers.filter(p => !p.isPitcher).length;
  const draftedPitchersCount = draftedPlayers.filter(p => p.isPitcher).length;

  const hittingSlotsToFill = Math.max(0, totalHittingSlots - draftedHitters);
  const pitchingSlotsToFill = Math.max(0, totalPitchingSlots - draftedPitchersCount);

  // ---- 6. Position-aware greedy fill ----
  const filledPlayers = positionAwareGreedyFill(
    undraftedHitters,
    undraftedPitchers,
    hittingSlotsToFill,
    pitchingSlotsToFill,
    remainingBudget,
  );

  // Full team projection = drafted + greedy filled
  const fullTeam = [...draftedPlayers, ...filledPlayers];

  // ---- 7. Compute category ceilings ----
  // All players (drafted + all undrafted for competitive target)
  const allUndrafted = [...undraftedHitters, ...undraftedPitchers];

  // Slots per team for competitive target calculation
  const hitterSlotsPerTeam = totalHittingSlots;
  const pitcherSlotsPerTeam = totalPitchingSlots;

  const ceilings: CategoryCeiling[] = [];

  for (const cat of categories) {
    const currentTotal = computeCategoryTotal(draftedPlayers, cat);
    const ceilingTotal = computeCategoryTotal(fullTeam, cat);

    // Determine which pool to use for competitive target
    // Pitching categories use pitcher pool, batting categories use hitter pool
    const isPitchingCat = ["W", "SV", "HLD", "ERA", "WHIP", "K", "SO", "QS", "IP"].includes(cat.stat_key);
    const slotsPerTeam = isPitchingCat ? pitcherSlotsPerTeam : hitterSlotsPerTeam;

    const competitiveTarget = computeCompetitiveTarget(
      allUndrafted,
      cat,
      slotsPerTeam,
      totalTeams,
    );

    // Punt detection
    let isPunted = false;
    if (competitiveTarget > 0) {
      if (cat.direction === "LOWER_BETTER") {
        // For LOWER_BETTER: punted if ceiling is MORE than 130% of competitive target (bad)
        isPunted = ceilingTotal > competitiveTarget * 1.3;
      } else {
        // For HIGHER_BETTER: punted if ceiling < 70% of competitive target
        isPunted = ceilingTotal < competitiveTarget * 0.7;
      }
    }

    ceilings.push({
      stat_key: cat.stat_key,
      currentTotal: Math.round(currentTotal * 1000) / 1000,
      ceilingTotal: Math.round(ceilingTotal * 1000) / 1000,
      competitiveTarget: Math.round(competitiveTarget * 1000) / 1000,
      isPunted,
      direction: cat.direction as "HIGHER_BETTER" | "LOWER_BETTER",
    });
  }

  // ---- 8. Classify archetype ----
  const totalBudget = remainingBudget + spendingSplit.hitting + spendingSplit.pitching;
  const topPlayerCost = draftedPlayers.length > 0
    ? Math.max(...draftedPlayers.map(p => p.dollars))
    : 0;

  const archetypeResult = classifyArchetype(
    ceilings,
    allUndrafted,
    draftedPlayers,
    spendingSplit,
    totalBudget,
    picksAnalyzed,
    topPlayerCost,
  );

  // ---- 9. Find pivot players ----
  const remainingSpots = Math.max(0, rosterSize - myRoster.length);
  const pivotPlayers = findPivotPlayers(
    undraftedHitters,
    undraftedPitchers,
    ceilings,
    remainingBudget,
    remainingSpots,
    categories,
  );

  return {
    archetypeLabel: archetypeResult.label,
    archetypeConfidence: archetypeResult.confidence,
    picksAnalyzed,
    ceilings,
    pivotPlayers,
    spendingSplit,
  };
}
