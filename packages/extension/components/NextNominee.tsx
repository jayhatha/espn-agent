import React from "react";

interface NomineeData {
  playerName: string;
  reason: string;
  expectedDrain: number;
}

interface NextNomineeProps {
  nominee: NomineeData | null;
  isNominating: boolean;
}

type StrategyTag = "Overpriced" | "Budget Drain" | "Own Target";

function deriveStrategyTag(reason: string): StrategyTag {
  const lower = reason.toLowerCase();
  if (lower.includes("overpriced")) return "Overpriced";
  if (lower.includes("don't need") || lower.includes("budget drain"))
    return "Budget Drain";
  return "Own Target";
}

const STRATEGY_TAG_STYLES: Record<StrategyTag, string> = {
  Overpriced: "bg-grafana-negative/20 text-grafana-negative",
  "Budget Drain": "bg-grafana-warning/20 text-grafana-warning",
  "Own Target": "bg-grafana-positive/20 text-grafana-positive",
};

export default function NextNominee({
  nominee,
  isNominating,
}: NextNomineeProps) {
  if (!nominee) return null;

  const tag = deriveStrategyTag(nominee.reason);

  return (
    <div className="px-3 py-2 bg-grafana-panel border-b border-grafana-border">
      {isNominating ? (
        <div className="flex items-center gap-2">
          <span className="text-body-xs text-grafana-muted uppercase tracking-wide animate-pulse">
            Nominating...
          </span>
          <span className="text-body-sm font-semibold text-grafana-text">
            {nominee.playerName}
          </span>
        </div>
      ) : (
        <div>
          <div className="text-body-xs text-grafana-muted uppercase tracking-wide mb-1">
            Next Nominee
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-body-sm font-semibold text-grafana-text truncate">
              {nominee.playerName}
            </span>
            <span
              className={`text-label font-semibold px-2 py-0.5 rounded whitespace-nowrap ${STRATEGY_TAG_STYLES[tag]}`}
            >
              {tag}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
