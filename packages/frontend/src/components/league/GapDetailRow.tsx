"use client";

import { interpolateRotoPoints } from "@espn-fantasy/shared";
import {
  formatStatValue,
  getRankColor,
} from "@/components/league/CategoryStatsTable";
import { cn } from "@/lib/cn";

interface GapDetailRowProps {
  categoryId: string;
  categoryName: string;
  myTeamId: number;
  allTeamValues: Array<{ teamId: number; teamName: string; value: number }>;
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
  numTeams: number;
  statType: string;
  statKey: string;
  isExpanded: boolean;
  colSpan: number;
}

export function GapDetailRow({
  categoryName,
  myTeamId,
  allTeamValues,
  direction,
  numTeams,
  statType,
  statKey,
  isExpanded,
  colSpan,
}: GapDetailRowProps) {
  if (!isExpanded || allTeamValues.length === 0) return null;

  const ranked = interpolateRotoPoints(allTeamValues, direction);
  const myIndex = ranked.findIndex((r) => r.teamId === myTeamId);
  if (myIndex === -1) return null;

  const myRanked = ranked[myIndex];
  const myValue = allTeamValues.find((v) => v.teamId === myTeamId)?.value ?? 0;

  const teamAbove = myIndex > 0 ? ranked[myIndex - 1] : null;
  const teamBelow = myIndex < ranked.length - 1 ? ranked[myIndex + 1] : null;

  const getValueForTeam = (teamId: number) =>
    allTeamValues.find((v) => v.teamId === teamId)?.value ?? 0;

  const formatGap = (gap: number) => {
    const formatted = formatStatValue(Math.abs(gap), statType, statKey);
    return gap > 0 ? `+${formatted}` : `-${formatted}`;
  };

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="border-l-2 border-accent bg-surface-secondary dark:bg-shell-bg px-4 py-2.5">
          <div className="text-[11px] font-medium text-content-secondary mb-1.5 uppercase tracking-wider">
            {categoryName} Gap Detail
          </div>
          <div className="space-y-1">
            {/* Team above */}
            {teamAbove && (
              <div className="flex items-center gap-3 text-body-sm">
                <span
                  className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                    getRankColor(teamAbove.rank, numTeams),
                  )}
                >
                  #{teamAbove.rank}
                </span>
                <span className="text-content-secondary truncate max-w-[140px]">
                  {teamAbove.teamName}
                </span>
                <span className="font-mono text-data text-content dark:text-shell-text">
                  {formatStatValue(getValueForTeam(teamAbove.teamId), statType, statKey)}
                </span>
                <span className="text-[10px] text-content-tertiary">
                  gap: {formatStatValue(Math.abs(getValueForTeam(teamAbove.teamId) - myValue), statType, statKey)}
                </span>
              </div>
            )}

            {/* My team */}
            <div className="flex items-center gap-3 text-body-sm font-medium">
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                  getRankColor(myRanked.rank, numTeams),
                )}
              >
                #{myRanked.rank}
              </span>
              <span className="text-accent truncate max-w-[140px]">
                {myRanked.teamName}
              </span>
              <span className="font-mono text-data text-accent">
                {formatStatValue(myValue, statType, statKey)}
              </span>
              {teamAbove === null && (
                <span className="text-[10px] text-positive">Best in league</span>
              )}
            </div>

            {/* Team below */}
            {teamBelow && (
              <div className="flex items-center gap-3 text-body-sm">
                <span
                  className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                    getRankColor(teamBelow.rank, numTeams),
                  )}
                >
                  #{teamBelow.rank}
                </span>
                <span className="text-content-secondary truncate max-w-[140px]">
                  {teamBelow.teamName}
                </span>
                <span className="font-mono text-data text-content dark:text-shell-text">
                  {formatStatValue(getValueForTeam(teamBelow.teamId), statType, statKey)}
                </span>
                <span className="text-[10px] text-positive">
                  lead: {formatStatValue(Math.abs(myValue - getValueForTeam(teamBelow.teamId)), statType, statKey)}
                </span>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
