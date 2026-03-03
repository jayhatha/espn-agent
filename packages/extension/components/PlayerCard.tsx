import React, { useMemo } from "react";
import type { DraftRanking } from "@espn-fantasy/shared";
import {
  calculateAVG,
  calculateERA,
  calculateWHIP,
  calculateOPS,
} from "@espn-fantasy/shared";
import { useDraftStore } from "../lib/draft-state";
import {
  calculateSnakeDraftValue,
  getValueColorClasses,
} from "../lib/value-detection";

interface PlayerCardProps {
  player: DraftRanking;
  rank: number;
  isAtTurn?: boolean;
}

function formatNumber(value: unknown, digits: number): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return "0.0";
  }

  return numericValue.toFixed(digits);
}

export default function PlayerCard({
  player,
  rank,
  isAtTurn,
}: PlayerCardProps) {
  const { currentPick, myTeamId, totalTeams, allPicks, draftFormat } =
    useDraftStore();

  // Calculate value indicator
  const valueIndicator = useMemo(() => {
    return calculateSnakeDraftValue(player, rank, player.adp ?? null);
  }, [player, rank]);

  const colorClasses = useMemo(() => {
    return getValueColorClasses(valueIndicator.color);
  }, [valueIndicator.color]);

  // Calculate picks until user's next turn
  const picksUntilMyTurn = useMemo(() => {
    if (!myTeamId || draftFormat !== "snake") return null;

    // Find user's last pick number
    const myPicks = allPicks.filter((p) => p.teamId === myTeamId);
    if (myPicks.length === 0) {
      // No picks yet - calculate based on draft position
      // This is simplified - would need actual draft position from draft board
      return null;
    }

    const lastPickNumber = Math.max(...myPicks.map((p) => p.pickNumber));

    // Calculate which round we're in
    const currentRound = Math.floor((currentPick - 1) / totalTeams) + 1;
    const lastPickRound = Math.floor((lastPickNumber - 1) / totalTeams) + 1;

    if (currentRound === lastPickRound) {
      // Same round - already picked
      return null;
    }

    // In snake draft, even rounds reverse order
    const isEvenRound = currentRound % 2 === 0;
    const positionInLastRound = ((lastPickNumber - 1) % totalTeams) + 1;

    // Estimate picks until next turn (simplified - doesn't account for all snake complexity)
    const picksRemaining = totalTeams * currentRound - currentPick;
    const estimatedPicksUntil = Math.max(0, Math.min(picksRemaining, totalTeams));

    return estimatedPicksUntil > 0 ? estimatedPicksUntil : null;
  }, [currentPick, myTeamId, totalTeams, allPicks, draftFormat]);

  return (
    <div
      className={`
        p-3 hover:bg-accent-light cursor-pointer transition-colors
        ${isAtTurn ? "bg-warning-light border-l-2 border-warning" : ""}
      `}
    >
      {/* Player name and positions */}
      <div className="flex justify-between items-start mb-1">
        <div className="flex-1">
          <div className="font-semibold text-content">{player.playerName}</div>
          <div className="text-caption text-content-tertiary">
            {player.positions.join(", ")} • Tier {player.tier}
            {player.adp && (
              <span className="ml-2 text-content-secondary">
                ADP: {formatNumber(player.adp, 1)}
              </span>
            )}
          </div>

          {/* Value indicator badge */}
          {valueIndicator.severity !== "fair" && (
            <span
              className={`inline-block mt-1 text-xs px-2 py-1 rounded border ${colorClasses.bg} ${colorClasses.text} ${colorClasses.border}`}
              title={`VBD rank ${rank} vs ADP ${player.adp ?? "N/A"}`}
            >
              {valueIndicator.label}
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-content">#{rank}</div>
          <div className="text-caption text-content-tertiary">
            VBD: {formatNumber(player.vbdScore, 1)}
          </div>
        </div>
      </div>

      {/* Picks until turn indicator */}
      {picksUntilMyTurn !== null && picksUntilMyTurn <= 5 && (
        <div className="mt-1 text-xs bg-warning-light text-warning px-2 py-1 rounded inline-block">
          {picksUntilMyTurn} pick{picksUntilMyTurn !== 1 ? "s" : ""} until your
          turn
        </div>
      )}

      {/* Projected stats (abbreviated) */}
      <div className="text-data text-content-secondary mt-2 flex gap-3">
        {/* Counting stats - read directly */}
        {player.projectedStats.HR && (
          <span>HR: {player.projectedStats.HR}</span>
        )}
        {player.projectedStats.RBI && (
          <span>RBI: {player.projectedStats.RBI}</span>
        )}
        {player.projectedStats.SB && (
          <span>SB: {player.projectedStats.SB}</span>
        )}
        {player.projectedStats.W && <span>W: {player.projectedStats.W}</span>}
        {player.projectedStats.SV && (
          <span>SV: {player.projectedStats.SV}</span>
        )}

        {/* Rate stats - calculated from components */}
        {player.projectedStats.AB > 0 && (
          <>
            <span>
              AVG: {formatNumber(calculateAVG(player.projectedStats), 3)}
            </span>
            <span>
              OPS: {formatNumber(calculateOPS(player.projectedStats), 3)}
            </span>
          </>
        )}
        {player.projectedStats.IP > 0 && (
          <>
            <span>
              ERA: {formatNumber(calculateERA(player.projectedStats), 2)}
            </span>
            <span>
              WHIP: {formatNumber(calculateWHIP(player.projectedStats), 2)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
