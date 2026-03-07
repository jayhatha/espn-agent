import type { DraftPick, DraftRanking, DraftedPlayer, AuctionValue } from "@espn-fantasy/shared";
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
  auctionValues: AuctionValue[],
): EnhancedScarcitySignal[] {
  const draftedIds = new Set(allPicks.map(p => p.playerId));
  const signals: EnhancedScarcitySignal[] = [];

  // Build auction value lookup for dollar-based tier drops
  const auctionMap = new Map(auctionValues.map(av => [av.playerId, av.dollarValue]));

  // Sort by external rank (lower = better), then by auction $ descending as tiebreaker
  const sortedRankings = [...rankings].sort((a, b) => {
    const aRank = a.externalRank ?? 9999;
    const bRank = b.externalRank ?? 9999;
    if (aRank !== bRank) return aRank - bRank;
    const aDollars = auctionMap.get(a.playerId) ?? 0;
    const bDollars = auctionMap.get(b.playerId) ?? 0;
    return bDollars - aDollars;
  });

  // Pre-group allPicks by teamId for O(1) team lookup in demand calculation
  const picksByTeam = new Map<string, typeof allPicks>();
  for (const pick of allPicks) {
    if (!picksByTeam.has(pick.teamId)) picksByTeam.set(pick.teamId, []);
    picksByTeam.get(pick.teamId)!.push(pick);
  }

  for (const [position, slotsPerTeam] of Object.entries(POSITION_TARGETS)) {
    if (position === "UTIL") continue;

    const topTierSize = totalTeams * slotsPerTeam;

    // All ranked players eligible for this position, sorted by external rank
    const eligibleRanked = sortedRankings.filter(r =>
      r.positions.some(p => normalizePosition(p) === position)
    );

    // Undrafted eligible players (preserving external rank sort)
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
      const teamPicks = picksByTeam.get(teamId) ?? [];
      const posCount = teamPicks.filter(
        pick => pick.positions.some(p => normalizePosition(p) === position)
      ).length;
      if (posCount < slotsPerTeam) demand++;
    }
    // Unknown teams assumed to need all positions
    demand += Math.max(0, totalTeams - teamsAccountedFor.size);

    // Tier drop value: auction $ gap between best available and first player in next tier
    let tierDropValue = 0;
    if (eligibleUndrafted.length >= 2) {
      const topAvailable = eligibleUndrafted[0];
      const nextTierPlayer = eligibleUndrafted.find(
        p => p.tier > topAvailable.tier
      );
      if (nextTierPlayer) {
        const topDollars = auctionMap.get(topAvailable.playerId) ?? 0;
        const nextDollars = auctionMap.get(nextTierPlayer.playerId) ?? 0;
        tierDropValue = Math.max(0, topDollars - nextDollars);
      }
    }

    // Scarcity index: 0-1, combining demand/supply ratio (60%) and tier drop (40%)
    // Ratio of 1.0 = balanced (supply matches demand), not scarce.
    // Only starts contributing when demand exceeds supply.
    const demandSupplyRatio = supply > 0 ? demand / supply : (demand > 0 ? 2.0 : 0);
    const normalizedDemandSupply = Math.min(1.0, Math.max(0, demandSupplyRatio - 1.0));

    // Tier drop is a static property of the player pool early in the draft.
    // Dampen it by position depletion — only urgent when players are actually being drafted away.
    const drafted = topTierSize - supply;
    const depletionRate = topTierSize > 0 ? drafted / topTierSize : 0;
    const normalizedTierDrop = Math.min(1.0, tierDropValue / 20);
    // At 0% depletion: tier drop contributes 0. At 33%+ depletion: full contribution.
    const dampedTierDrop = normalizedTierDrop * Math.min(1.0, depletionRate * 3);

    const scarcityIndex = normalizedDemandSupply * 0.6 + dampedTierDrop * 0.4;

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
