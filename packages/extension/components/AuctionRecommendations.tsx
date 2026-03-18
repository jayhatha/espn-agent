import React, { useMemo } from "react";
import { useDraftStore } from "../lib/draft-state";
import AuctionPlayerCard from "./AuctionPlayerCard";
import { calculateBudgetPacing } from "../lib/value-calculations";
import { normalizeName as normalizePlayerName } from "../lib/engine/normalizer";

export default function AuctionRecommendations() {
  const {
    auctionValues,
    rankings,
    selectedPosition,
    setPositionFilter,
    myRoster,
    rosterSize,
    allPicks,
    espnDomAuctionValues,
    remainingBudget,
  } = useDraftStore();

  // Calculate budget pacing for filtering (derive total budget from remaining + spent)
  const pacing = useMemo(() => {
    const spent = myRoster.reduce((sum, p) => sum + (p.cost ?? 0), 0);
    const totalBudget = remainingBudget + spent;
    return calculateBudgetPacing(totalBudget, myRoster, rosterSize);
  }, [myRoster, rosterSize, remainingBudget]);

  // Filter out already-drafted players — Sets are inside useMemo so they're only
  // rebuilt when allPicks changes, not on every render caused by espnDomAuctionValues updates.
  const availablePlayers = useMemo(() => {
    const draftedPlayerIds = new Set(allPicks.map((p) => p.playerId));
    const draftedPlayerNames = new Set(
      allPicks.map((p) => normalizePlayerName(p.playerName)),
    );
    return auctionValues.filter((player) => {
      if (draftedPlayerIds.has(player.playerId)) {
        return false;
      }

      return !draftedPlayerNames.has(normalizePlayerName(player.playerName));
    });
  }, [auctionValues, allPicks]);

  const rankingsByName = useMemo(() => {
    return new Map(
      rankings.map((ranking) => [
        normalizePlayerName(ranking.playerName),
        ranking,
      ]),
    );
  }, [rankings]);

  // Apply filters -- sort by external rank first, then ESPN ASV (or FG $) as tiebreaker
  const filteredPlayers = useMemo(() => {
    let players = availablePlayers.map((player) => {
      const ranking = rankingsByName.get(
        normalizePlayerName(player.playerName),
      );

      // Use ESPN ASV when available, fall back to FG dollar value
      const effectiveValue = (player.playerId && espnDomAuctionValues[player.playerId] !== undefined)
        ? espnDomAuctionValues[player.playerId]
        : (player.dollarValue ?? 0);

      return {
        player,
        externalRank: ranking?.externalRank ?? 9999,
        dollarValue: effectiveValue,
      };
    });

    if (selectedPosition) {
      players = players.filter(({ player }) =>
        player.positions.includes(selectedPosition),
      );
    }

    // Sort by external rank ascending (lower = better), then market $ descending
    return players
      .sort((a, b) => {
        if (a.externalRank !== b.externalRank) return a.externalRank - b.externalRank;
        return b.dollarValue - a.dollarValue;
      })
      .map((entry) => entry.player);
  }, [
    availablePlayers,
    selectedPosition,
    rankingsByName,
    espnDomAuctionValues,
  ]);

  // Categorize players by affordability (use market value for display filter)
  const affordablePlayers = filteredPlayers.filter(
    (p) => {
      const marketValue = (p.playerId && espnDomAuctionValues[p.playerId] !== undefined)
        ? espnDomAuctionValues[p.playerId]
        : p.dollarValue;
      return marketValue <= pacing.recommendedMaxBid;
    },
  );

  const positions = ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP"];

  return (
    <div className="flex flex-col h-full bg-grafana-panel">
      {/* Filter controls */}
      <div className="p-3 bg-grafana-panel border-b border-grafana-border space-y-2">
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setPositionFilter(null)}
            className={`
              px-2 py-1 text-xs rounded
              ${!selectedPosition ? "bg-grafana-text text-grafana-bg" : "bg-grafana-panel text-grafana-muted border border-grafana-border"}
            `}
          >
            All
          </button>
          {positions.map((pos) => (
            <button
              key={pos}
              onClick={() => setPositionFilter(pos)}
              className={`
                px-2 py-1 text-xs rounded
                ${selectedPosition === pos ? "bg-grafana-text text-grafana-bg" : "bg-grafana-panel text-grafana-muted border border-grafana-border"}
              `}
            >
              {pos}
            </button>
          ))}
        </div>

        <div className="text-xs text-grafana-muted">
          {affordablePlayers.length} affordable (&#8804;${pacing.recommendedMaxBid})
        </div>
      </div>

      {/* Player list */}
      <div className="flex-1 overflow-y-auto">
        {filteredPlayers.length === 0 ? (
          <div className="p-4 text-center text-grafana-muted">
            {auctionValues.length === 0
              ? "Loading values..."
              : "No players match filters"}
          </div>
        ) : (
          filteredPlayers
            .slice(0, 10)
            .map((player, index) => (
              <AuctionPlayerCard
                key={player.playerId}
                player={player}
                rank={index + 1}
              />
            ))
        )}
      </div>
    </div>
  );
}
