/**
 * Shared roto ranking utility
 *
 * Assigns ranks and roto points with tie handling for roto-format leagues.
 * Extracted from SnapshotOrchestratorAgent for reuse in transaction impact analysis.
 */

export interface RankedTeam {
  teamId: number;
  rank: number;
  rotoPoints: number;
}

/**
 * Assign ranks and roto points with tie handling.
 * Tied teams (same value) share the average of the positions they occupy.
 * e.g. Two teams tied for 1st in a 10-team league: each gets (10+9)/2 = 9.5 points.
 * Input must already be sorted in the desired ranking order.
 */
export function assignRanksWithTies(
  sorted: Array<{ teamId: number; value: number }>,
  numTeams: number,
): RankedTeam[] {
  const result: RankedTeam[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].value === sorted[i].value) {
      j++;
    }
    const tiedCount = j - i;
    let totalPoints = 0;
    for (let k = i; k < j; k++) {
      totalPoints += numTeams - k;
    }
    const sharedPoints = totalPoints / tiedCount;
    const rank = i + 1;

    for (let k = i; k < j; k++) {
      result.push({ teamId: sorted[k].teamId, rank, rotoPoints: sharedPoints });
    }
    i = j;
  }
  return result;
}

/**
 * Compute total roto points for each team across all categories.
 * Returns a map of teamId → total roto points.
 */
export function computeOverallRotoPoints(
  categoryRankings: Array<{ teamId: number; rotoPoints: number }>[],
): Map<number, number> {
  const overall = new Map<number, number>();
  for (const catRanking of categoryRankings) {
    for (const { teamId, rotoPoints } of catRanking) {
      overall.set(teamId, (overall.get(teamId) || 0) + rotoPoints);
    }
  }
  return overall;
}
