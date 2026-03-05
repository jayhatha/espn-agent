import React from "react";
import type { BuildArchetypeSignal } from "../lib/engine/types";

interface BuildArchetypePanelProps {
  signal: BuildArchetypeSignal | null;
}

const RATE_STAT_KEYS = new Set(["AVG", "OBP", "SLG", "OPS", "ERA", "WHIP", "K9", "BB9"]);

function formatStatValue(stat_key: string, value: number): string {
  if (RATE_STAT_KEYS.has(stat_key.toUpperCase())) {
    return value.toFixed(3);
  }
  return Math.round(value).toString();
}

export default function BuildArchetypePanel({ signal }: BuildArchetypePanelProps) {
  if (!signal || signal.picksAnalyzed === 0) {
    return null;
  }

  const { archetypeLabel, archetypeConfidence, ceilings, pivotPlayers, spendingSplit } = signal;

  const showArchetype = archetypeConfidence >= 0.5 && archetypeLabel !== null;
  const showBuilding = !showArchetype && signal.picksAnalyzed > 0;

  return (
    <details className="group">
      <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none border-t border-surface-tertiary">
        <div className="flex items-center gap-2">
          <span className="text-body-sm font-semibold text-content">Build Analysis</span>
          {showArchetype && (
            <span className="text-body-xs font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent">
              {archetypeLabel}
            </span>
          )}
          {showBuilding && (
            <span className="text-body-xs text-content-secondary italic">Building...</span>
          )}
        </div>
        <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">
          ▾
        </span>
      </summary>

      <div className="px-3 pb-3 pt-2 bg-surface space-y-2">
        {/* Category ceiling bars */}
        <div className="space-y-1.5">
          {ceilings.map((ceiling) => {
            const { stat_key, currentTotal, ceilingTotal, competitiveTarget, isPunted, direction } =
              ceiling;

            const isLowerBetter = direction === "LOWER_BETTER";

            // For LOWER_BETTER: smaller value = better. Invert the fill logic.
            // currentFill: how much of the competitive target we've already committed (as fraction)
            // ceilingFill: how much ceiling we can reach (as fraction)
            // "full bar = at or better than competitive target"
            let currentFill: number;
            let ceilingFill: number;

            if (isLowerBetter) {
              // For ERA/WHIP: lower is better. If currentTotal = 3.50 and target = 3.80,
              // we're ahead. Fill from right to represent "closeness to target from below".
              // Normalize: fill = target / current (capped at 1.0). If current < target, fill > 1 → cap at 1.
              currentFill = competitiveTarget > 0 ? Math.min(1, competitiveTarget / Math.max(currentTotal, 0.001)) : 0;
              ceilingFill = competitiveTarget > 0 ? Math.min(1, competitiveTarget / Math.max(ceilingTotal, 0.001)) : 0;
            } else {
              currentFill = competitiveTarget > 0 ? Math.min(1, currentTotal / competitiveTarget) : 0;
              ceilingFill = competitiveTarget > 0 ? Math.min(1, ceilingTotal / competitiveTarget) : 0;
            }

            const currentPct = Math.round(currentFill * 100);
            const ceilingPct = Math.round(ceilingFill * 100);
            const extensionPct = Math.max(0, ceilingPct - currentPct);

            // Bar color based on ceiling vs target
            const barColorClass = isPunted
              ? "bg-surface-tertiary"
              : ceilingFill >= 0.85
              ? "bg-positive/60"
              : ceilingFill >= 0.6
              ? "bg-warning/60"
              : "bg-surface-tertiary";

            const extensionColorClass = isPunted
              ? "bg-surface-tertiary/50"
              : ceilingFill >= 0.85
              ? "bg-positive/30"
              : ceilingFill >= 0.6
              ? "bg-warning/30"
              : "bg-surface-tertiary/50";

            return (
              <div key={stat_key} className="flex items-center gap-2">
                {/* Stat key label — 10 char width, punted = muted */}
                <div
                  className={`w-10 text-body-xs font-semibold truncate shrink-0 ${
                    isPunted ? "text-content-secondary" : "text-content"
                  }`}
                  title={isPunted ? `${stat_key} (punted)` : stat_key}
                >
                  {isPunted ? (
                    <span>
                      <span className="text-content-secondary/50 mr-0.5">&#8960;</span>
                      {stat_key}
                    </span>
                  ) : (
                    stat_key
                  )}
                </div>

                {/* Bar */}
                <div className="flex-1 relative h-3 bg-surface-tertiary/50 rounded-full overflow-hidden">
                  {/* Solid fill: current drafted total */}
                  {currentPct > 0 && (
                    <div
                      className={`absolute top-0 bottom-0 left-0 ${barColorClass} rounded-full`}
                      style={{ width: `${currentPct}%` }}
                    />
                  )}
                  {/* Semi-transparent extension: ceiling potential above current */}
                  {extensionPct > 0 && (
                    <div
                      className={`absolute top-0 bottom-0 ${extensionColorClass} rounded-full`}
                      style={{
                        left: `${currentPct}%`,
                        width: `${extensionPct}%`,
                      }}
                    />
                  )}
                  {/* Vertical marker at 100% = competitive target line */}
                  <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-content-secondary/40" />
                </div>

                {/* Numeric display: ceiling / target */}
                <div className="text-body-xs text-content-secondary w-16 text-right shrink-0 font-mono">
                  {formatStatValue(stat_key, ceilingTotal)}/
                  {formatStatValue(stat_key, competitiveTarget)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Spending split */}
        <div className="text-body-xs text-content-secondary pt-1">
          Hitting: ${Math.round(spendingSplit.hitting)} / Pitching: ${Math.round(spendingSplit.pitching)}
        </div>

        {/* Pivot players section */}
        {pivotPlayers.length > 0 && (
          <div className="border-t border-surface-tertiary pt-2 space-y-1">
            <div className="text-body-xs font-semibold text-content">Pivot Players</div>
            {pivotPlayers.slice(0, 3).map((player) => (
              <div
                key={player.playerId}
                className="flex items-center justify-between text-body-xs"
              >
                <span className="text-content truncate mr-2">{player.playerName}</span>
                <span className="text-content-secondary shrink-0">
                  ${player.dollarValue} &rarr; +{formatStatValue(player.category, player.ceilingLift)}{" "}
                  <span className="text-accent">{player.category}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
