import type { DraftPick, DraftRanking, DraftedPlayer } from "@espn-fantasy/shared";

const POSITION_TARGETS: Record<string, number> = {
  C: 1,
  "1B": 1,
  "2B": 1,
  "3B": 1,
  SS: 1,
  OF: 3,
  SP: 5,
  RP: 2,
};

export type ScarcitySeverity = "critical" | "warning";

export interface PositionScarcityAlert {
  position: string;
  teamsNeeding: number;
  topPlayersLeft: number;
  totalAvailable: number;
  severity: ScarcitySeverity;
  myTeamNeeds: boolean;
}

function normalizePosition(pos: string): string | null {
  const upper = pos.toUpperCase();
  if (upper === "DH") return "UTIL";
  if (upper.includes("SP")) return "SP";
  if (upper.includes("RP")) return "RP";
  if (upper === "P") return "SP";
  if (upper.includes("OF")) return "OF";
  return POSITION_TARGETS[upper] ? upper : null;
}

/**
 * Compute position scarcity alerts based on draft state.
 *
 * For each tracked position:
 * 1. Determine how many "top" players remain undrafted (top N where N = totalTeams * slots)
 * 2. Count how many teams still need that position (drafted count < target)
 * 3. Generate alert when teamsNeeding > topPlayersLeft
 */
export function computePositionScarcity(
  rankings: DraftRanking[],
  allPicks: DraftPick[],
  teamRosters: Map<string, { teamId: string; teamName: string; playerIds: number[] }>,
  totalTeams: number,
  myRoster: DraftedPlayer[],
  myTeamId: string | null,
): PositionScarcityAlert[] {
  const draftedPlayerIds = new Set(allPicks.map((p) => p.playerId));
  const alerts: PositionScarcityAlert[] = [];

  for (const [position, slotsPerTeam] of Object.entries(POSITION_TARGETS)) {
    // Skip UTIL — it's a flex slot, not position-specific scarcity
    if (position === "UTIL") continue;

    // Top tier size: total teams * slots for this position
    const topTierSize = totalTeams * slotsPerTeam;

    // Get all ranked players eligible for this position
    const eligibleRanked = rankings.filter((r) =>
      r.positions.some((p) => normalizePosition(p) === position),
    );

    // Top players are the first N by ranking order (rankings are pre-sorted by value)
    const topPlayers = eligibleRanked.slice(0, topTierSize);

    // Count how many top-tier players are still undrafted
    const topPlayersLeft = topPlayers.filter(
      (p) => !draftedPlayerIds.has(p.playerId),
    ).length;

    // Count total available (all undrafted at this position)
    const totalAvailable = eligibleRanked.filter(
      (p) => !draftedPlayerIds.has(p.playerId),
    ).length;

    // Count teams that still need this position
    let teamsNeeding = 0;

    // For teams that have drafted (in teamRosters), check if they've filled position
    const teamsAccountedFor = new Set<string>();

    for (const [teamId, roster] of teamRosters) {
      teamsAccountedFor.add(teamId);

      // Count how many players on this team play this position
      const posCount = allPicks.filter(
        (pick) =>
          pick.teamId === teamId &&
          pick.positions.some((p) => normalizePosition(p) === position),
      ).length;

      if (posCount < slotsPerTeam) {
        teamsNeeding++;
      }
    }

    // Teams not yet in teamRosters need ALL positions
    const unknownTeams = Math.max(0, totalTeams - teamsAccountedFor.size);
    teamsNeeding += unknownTeams;

    // Determine if MY team still needs this position
    const myPosCount = myRoster.filter((player) =>
      player.positions.some((p) => normalizePosition(p) === position),
    ).length;
    const myTeamNeeds = myPosCount < slotsPerTeam;

    // Only generate alert when position is actually scarce
    if (teamsNeeding > topPlayersLeft && topPlayersLeft <= topTierSize) {
      const severity: ScarcitySeverity =
        topPlayersLeft <= 1 ? "critical" : "warning";

      alerts.push({
        position,
        teamsNeeding,
        topPlayersLeft,
        totalAvailable,
        severity,
        myTeamNeeds,
      });
    }
  }

  // Sort: critical first, then by fewest top players left, then by positions my team needs
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "critical" ? -1 : 1;
    }
    if (a.myTeamNeeds !== b.myTeamNeeds) {
      return a.myTeamNeeds ? -1 : 1;
    }
    return a.topPlayersLeft - b.topPlayersLeft;
  });

  return alerts;
}
