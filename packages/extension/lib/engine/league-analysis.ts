/**
 * league-analysis.ts
 *
 * computeLeagueAnalysis — league-wide category analysis using FanGraphs projections.
 *
 * Pure function: no Zustand reads, no DOM access, no side effects.
 *
 * For each team in the draft, matches their drafted players to FG projections by name,
 * computes per-category totals (counting: sum; rate: component-based), then ranks all
 * teams per category to surface the user's relative position and market demand signals.
 *
 * Called as step 5b in computeDraftEngine (engine/index.ts).
 */

import type { Category } from "@espn-fantasy/shared";
import { calculateFinalRate } from "@espn-fantasy/shared";
import type { FgHitterProjection, FgPitcherProjection } from "../fangraphs-data";
import type { LeagueAnalysisSignal, TeamCategoryRanking, CategoryDemand } from "./types";
import { normalizeName } from "./archetype";

// ============================================================
// computeLeagueAnalysis — main exported function
// ============================================================

/**
 * Compute league-wide category analysis.
 *
 * @param teamRosters - All teams in the draft (teamId -> { teamId, teamName, playerIds })
 * @param allPicks - All picks made so far (playerId, playerName, teamId)
 * @param myTeamId - The user's team ID (null if not yet detected)
 * @param categories - League scoring categories
 * @param fgHitters - FanGraphs hitter projections (bundled JSON)
 * @param fgPitchers - FanGraphs pitcher projections (bundled JSON)
 */
