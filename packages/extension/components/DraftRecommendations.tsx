import React, { useMemo } from "react";
import { useDraftStore } from "../lib/draft-state";
import PlayerCard from "./PlayerCard";

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

const TRACKED_CATEGORY_STATS = [
  "R",
  "HR",
  "RBI",
  "SB",
  "W",
  "SV",
  "K",
] as const;

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr)\.?\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function normalizePosition(pos: string): string | null {
  const upper = pos.toUpperCase();
  if (upper.includes("SP")) return "SP";
  if (upper.includes("RP")) return "RP";
  if (upper === "P") return "SP";
  if (upper.includes("OF")) return "OF";

  return POSITION_TARGETS[upper] ? upper : null;
}

export default function DraftRecommendations() {
  const {
    rankings,
    selectedPosition,
    showOnlyNeeds,
    setPositionFilter,
    toggleNeedsFilter,
    myRoster,
    allPicks,
  } = useDraftStore();

  // Filter out already-drafted players
  const draftedPlayerIds = new Set(allPicks.map((p) => p.playerId));
  const draftedPlayerNames = new Set(
    allPicks.map((p) => normalizePlayerName(p.playerName)),
  );
  const availablePlayers = useMemo(() => {
    return rankings.filter((player) => {
      if (draftedPlayerIds.has(player.playerId)) {
        return false;
      }

      return !draftedPlayerNames.has(normalizePlayerName(player.playerName));
    });
  }, [rankings, allPicks]);

  const positionNeedMap = useMemo(() => {
    const counts: Record<string, number> = Object.keys(POSITION_TARGETS).reduce(
      (acc, key) => ({ ...acc, [key]: 0 }),
      {},
    );

    myRoster.forEach((player) => {
      const normalizedPositions = player.positions
        .map((pos) => normalizePosition(pos))
        .filter((pos): pos is string => Boolean(pos));

      const primary = normalizedPositions[0];
      if (primary) {
        counts[primary] = (counts[primary] || 0) + 1;
      }
    });

    return Object.entries(POSITION_TARGETS).reduce<Record<string, number>>(
      (acc, [pos, target]) => {
        acc[pos] = Math.max(0, target - (counts[pos] || 0));
        return acc;
      },
      {},
    );
  }, [myRoster]);

  const categoryNeedWeights = useMemo(() => {
    const totals = TRACKED_CATEGORY_STATS.reduce<Record<string, number>>(
      (acc, stat) => {
        acc[stat] = myRoster.reduce(
          (sum, player) => sum + Number(player.projectedStats[stat] || 0),
          0,
        );
        return acc;
      },
      {},
    );

    const sorted = Object.entries(totals).sort((a, b) => a[1] - b[1]);
    const weights: Record<string, number> = {};
    sorted.forEach(([stat], index) => {
      if (index === 0) weights[stat] = 1.6;
      else if (index === 1) weights[stat] = 1.35;
      else if (index === 2) weights[stat] = 1.15;
      else weights[stat] = 0.8;
    });
    return weights;
  }, [myRoster]);

  const categoryMaxMap = useMemo(() => {
    return TRACKED_CATEGORY_STATS.reduce<Record<string, number>>(
      (acc, stat) => {
        const max = availablePlayers.reduce(
          (currentMax, player) =>
            Math.max(currentMax, Number(player.projectedStats[stat] || 0)),
          0,
        );
        acc[stat] = max > 0 ? max : 1;
        return acc;
      },
      {},
    );
  }, [availablePlayers]);

  // Apply position filter
  const filteredPlayers = useMemo(() => {
    let players = availablePlayers.map((player) => {
      const normalizedPositions = player.positions
        .map((pos) => normalizePosition(pos))
        .filter((pos): pos is string => Boolean(pos));

      const positionNeedScore = normalizedPositions.reduce(
        (maxScore, pos) => Math.max(maxScore, positionNeedMap[pos] || 0),
        0,
      );

      const categoryNeedScore = TRACKED_CATEGORY_STATS.reduce((sum, stat) => {
        const playerValue = Number(player.projectedStats[stat] || 0);
        const normalizedValue = playerValue / (categoryMaxMap[stat] || 1);
        return sum + normalizedValue * (categoryNeedWeights[stat] || 0);
      }, 0);

      const compositeScore =
        Number(player.vbdScore || 0) +
        positionNeedScore * 4 +
        categoryNeedScore * 6;

      return {
        player,
        positionNeedScore,
        categoryNeedScore,
        compositeScore,
      };
    });

    if (selectedPosition) {
      players = players.filter(({ player }) =>
        player.positions.includes(selectedPosition),
      );
    }

    if (showOnlyNeeds) {
      players = players.filter(
        ({ positionNeedScore, categoryNeedScore }) =>
          positionNeedScore > 0 || categoryNeedScore >= 0.8,
      );
    }

    return players
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .map((entry) => entry.player);
  }, [
    availablePlayers,
    selectedPosition,
    showOnlyNeeds,
    positionNeedMap,
    categoryNeedWeights,
    categoryMaxMap,
  ]);

  const positions = ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP"];

  return (
    <div className="flex flex-col h-full">
      {/* Filter controls */}
      <div className="p-3 bg-surface-secondary border-b border-surface-tertiary space-y-2">
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setPositionFilter(null)}
            className={`
              px-2 py-1 text-xs rounded
              ${!selectedPosition ? "bg-accent text-white" : "bg-surface text-content-secondary border border-surface-tertiary"}
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
                ${selectedPosition === pos ? "bg-accent text-white" : "bg-surface text-content-secondary border border-surface-tertiary"}
              `}
            >
              {pos}
            </button>
          ))}
        </div>

        <label className="flex items-center text-body-sm text-content-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyNeeds}
            onChange={toggleNeedsFilter}
            className="mr-2"
          />
          Show need-aware picks (position + categories)
        </label>
      </div>

      {/* Player list */}
      <div className="flex-1 overflow-y-auto divide-y divide-surface-tertiary">
        {filteredPlayers.length === 0 ? (
          <div className="p-4 text-center text-content-tertiary">
            {rankings.length === 0
              ? "Loading rankings..."
              : "No players match filters"}
          </div>
        ) : (
          filteredPlayers
            .slice(0, 50)
            .map((player, index) => (
              <PlayerCard
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
