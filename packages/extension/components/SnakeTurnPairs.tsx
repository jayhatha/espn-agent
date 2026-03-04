import React, { useMemo } from "react";
import { useDraftStore } from "../lib/draft-state";
import { getSnakeTurnPairs } from "../lib/value-calculations";

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr)\.?\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function formatNumber(value: unknown, digits: number): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return "0.0";
  }

  return numericValue.toFixed(digits);
}

export default function SnakeTurnPairs() {
  const { rankings, myRoster, allPicks, totalTeams, currentPick } =
    useDraftStore();

  // Determine if user is at the turn
  const isAtTurn = useMemo(() => {
    // In snake draft, turn picks are at positions totalTeams and totalTeams+1
    // Example: 12-team draft, turn at picks 12-13, 24-25, 36-37, etc.
    const pickMod = currentPick % (totalTeams * 2);
    return (
      pickMod === totalTeams || pickMod === totalTeams + 1 || pickMod === 0
    );
  }, [currentPick, totalTeams]);

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

  // Calculate pair recommendations
  const pairs = useMemo(() => {
    if (!isAtTurn || availablePlayers.length < 2) return [];

    // Simplified: pass empty categories array (full implementation would fetch from league settings)
    return getSnakeTurnPairs(availablePlayers, myRoster, []);
  }, [isAtTurn, availablePlayers, myRoster]);

  if (!isAtTurn) {
    return null; // Only show at turn
  }

  return (
    <div className="p-3 bg-warning-light border-b border-warning-border">
      <h3 className="font-semibold text-sm mb-2 text-warning">
        Turn Pair Recommendations
      </h3>
      <p className="text-xs text-warning mb-3">
        You have back-to-back picks. Consider these pairs:
      </p>

      <div className="space-y-2">
        {pairs.slice(0, 3).map((pair, index) => (
          <div
            key={index}
            className="bg-surface p-2 rounded border border-warning-border"
          >
            <div className="flex justify-between items-start mb-1">
              <div className="text-sm font-medium text-content">
                {pair.player1.playerName} + {pair.player2.playerName}
              </div>
              <div className="text-xs text-content-tertiary">
                {formatNumber(pair.combinedValue, 1)} VBD
              </div>
            </div>
            <div className="text-xs text-content-secondary">{pair.rationale}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
