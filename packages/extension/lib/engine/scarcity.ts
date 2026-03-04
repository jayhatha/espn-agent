import type { DraftPick, DraftRanking, DraftedPlayer } from "@espn-fantasy/shared";
import type { EnhancedScarcitySignal } from "./types";

const POSITION_TARGETS: Record<string, number> = {
  C: 1, "1B": 1, "2B": 1, "3B": 1, SS: 1, OF: 3, SP: 5, RP: 2,
};

function normalizePosition(pos: string): string | null {
  const upper = pos.toUpperCase();
  if (upper === "DH") return "UTIL";
  if (upper.includes("SP")) return "SP";
  if (upper.includes("RP")) return "RP";
  if (upper === "P") return "SP";
  if (upper.includes("OF")) return "OF";
  return POSITION_TARGETS[upper] ? upper : null;
}

export function computeEnhancedScarcity(
  rankings: DraftRanking[],
  allPicks: DraftPick[],
  teamRosters: Map<string, { teamId: string; teamName: string; playerIds: number[] }>,
  totalTeams: number,
  myRoster: DraftedPlayer[],
  myTeamId: string | null,
): EnhancedScarcitySignal[] {
  const draftedIds = new Set(allPicks.map(p => p.playerId));
  const signals: EnhancedScarcitySignal[] = [];

  // Sort rankings by VBD descending (don't trust incoming sort order -- per research pitfall #3)
  const sortedRankings = [...rankings].sort((a, b) => b.vbdScore - a.vbdScore);

  for (const [position, slotsPerTeam] of Object.entries(POSITION_TARGETS)) {
    if (position === "UTIL") continue;

    const topTierSize = totalTeams * slotsPerTeam;

    // All ranked players eligible for this position, sorted by VBD
    const eligibleRanked = sortedRankings.filter(r =>
      r.positions.some(p => normalizePosition(p) === position)
    );

    // Undrafted eligible players (preserving VBD sort)
    const eligibleUndrafted = eligibleRanked.filter(
      r => !draftedIds.has(r.playerId)
    );

    // Top-tier players still undrafted
    const topPlayers = eligibleRanked.slice(0, topTierSize);
    const supply = topPlayers.filter(p => !draftedIds.has(p.playerId)).length;
    const totalAvailable = eligibleUndrafted.length;

    // Demand: count teams that still need this position
    let demand = 0;
    const teamsAccountedFor = new Set<string>();

    for (const [teamId] of teamRosters) {
      teamsAccountedFor.add(teamId);
      const posCount = allPicks.filter(
        pick => pick.teamId === teamId &&
          pick.positions.some(p => normalizePosition(p) === position)
      ).length;
      if (posCount < slotsPerTeam) demand++;
    }
    // Unknown teams assumed to need all positions
    demand += Math.max(0, totalTeams - teamsAccountedFor.size);

    // Tier drop value: VBD gap between best available and first player in next tier
    let tierDropValue = 0;
    if (eligibleUndrafted.length >= 2) {
      const topAvailable = eligibleUndrafted[0];
      const nextTierPlayer = eligibleUndrafted.find(
        p => p.tier > topAvailable.tier
      );
      tierDropValue = nextTierPlayer
        ? topAvailable.vbdScore - nextTierPlayer.vbdScore
        : 0;
    }

    // Scarcity index: 0-1, combining demand/supply ratio (60%) and tier drop (40%)
    const demandSupplyRatio = supply > 0 ? demand / supply : (demand > 0 ? 2.0 : 0);
    const normalizedDemandSupply = Math.min(1.0, demandSupplyRatio / 2.0);
    const normalizedTierDrop = Math.min(1.0, tierDropValue / 50);
    const scarcityIndex = normalizedDemandSupply * 0.6 + normalizedTierDrop * 0.4;

    // Check if my team needs this position
    const myPosCount = myRoster.filter(player =>
      player.positions.some(p => normalizePosition(p) === position)
    ).length;
    const myTeamNeeds = myPosCount < slotsPerTeam;

    signals.push({
      position,
      supply,
      demand,
      totalAvailable,
      tierDropValue,
      scarcityIndex,
      myTeamNeeds,
    });
  }

  // Sort by scarcity index descending
  return signals.sort((a, b) => b.scarcityIndex - a.scarcityIndex);
}
