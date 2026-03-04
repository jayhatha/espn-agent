import React, { useState, useMemo } from "react";
import { useDraftStore } from "../lib/draft-state";

function formatNumber(value: unknown, digits: number): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return "0.0";
  }

  return numericValue.toFixed(digits);
}

export default function PreDraftRankingEditor() {
  const {
    rankings,
    userRankingOverrides,
    setPlayerOverrideRank,
    clearPlayerOverride,
    clearAllOverrides,
  } = useDraftStore();
  const [searchQuery, setSearchQuery] = useState("");

  // Apply user overrides to rankings
  const adjustedRankings = useMemo(() => {
    const rankingsWithOverrides = rankings.map((player) => ({
      ...player,
      userRank: userRankingOverrides[player.playerId] || null,
      isOverridden: player.playerId in userRankingOverrides,
    }));

    // Sort by user rank if exists, otherwise by VBD score
    return rankingsWithOverrides.sort((a, b) => {
      if (a.userRank !== null && b.userRank !== null) {
        return a.userRank - b.userRank;
      }
      if (a.userRank !== null) return -1;
      if (b.userRank !== null) return 1;
      return b.vbdScore - a.vbdScore;
    });
  }, [rankings, userRankingOverrides]);

  // Filter by search
  const filteredRankings = useMemo(() => {
    if (!searchQuery) return adjustedRankings;
    const query = searchQuery.toLowerCase();
    return adjustedRankings.filter(
      (p) =>
        p.playerName.toLowerCase().includes(query) ||
        p.positions.some((pos) => pos.toLowerCase().includes(query)),
    );
  }, [adjustedRankings, searchQuery]);

  const handleRankChange = (playerId: number, newRank: string) => {
    const rank = parseInt(newRank, 10);
    if (isNaN(rank) || rank < 1) {
      clearPlayerOverride(playerId);
    } else {
      setPlayerOverrideRank(playerId, rank);
    }
  };

  const overrideCount = Object.keys(userRankingOverrides).length;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-3 bg-surface-secondary border-b">
        <h3 className="font-semibold text-sm mb-2">Customize Rankings</h3>
        <p className="text-xs text-content-secondary mb-3">
          Adjust player ranks before draft starts. Your changes will affect
          recommendations.
        </p>

        {/* Search */}
        <input
          type="text"
          placeholder="Search players..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-sm border rounded mb-2"
        />

        {/* Override stats */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-content-secondary">
            {overrideCount} player{overrideCount !== 1 ? "s" : ""} customized
          </span>
          {overrideCount > 0 && (
            <button
              onClick={clearAllOverrides}
              className="text-xs text-negative hover:text-negative"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Player list */}
      <div className="flex-1 overflow-y-auto">
        {filteredRankings.length === 0 ? (
          <div className="p-4 text-center text-sm text-content-tertiary">
            {searchQuery ? "No players found" : "No rankings available"}
          </div>
        ) : (
          filteredRankings.slice(0, 100).map((player, index) => (
            <div
              key={player.playerId}
              className={`p-3 border-b ${
                player.isOverridden
                  ? "bg-warning-light border-warning-border"
                  : "hover:bg-surface-secondary"
              }`}
            >
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {player.playerName}
                  </div>
                  <div className="text-xs text-content-tertiary">
                    {player.positions.join(", ")} • VBD:{" "}
                    {formatNumber(player.vbdScore, 1)}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-xs text-content-tertiary">Rank:</div>
                  <input
                    type="number"
                    min="1"
                    placeholder={`${index + 1}`}
                    value={player.userRank || ""}
                    onChange={(e) =>
                      handleRankChange(player.playerId, e.target.value)
                    }
                    className="w-16 px-2 py-1 text-sm border rounded text-center"
                  />
                  {player.isOverridden && (
                    <button
                      onClick={() => clearPlayerOverride(player.playerId)}
                      className="text-xs text-negative hover:text-negative"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
