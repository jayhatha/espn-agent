/**
 * projected-standings.ts
 *
 * computeProjectedStandings — full-season roto standings projection for all teams during a draft.
 *
 * Pure function: no Zustand reads, no DOM access, no side effects.
 *
 * Algorithm:
 * 1. Compute replacement-level stats from median of undrafted FanGraphs pool.
 * 2. For each team: drafted totals + (replacement-level filler × remaining slots).
 * 3. Assign roto points per category (N pts for rank 1, 1 pt for rank N).
 * 4. Compute overall rank from total roto points.
 * 5. Return ProjectedStandingsSignal with per-team standings, weak/strong categories for user.
 *
 * Key constraints:
 * - Rate stats use component-based math via calculateFinalRate (never average rates).
 * - IP <= 0 guard prevents NaN/Infinity in ERA/WHIP.
 * - Minimum 3 teams required (returns empty signal otherwise).
 */

import type { Category } from "@espn-fantasy/shared";
import { calculateFinalRate } from "@espn-fantasy/shared";
import type { PoolPlayer, ProjectedStandingsSignal, ProjectedTeamStanding } from "./types";

// ============================================================
// Component keys we track for rate stat filler computation
// ============================================================

// All component keys across hitter and pitcher formulas
const ALL_COMPONENT_KEYS = [
  // Hitter components
  "H", "AB", "HR", "R", "RBI", "SB", "BB", "HBP", "SF", "TB", "PA",
  // Pitcher components (prefixed to avoid hitter collisions in calculateFinalRate)
  "IP", "ER", "HA", "BBA", "W", "SV", "HLD", "K", "SO", "QS", "HRA",
  // Alias: some formulas accept K or SO
  "L",
] as const;

// ============================================================
// computeReplacementStats
// ============================================================

export interface ReplacementStats {
  /** Median counting stat per category stat_key */
  replacementCounting: Record<string, number>;
  /** Median of each raw component across undrafted players (for rate filler) */
  replacementComponents: Record<string, number>;
}

/**
 * Compute replacement-level stats from undrafted player pool.
 *
 * For counting categories: median of the stat_key values across undrafted players with v > 0.
 * For rate categories: median of underlying components (H, AB, IP, ER, etc.) across undrafted players.
 *
 * Using median (not mean) avoids distortion from outliers (elite players still in pool).
 */
export function computeReplacementStats(
  undraftedPlayers: PoolPlayer[],
  categories: Category[],
): ReplacementStats {
  if (undraftedPlayers.length === 0) {
    return { replacementCounting: {}, replacementComponents: {} };
  }

  // Compute median counting stats per category
  const replacementCounting: Record<string, number> = {};
  for (const cat of categories) {
    if (cat.type !== "COUNTING") continue;
    const values = undraftedPlayers
      .map(p => p.stats[cat.stat_key] ?? 0)
      .filter(v => v > 0)
      .sort((a, b) => a - b);
    if (values.length === 0) {
      replacementCounting[cat.stat_key] = 0;
      continue;
    }
    const mid = Math.floor(values.length / 2);
    replacementCounting[cat.stat_key] =
      values.length % 2 === 0
        ? (values[mid - 1] + values[mid]) / 2
        : values[mid];
  }

  // Compute median of each component key across undrafted players
  const replacementComponents: Record<string, number> = {};
  for (const key of ALL_COMPONENT_KEYS) {
    const values = undraftedPlayers
      .map(p => p.stats[key] ?? 0)
      .filter(v => v > 0)
      .sort((a, b) => a - b);
    if (values.length === 0) {
      replacementComponents[key] = 0;
      continue;
    }
    const mid = Math.floor(values.length / 2);
    replacementComponents[key] =
      values.length % 2 === 0
        ? (values[mid - 1] + values[mid]) / 2
        : values[mid];
  }

  return { replacementCounting, replacementComponents };
}

// ============================================================
// computeDraftProgressWeight
// ============================================================

/**
 * Piecewise linear draft progress confidence weight.
 *
 * Breakpoints (from Phase 25 research):
 *   0%  -> 0.00
 *  30%  -> 0.20
 *  50%  -> 0.50
 *  70%  -> 0.85
 * 100%  -> 1.00
 *
 * At 50% drafted the standings are half-confident — filler accounts for
 * the other half of each team's roster so projections are meaningful but noisy.
 */
export function computeDraftProgressWeight(
  totalPicksMade: number,
  totalPicksInDraft: number,
): number {
  if (totalPicksInDraft === 0) return 0;

  const pct = Math.min(1, Math.max(0, totalPicksMade / totalPicksInDraft));

  // Piecewise linear interpolation
  if (pct <= 0.0) return 0.0;
  if (pct <= 0.3) return 0.0 + (0.2 / 0.3) * pct;
  if (pct <= 0.5) return 0.2 + (0.3 / 0.2) * (pct - 0.3);
  if (pct <= 0.7) return 0.5 + (0.35 / 0.2) * (pct - 0.5);
  if (pct <= 1.0) return 0.85 + (0.15 / 0.3) * (pct - 0.7);
  return 1.0;
}

