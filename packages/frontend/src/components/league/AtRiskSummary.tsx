"use client";

import type { AtRiskCategory } from "@espn-fantasy/shared";
import { formatStatValue } from "@/components/league/CategoryStatsTable";
import { cn } from "@/lib/cn";

interface AtRiskSummaryProps {
  atRiskCategories: AtRiskCategory[];
  className?: string;
}

const riskConfig = {
  danger: {
    label: "Danger",
    className: "text-negative bg-negative/10",
  },
  watch: {
    label: "Watch",
    className: "text-amber-400 bg-amber-400/10",
  },
  safe: {
    label: "Safe",
    className: "text-positive bg-positive/10",
  },
} as const;

export function AtRiskSummary({
  atRiskCategories,
  className,
}: AtRiskSummaryProps) {
  // Only show danger and watch categories
  const atRisk = atRiskCategories.filter(
    (r) => r.riskLevel === "danger" || r.riskLevel === "watch",
  );

  // Sort danger first, then watch
  atRisk.sort((a, b) => {
    if (a.riskLevel === "danger" && b.riskLevel !== "danger") return -1;
    if (a.riskLevel !== "danger" && b.riskLevel === "danger") return 1;
    return a.gap - b.gap;
  });

  return (
    <div className={cn("", className)}>
      {atRisk.length === 0 ? (
        <div className="flex items-center gap-2 py-3 px-4 rounded-lg bg-positive/5 border border-positive/20">
          <span className="text-positive font-medium text-body-sm">
            No categories at immediate risk
          </span>
          <span className="text-content-tertiary dark:text-shell-muted text-body-sm">
            -- Your leads are comfortable across all categories.
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          {atRisk.map((risk) => {
            const config = riskConfig[risk.riskLevel];
            const isRateStat = ["ERA", "WHIP", "OPS", "AVG", "OBP", "SLG", "K9", "WPCT"].includes(risk.categoryName);
            const statType = isRateStat ? "RATE" : "COUNTING";

            return (
              <div
                key={risk.categoryId}
                className="flex items-center justify-between py-2.5 px-3 rounded bg-surface-secondary dark:bg-shell-bg"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-caption font-semibold uppercase tracking-wide",
                      config.className,
                    )}
                  >
                    {config.label}
                  </span>
                  <span className="font-medium text-body-sm text-content dark:text-shell-text">
                    {risk.categoryName}
                  </span>
                  <span className="text-content-tertiary dark:text-shell-muted text-body-sm font-mono">
                    #{risk.currentRank}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-body-sm">
                  <span className="font-mono text-data text-content-secondary dark:text-shell-muted">
                    {formatStatValue(risk.gap, statType, risk.categoryName)} gap
                  </span>
                  {risk.teamBelow && (
                    <span className="text-content-tertiary dark:text-shell-muted text-caption truncate max-w-[80px] sm:max-w-[120px]">
                      {risk.teamBelow.teamName} closing
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
