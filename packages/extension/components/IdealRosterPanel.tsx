import React from "react";
import type { IdealRosterSignal } from "../lib/engine/types";

interface IdealRosterPanelProps {
  idealRoster: IdealRosterSignal | null;
}

function buildTierSummary(
  anchorCount: number,
  coreCount: number,
  valueCount: number
): string {
  const parts: string[] = [];
  if (anchorCount > 0) parts.push(`${anchorCount} anchor${anchorCount !== 1 ? "s" : ""}`);
  if (coreCount > 0) parts.push(`${coreCount} core`);
  if (valueCount > 0) parts.push(`${valueCount} value`);
  return parts.join(" + ");
}

export default function IdealRosterPanel({ idealRoster }: IdealRosterPanelProps) {
  if (!idealRoster || idealRoster.players.length === 0) {
    return null;
  }

  const { players, totalSGPValue, budgetUsed, unfilledSlots, anchorCount, coreCount, valueCount } =
    idealRoster;

  const tierSummary = buildTierSummary(anchorCount, coreCount, valueCount);

  return (
    <details className="group">
      <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none border-t border-surface-tertiary">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-body-sm font-semibold text-content flex-shrink-0">Ideal Roster</span>
          {tierSummary && (
            <span className="text-body-xs text-content-secondary truncate">{tierSummary}</span>
          )}
        </div>
        <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform flex-shrink-0">&#9662;</span>
      </summary>
      <div className="px-3 pb-3 pt-2 bg-surface">
        <div className="space-y-1">
          {players.map((player, i) => {
            const tierBadgeClass =
              player.tier === "anchor"
                ? "bg-warning-light text-warning"
                : player.tier === "core"
                ? "bg-info-light text-info"
                : "bg-surface-tertiary text-content-secondary";

            return (
              <div
                key={`${player.name}-${i}`}
                className="flex items-center justify-between text-body-xs gap-2"
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span
                    className={`text-body-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${tierBadgeClass}`}
                  >
                    {player.tier}
                  </span>
                  <span className="truncate font-semibold text-content">
                    {player.name}
                  </span>
                </div>
                <span className="text-content-secondary flex-shrink-0">${Math.round(player.dollars)}</span>
              </div>
            );
          })}
        </div>

        {/* Unfilled slots notice */}
        {unfilledSlots > 0 && (
          <div className="text-body-xs text-content-secondary mt-2 border-t border-surface-tertiary pt-2">
            {unfilledSlots} slot{unfilledSlots !== 1 ? "s" : ""} unfilled
          </div>
        )}

        {/* Total SGP + budget summary */}
        <div className="text-body-xs text-content-secondary mt-2 border-t border-surface-tertiary pt-2">
          {totalSGPValue.toFixed(1)} projected SGP &middot; ${Math.round(budgetUsed)} budget used
        </div>
      </div>
    </details>
  );
}
