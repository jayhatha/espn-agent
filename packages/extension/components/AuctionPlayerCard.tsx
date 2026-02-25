import React from "react";
import type { AuctionValue } from "@espn-fantasy/shared";
import { useDraftStore } from "../lib/draft-state";
import { calculateBudgetPacing } from "../lib/value-calculations";
import {
  calculateAuctionValue,
  getValueColorClasses,
} from "../lib/value-detection";

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

interface AuctionPlayerCardProps {
  player: AuctionValue;
  rank: number;
  actualPrice?: number; // Actual draft price (if drafted)
}

type AuctionValueWithOptionalVbd = AuctionValue & {
  vbdScore?: number;
};

export default function AuctionPlayerCard({
  player,
  rank,
  actualPrice,
}: AuctionPlayerCardProps) {
  const auctionPlayer = player as AuctionValueWithOptionalVbd;
  const { myRoster, rosterSize, rankings } = useDraftStore();

  // Calculate value indicator
  const valueIndicator = calculateAuctionValue(player, actualPrice ?? null);
  const colorClasses = getValueColorClasses(valueIndicator.color);

  // Calculate if player is affordable
  const pacing = calculateBudgetPacing(260, myRoster, rosterSize);
  const isAffordable = player.dollarValue <= pacing.recommendedMaxBid;
  const isValuePick = player.dollarValue <= pacing.averageRemainingPerPlayer;

  // Find player's projected stats from rankings
  const normalizedPlayerName = normalizePlayerName(player.playerName);
  const playerRanking = rankings.find((ranking) => {
    if (ranking.playerId === player.playerId) {
      return true;
    }

    return normalizePlayerName(ranking.playerName) === normalizedPlayerName;
  });
  const projectedStats = playerRanking?.projectedStats || {};

  return (
    <div className="p-3 border-b hover:bg-blue-50 cursor-pointer transition-colors border-gray-200">
      {/* Player name and positions */}
      <div className="flex justify-between items-start mb-1">
        <div className="flex-1">
          <div className="font-semibold text-gray-900">{player.playerName}</div>
          <div className="text-xs text-gray-500">
            {player.positions.join(", ")}
            {playerRanking?.adp && (
              <span className="ml-2 text-blue-600">
                ADP: {formatNumber(playerRanking.adp, 1)}
              </span>
            )}
          </div>

          {/* Value indicators */}
          <div className="flex gap-2 mt-2">
            {/* Value detection badge - only show for non-fair values */}
            {valueIndicator.severity !== "fair" && (
              <span
                className={`text-xs px-2 py-1 rounded border ${colorClasses.bg} ${colorClasses.text} ${colorClasses.border}`}
                title={`VBD $${player.dollarValue} vs actual ${actualPrice ? `$${actualPrice}` : "not drafted"}`}
              >
                {valueIndicator.label}
              </span>
            )}

            {/* Budget pacing indicators */}
            {!actualPrice && isValuePick && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                ⭐ Value
              </span>
            )}
            {!actualPrice && !isAffordable && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                Over budget
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-green-600">
            ${player.dollarValue}
          </div>
          <div className="text-xs text-gray-500">
            VBD: {formatNumber(auctionPlayer.vbdScore, 1)}
          </div>
        </div>
      </div>

      {/* Projected stats (abbreviated) */}
      <div className="text-xs text-gray-600 mt-2 flex gap-3">
        {projectedStats.HR && <span>HR: {projectedStats.HR}</span>}
        {projectedStats.RBI && <span>RBI: {projectedStats.RBI}</span>}
        {projectedStats.SB && <span>SB: {projectedStats.SB}</span>}
        {projectedStats.W && <span>W: {projectedStats.W}</span>}
        {projectedStats.SV && <span>SV: {projectedStats.SV}</span>}
      </div>
    </div>
  );
}
