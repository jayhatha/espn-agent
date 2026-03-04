import type { DraftedPlayer, DraftRanking, Category } from "@espn-fantasy/shared";
import { calculateCategorySGP, calculateFinalRate } from "@espn-fantasy/shared";
import type { CategoryGapSignal } from "./types";

export function computeCategoryGaps(
  myRoster: DraftedPlayer[],
  teamRosters: Map<string, { teamId: string; teamName: string; playerIds: number[] }>,
  rankingsMap: Map<number, DraftRanking>,
  categories: Category[],
): CategoryGapSignal[] {
  if (myRoster.length === 0 || categories.length === 0) return [];

  const signals: CategoryGapSignal[] = [];

  for (const cat of categories) {
    const statKey = cat.stat_key;
    const isRate = cat.type === "RATE";

    // My team's projected total for this category
    let myTotal: number;
    if (isRate && cat.formula_id) {
      // For rate stats: sum components across my roster, then compute rate
      const components: Record<string, number> = {};
      for (const player of myRoster) {
        const ranking = rankingsMap.get(player.playerId);
        const stats = ranking?.projectedStats ?? player.projectedStats ?? {};
        for (const [key, val] of Object.entries(stats)) {
          components[key] = (components[key] || 0) + (Number(val) || 0);
        }
      }
      try {
        myTotal = calculateFinalRate(cat.formula_id, {}, components);
      } catch {
        myTotal = 0;
      }
    } else {
      // For counting stats: direct sum
      myTotal = myRoster.reduce((sum, player) => {
        const ranking = rankingsMap.get(player.playerId);
        const stats = ranking?.projectedStats ?? player.projectedStats ?? {};
        return sum + (Number(stats[statKey]) || 0);
      }, 0);
    }

    // All teams' totals (for z-score comparison)
    const allTeamTotals: number[] = [];
    for (const [, roster] of teamRosters) {
      if (isRate && cat.formula_id) {
        const components: Record<string, number> = {};
        for (const pid of roster.playerIds) {
          const ranking = rankingsMap.get(pid);
          const stats = ranking?.projectedStats ?? {};
          for (const [key, val] of Object.entries(stats)) {
            components[key] = (components[key] || 0) + (Number(val) || 0);
          }
        }
        try {
          allTeamTotals.push(calculateFinalRate(cat.formula_id, {}, components));
        } catch {
          allTeamTotals.push(0);
        }
      } else {
        const teamTotal = roster.playerIds.reduce((sum, pid) => {
          const ranking = rankingsMap.get(pid);
          const stats = ranking?.projectedStats ?? {};
          return sum + (Number(stats[statKey]) || 0);
        }, 0);
        allTeamTotals.push(teamTotal);
      }
    }

    // Z-score: how far is my team from league average
    const gapZScore = allTeamTotals.length > 1
      ? calculateCategorySGP(myTotal, allTeamTotals)
      : 0;

    const leagueAvgTotal = allTeamTotals.length > 0
      ? allTeamTotals.reduce((a, b) => a + b, 0) / allTeamTotals.length
      : 0;

    // Risk score: for HIGHER_BETTER, negative z-score = risk. For LOWER_BETTER, positive z-score = risk (high ERA is bad).
    const adjustedZ = cat.direction === "LOWER_BETTER" ? -gapZScore : gapZScore;
    // Risk increases as z-score goes more negative (below average)
    const categoryRiskScore = Math.min(1.0, Math.max(0, (-adjustedZ) / 2.0));

    signals.push({
      category: cat.stat_key,
      myTeamTotal: Math.round(myTotal * 1000) / 1000, // 3 decimal places for rates
      leagueAvgTotal: Math.round(leagueAvgTotal * 1000) / 1000,
      gapZScore: Math.round(gapZScore * 100) / 100,
      categoryRiskScore: Math.round(categoryRiskScore * 100) / 100,
      direction: cat.direction as "HIGHER_BETTER" | "LOWER_BETTER",
    });
  }

  // Sort by risk score descending (most at-risk categories first)
  return signals.sort((a, b) => b.categoryRiskScore - a.categoryRiskScore);
}