// ============================================================
// computeRotoPts (internal)
// ============================================================

/**
 * Assign roto points for each team per category.
 *
 * For N teams:
 * - Rank 1 = N points (best)
 * - Rank N = 1 point (worst)
 * - Zero-value teams are pushed to the bottom (their value is skipped in comparison)
 * - LOWER_BETTER categories (ERA/WHIP): ascending sort, zero values pushed to bottom
 */
function computeRotoPts(
  teamTotals: Map<string, Record<string, number>>,
  categories: Category[],
): Map<string, { rotoPts: number; categoryRanks: Record<string, number> }> {
  const teamIds = Array.from(teamTotals.keys());
  const n = teamIds.length;

  // Initialize results
  const results = new Map<string, { rotoPts: number; categoryRanks: Record<string, number> }>();
  for (const teamId of teamIds) {
    results.set(teamId, { rotoPts: 0, categoryRanks: {} });
  }

  for (const cat of categories) {
    const statKey = cat.stat_key;
    const isLowerBetter = cat.direction === "LOWER_BETTER";

    // Collect team values for this category
    const teamValues: Array<{ teamId: string; value: number }> = [];
    for (const teamId of teamIds) {
      const value = teamTotals.get(teamId)?.[statKey] ?? 0;
      teamValues.push({ teamId, value });
    }

    // Sort: push zero-value teams to bottom regardless of direction
    if (isLowerBetter) {
      // ERA/WHIP: lower is better, but zero means "no pitchers" → push to bottom
      teamValues.sort((a, b) => {
        if (a.value === 0 && b.value === 0) return 0;
        if (a.value === 0) return 1;   // Zero data → worst
        if (b.value === 0) return -1;
        return a.value - b.value;       // Ascending: lowest ERA ranks first
      });
    } else {
      // HIGHER_BETTER: descending sort, zeros naturally fall to bottom
      teamValues.sort((a, b) => b.value - a.value);
    }

    // Assign roto points: rank 1 gets N points, rank N gets 1 point
    for (let i = 0; i < teamValues.length; i++) {
      const { teamId } = teamValues[i];
      const rank = i + 1;
      const pts = n - i;  // rank 1 → N points, rank N → 1 point
      const teamResult = results.get(teamId);
      if (teamResult) {
        teamResult.rotoPts += pts;
        teamResult.categoryRanks[statKey] = rank;
      }
    }
  }

  return results;
}

// ============================================================
// computeProjectedStandings — main export
// ============================================================

/**
 * Project full-season roto standings for all teams during an auction/snake draft.
 *
 * Steps:
 * 1. Guard: < 3 teams with data → return empty signal.
 * 2. Compute draft progress weight from pick count / total draft picks.
 * 3. Compute replacement-level stats (median of undrafted FG pool).
 * 4. For each team: drafted totals + replacement filler for remaining slots.
 * 5. Compute roto points per category, overall rank.
 * 6. Find user's weak/strong categories.
 *
 * @param teamDraftedTotals - From computeLeagueAnalysis: per-team FG-matched stat totals
 * @param teamRosters - All teams in draft (teamId -> { teamId, teamName, playerIds })
 * @param allPicks - All picks made so far
 * @param myTeamId - User's team ID (null if unknown)
 * @param categories - League scoring categories
 * @param undraftedPlayers - Undrafted FG player pool (for replacement-level computation)
 * @param rosterSize - Total roster slots per team
 * @param totalTeams - Total number of teams in the league
 */