export function computeLeagueAnalysis(
  teamRosters: Map<string, { teamId: string; teamName: string; playerIds: number[] }>,
  allPicks: Array<{ playerId: number; playerName: string; teamId: string }>,
  myTeamId: string | null,
  categories: Category[],
  fgHitters: FgHitterProjection[],
  fgPitchers: FgPitcherProjection[],
): LeagueAnalysisSignal {
  const t0 = performance.now();

  // ---- 1. Build FG projection lookup maps by normalized name ----
  const hitterProjMap = new Map<string, FgHitterProjection>();
  for (const h of fgHitters) {
    hitterProjMap.set(normalizeName(h.name), h);
  }

  const pitcherProjMap = new Map<string, FgPitcherProjection>();
  for (const p of fgPitchers) {
    pitcherProjMap.set(normalizeName(p.name), p);
  }

  // Build pitcher name set to classify hitter vs pitcher
  const pitcherNameSet = new Set<string>(pitcherProjMap.keys());

  // ---- 2. Group allPicks by teamId ----
  const picksByTeam = new Map<string, Array<{ playerId: number; playerName: string }>>();
  for (const pick of allPicks) {
    let team = picksByTeam.get(pick.teamId);
    if (!team) {
      team = [];
      picksByTeam.set(pick.teamId, team);
    }
    team.push({ playerId: pick.playerId, playerName: pick.playerName });
  }

  // ---- 3. For each team, compute per-category totals using FG projections ----
  // teamTotals: teamId -> category stat_key -> total
  const teamTotals = new Map<string, Record<string, number>>();
  let teamsAnalyzed = 0;

  for (const [teamId] of teamRosters) {
    const picks = picksByTeam.get(teamId) ?? [];
    if (picks.length === 0) continue;

    // For each pick, look up FG projection
    // Build combined stat records per player, then aggregate per category
    const playerStats: Array<Record<string, number>> = [];
    for (const pick of picks) {
      const nName = normalizeName(pick.playerName);
      const stats: Record<string, number> = {};

      if (pitcherNameSet.has(nName)) {
        // Pitcher
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
        // Hitter (default)
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

      playerStats.push(stats);
    }

    // Skip teams where no players matched FG projections
    const matchedCount = playerStats.filter(s => Object.keys(s).length > 0).length;
    if (matchedCount === 0) continue;

    // Compute per-category totals
    const catTotals: Record<string, number> = {};
    for (const cat of categories) {
      if (cat.type === "COUNTING") {
        catTotals[cat.stat_key] = playerStats.reduce(
          (sum, s) => sum + (s[cat.stat_key] ?? 0),
          0,
        );
      } else if (cat.type === "RATE" && cat.formula_id) {
        // Sum all components, then compute rate
        const combined: Record<string, number> = {};
        for (const s of playerStats) {
          for (const [key, val] of Object.entries(s)) {
            combined[key] = (combined[key] ?? 0) + val;
          }
        }
        try {
          const rate = calculateFinalRate(cat.formula_id, {}, combined);
          catTotals[cat.stat_key] = isFinite(rate) ? rate : 0;
        } catch {
          catTotals[cat.stat_key] = 0;
        }
      }
    }

    teamTotals.set(teamId, catTotals);
    teamsAnalyzed++;
  }

  // If fewer than 2 teams have data, return early with empty signal
  if (teamsAnalyzed < 2) {
    return {
      categoryRankings: [],
      categoryDemand: [],
      recommendations: [],
      teamsAnalyzed,
      teamDraftedTotals: new Map(),
      computeTimeMs: Math.round((performance.now() - t0) * 10) / 10,
    };
  }

  // ---- 4. For each category, rank all teams ----
  const categoryRankings: TeamCategoryRanking[] = [];
  const categoryDemand: CategoryDemand[] = [];

  const teamsWithData = Array.from(teamTotals.keys());
  const totalTeamsWithData = teamsWithData.length;

  for (const cat of categories) {
    const statKey = cat.stat_key;
    const direction = cat.direction as "HIGHER_BETTER" | "LOWER_BETTER";

    // Collect totals for all teams with data
    const teamValues: Array<{ teamId: string; total: number }> = [];
    for (const teamId of teamsWithData) {
      const total = teamTotals.get(teamId)?.[statKey] ?? 0;
      teamValues.push({ teamId, total });
    }

    // Sort by direction: HIGHER_BETTER = descending (rank 1 = most), LOWER_BETTER = ascending (rank 1 = least)
    if (direction === "LOWER_BETTER") {
      // For ERA/WHIP: rank 1 = lowest (best). Skip teams with zero (no pitchers)
      teamValues.sort((a, b) => {
        if (a.total === 0 && b.total === 0) return 0;
        if (a.total === 0) return 1;   // 0 means no data, push to bottom
        if (b.total === 0) return -1;
        return a.total - b.total;
      });
    } else {
      teamValues.sort((a, b) => b.total - a.total);
    }

    // Find myTeamId rank (1-based)
    let myRank = 0;
    let myTotal = 0;
    if (myTeamId) {
      const myIndex = teamValues.findIndex(t => t.teamId === myTeamId);
      if (myIndex >= 0) {
        myRank = myIndex + 1;
        myTotal = teamValues[myIndex].total;
      }
    }

    // Compute median
    const sortedValues = [...teamValues].map(t => t.total).filter(v => v > 0);
    let leagueMedian = 0;
    if (sortedValues.length > 0) {
      const mid = Math.floor(sortedValues.length / 2);
      leagueMedian = sortedValues.length % 2 === 0
        ? (sortedValues[mid - 1] + sortedValues[mid]) / 2
        : sortedValues[mid];
    }

    // Only add ranking if we have user data
    if (myRank > 0) {
      categoryRankings.push({
        category: statKey,
        myRank,
        totalTeams: totalTeamsWithData,
        myTotal,
        leagueMedian,
        direction,
      });
    }

    // ---- 5. Compute CategoryDemand ----
    // weakTeamCount = teams below median for HIGHER_BETTER, above median for LOWER_BETTER
    let weakTeamCount = 0;
    let strongTeamCount = 0;

    if (direction === "LOWER_BETTER") {
      for (const { total } of teamValues) {
        if (total === 0) continue;  // No data
        if (total > leagueMedian) weakTeamCount++;
        else if (total < leagueMedian) strongTeamCount++;
      }
    } else {
      for (const { total } of teamValues) {
        if (total < leagueMedian) weakTeamCount++;
        else if (total > leagueMedian) strongTeamCount++;
      }
    }

    const weakFraction = totalTeamsWithData > 0 ? weakTeamCount / totalTeamsWithData : 0;
    const demandLevel: "high" | "medium" | "low" =
      weakFraction >= 0.6 ? "high"
      : weakFraction >= 0.4 ? "medium"
      : "low";

    categoryDemand.push({
      category: statKey,
      weakTeamCount,
      strongTeamCount,
      demandLevel,
    });
  }

  // ---- 6. Generate 2-3 strategic recommendations ----
  const recommendations: string[] = [];

  // Find my strong and weak categories
  const totalTeams = totalTeamsWithData;
  const strongCats = categoryRankings.filter(r => r.myRank <= 3);
  const weakCats = categoryRankings.filter(r => r.myRank >= totalTeams - 2 && totalTeams >= 4);

  // High-demand categories where user is weak
  const highDemandWeakCats = categoryDemand.filter(d => {
    if (d.demandLevel !== "high") return false;
    const ranking = categoryRankings.find(r => r.category === d.category);
    return ranking && ranking.myRank >= totalTeams - 2;
  });

  // High-demand categories where user is strong
  const highDemandStrongCats = categoryDemand.filter(d => {
    if (d.demandLevel !== "high") return false;
    const ranking = categoryRankings.find(r => r.category === d.category);
    return ranking && ranking.myRank <= 3;
  });

  // Add recommendations (capped at 3)
  for (const cat of strongCats.slice(0, 2)) {
    if (recommendations.length >= 3) break;
    recommendations.push(
      `Strong in ${cat.category} (rank ${cat.myRank} of ${cat.totalTeams}) — can deprioritize`,
    );
  }

  for (const cat of weakCats.slice(0, 2)) {
    if (recommendations.length >= 3) break;
    // Don't duplicate if already covered by bidding war recommendation
    const alreadyCovered = highDemandWeakCats.some(d => d.category === cat.category);
    if (!alreadyCovered) {
      recommendations.push(
        `Weak in ${cat.category} (rank ${cat.myRank} of ${cat.totalTeams}) — target ${cat.category} contributors`,
      );
    }
  }

  for (const demand of highDemandWeakCats.slice(0, 1)) {
    if (recommendations.length >= 3) break;
    const ranking = categoryRankings.find(r => r.category === demand.category);
    if (ranking) {
      recommendations.push(
        `Expect bidding wars for ${demand.category} — many teams need it and so do you`,
      );
    }
  }

  for (const demand of highDemandStrongCats.slice(0, 1)) {
    if (recommendations.length >= 3) break;
    recommendations.push(
      `Leverage ${demand.category} strength — opponents will overpay in a category you already lead`,
    );
  }

  return {
    categoryRankings,
    categoryDemand,
    recommendations,
    teamsAnalyzed,
    teamDraftedTotals: teamTotals,  // Exposed for projected-standings.ts
    computeTimeMs: Math.round((performance.now() - t0) * 10) / 10,
  };
}