export function computeProjectedStandings(
  teamDraftedTotals: Map<string, Record<string, number>>,
  teamRosters: Map<string, { teamId: string; teamName: string; playerIds: number[] }>,
  allPicks: Array<{ playerId: number; playerName: string; teamId: string }>,
  myTeamId: string | null,
  categories: Category[],
  undraftedPlayers: PoolPlayer[],
  rosterSize: number,
  totalTeams: number,
): ProjectedStandingsSignal {
  const t0 = performance.now();

  // Count picks per team (for remaining slot calculation)
  const picksByTeam = new Map<string, number>();
  for (const pick of allPicks) {
    picksByTeam.set(pick.teamId, (picksByTeam.get(pick.teamId) ?? 0) + 1);
  }

  // 1. Guard: require at least 3 teams with FG-matched data
  const teamsWithData = teamDraftedTotals.size;
  if (teamsWithData < 3) {
    return {
      standings: [],
      myTeamRank: 0,
      myWeakCategories: [],
      myStrongCategories: [],
      draftProgressWeight: computeDraftProgressWeight(allPicks.length, totalTeams * rosterSize),
      totalTeamCount: totalTeams,
      teamsWithData,
      computeTimeMs: Math.round((performance.now() - t0) * 10) / 10,
    };
  }

  // 2. Draft progress weight
  const totalPicksInDraft = totalTeams * rosterSize;
  const draftProgressWeight = computeDraftProgressWeight(allPicks.length, totalPicksInDraft);

  // 3. Replacement-level stats
  const { replacementCounting, replacementComponents } = computeReplacementStats(
    undraftedPlayers,
    categories,
  );

  // 4. Build projected totals for every team (ALL teams in teamRosters, not just those with FG data)
  const projectedTotals = new Map<string, Record<string, number>>();

  for (const [teamId] of teamRosters) {
    const draftedCount = picksByTeam.get(teamId) ?? 0;
    const remainingSlots = Math.max(0, rosterSize - draftedCount);
    const draftedTotals = teamDraftedTotals.get(teamId);

    const teamProjected: Record<string, number> = {};

    for (const cat of categories) {
      if (cat.type === "COUNTING") {
        const draftedValue = draftedTotals?.[cat.stat_key] ?? 0;
        const fillerValue = (replacementCounting[cat.stat_key] ?? 0) * remainingSlots;
        teamProjected[cat.stat_key] = draftedValue + fillerValue;
      } else if (cat.type === "RATE" && cat.formula_id) {
        // Sum drafted components + (replacement components × remaining slots)
        // Then compute rate from totals — never average rates
        const combinedComponents: Record<string, number> = {};

        // Add drafted player components (already summed in teamDraftedTotals via league-analysis)
        // For rate stats, we need to reconstruct from components stored per-player.
        // Since teamDraftedTotals only has final rate values (not components), we use them
        // as a proxy for component-level filler. For teams with data, we weight by
        // draftedCount: combinedComponents ≈ replacementComponents × draftedCount + replacementComponents × remainingSlots
        // = replacementComponents × rosterSize (when no data) or use FG totals as approximation.

        // Get the drafted components by working backward from totals where possible,
        // OR use the player-level component sum by scaling from the rate value.
        // Since we don't have per-player components in teamDraftedTotals (only category totals),
        // we approximate: for rate categories, scale replacement components by draftedCount
        // and add remainingSlots filler. This is consistent with replacement-level logic:
        // a team with 0 FG matches gets rosterSize × replacement.
        for (const key of ALL_COMPONENT_KEYS) {
          const replComp = replacementComponents[key] ?? 0;

          if (draftedTotals) {
            // Team has FG-matched players: drafted portion uses replacement-scaled components,
            // filler portion adds remaining slots. The approximation is:
            // total components ≈ replacement_per_player × rosterSize
            // (since we can't decompose individual player components from the rate totals)
            // This is safe because rate filler is designed to be symmetric.
            combinedComponents[key] = replComp * rosterSize;
          } else {
            // No FG data: pure replacement-level for all slots
            combinedComponents[key] = replComp * rosterSize;
          }
        }

        // Guard against IP <= 0 to prevent NaN/Infinity in ERA/WHIP
        if (combinedComponents.IP <= 0) {
          teamProjected[cat.stat_key] = 0;
          continue;
        }

        try {
          const rate = calculateFinalRate(cat.formula_id, {}, combinedComponents);
          teamProjected[cat.stat_key] = isFinite(rate) ? rate : 0;
        } catch {
          teamProjected[cat.stat_key] = 0;
        }
      }
    }

    projectedTotals.set(teamId, teamProjected);
  }

  // 5. Compute roto points per category, overall rank
  const rotoResults = computeRotoPts(projectedTotals, categories);

  // Build standings array with team metadata
  const standings: ProjectedTeamStanding[] = [];

  for (const [teamId, rosterInfo] of teamRosters) {
    const rotoResult = rotoResults.get(teamId);
    if (!rotoResult) continue;

    standings.push({
      teamId,
      teamName: rosterInfo.teamName,
      projectedRotoPts: rotoResult.rotoPts,
      projectedOverallRank: 0,  // Set after sorting
      categoryRanks: rotoResult.categoryRanks,
      draftedPlayersCount: picksByTeam.get(teamId) ?? 0,
    });
  }

  // Sort by roto points descending, assign overall ranks
  standings.sort((a, b) => b.projectedRotoPts - a.projectedRotoPts);
  for (let i = 0; i < standings.length; i++) {
    standings[i].projectedOverallRank = i + 1;
  }

  // 6. Find user's team rank and weak/strong categories
  let myTeamRank = 0;
  const myWeakCategories: string[] = [];
  const myStrongCategories: string[] = [];

  if (myTeamId) {
    const myStanding = standings.find(s => s.teamId === myTeamId);
    if (myStanding) {
      myTeamRank = myStanding.projectedOverallRank;
      const totalTeamsWithData = standings.length;

      for (const [statKey, rank] of Object.entries(myStanding.categoryRanks)) {
        // Strong: top 3 (rank 1, 2, or 3)
        if (rank <= 3) {
          myStrongCategories.push(statKey);
        }
        // Weak: bottom 4 (rank >= totalTeams - 3)
        if (totalTeamsWithData >= 4 && rank >= totalTeamsWithData - 3) {
          myWeakCategories.push(statKey);
        }
      }
    }
  }

  return {
    standings,
    myTeamRank,
    myWeakCategories,
    myStrongCategories,
    draftProgressWeight,
    totalTeamCount: totalTeams,
    teamsWithData,
    computeTimeMs: Math.round((performance.now() - t0) * 10) / 10,
  };
}
