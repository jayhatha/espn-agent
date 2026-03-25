"use client";

import type { MarginalGain } from "@espn-fantasy/shared";
import { formatStatValue } from "@/components/league/CategoryStatsTable";
import { Term } from "@/components/ui/Term";
import { cn } from "@/lib/cn";

interface CategoryOpportunityMapProps {
  marginalGains: MarginalGain[];
  className?: string;
}

const difficultyConfig = {
  easy: {
    label: "Easy",
    className: "text-positive bg-positive/10",
  },
  medium: {
    label: "Medium",
    className: "text-warning bg-warning/10",
  },
  hard: {
    label: "Hard",
    className: "text-negative bg-negative/10",
  },
  elite: {
    label: "Elite",
    className: "text-shell-accent bg-shell-accent/10",
  },
} as const;

export function CategoryOpportunityMap({
  marginalGains,
  className,
}: CategoryOpportunityMapProps) {
  if (marginalGains.length === 0) return null;

  return (
    <div className={cn("", className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
          <thead className="bg-surface-secondary dark:bg-shell-bg">
            <tr>
              <th className="px-3 py-2.5 text-left text-data font-medium text-content-secondary uppercase tracking-wider">
                <Term id="category-opportunity">Category</Term>
              </th>
              <th className="px-3 py-2.5 text-center text-data font-medium text-content-secondary uppercase tracking-wider">
                Rank
              </th>
              <th className="px-3 py-2.5 text-right text-data font-medium text-content-secondary uppercase tracking-wider">
                My Value
              </th>
              <th className="px-3 py-2.5 text-right text-data font-medium text-content-secondary uppercase tracking-wider">
                Gap
              </th>
              <th className="px-3 py-2.5 text-left text-data font-medium text-content-secondary uppercase tracking-wider">
                Team Above
              </th>
              <th className="px-3 py-2.5 text-center text-data font-medium text-content-secondary uppercase tracking-wider">
                Difficulty
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-shell-panel divide-y divide-neutral-100 dark:divide-shell-border">
            {marginalGains.map((gain) => {
              const isRateStat = ["ERA", "WHIP", "OPS", "AVG", "OBP", "SLG", "K9", "WPCT"].includes(gain.categoryName);
              const statType = isRateStat ? "RATE" : "COUNTING";
              const diff = difficultyConfig[gain.difficulty];

              return (
                <tr
                  key={gain.categoryId}
                  className="hover:bg-surface-secondary dark:hover:bg-shell-bg transition-colors"
                >
                  <td className="px-3 py-2.5 text-body-sm font-medium text-content dark:text-shell-text whitespace-nowrap">
                    {gain.categoryName}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="font-mono text-data text-content dark:text-shell-text">
                      #{gain.currentRank}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-mono text-data text-content dark:text-shell-text">
                      {formatStatValue(gain.myValue, statType, gain.categoryName)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {gain.teamAbove ? (
                      <span className="font-mono text-data text-content-secondary">
                        {formatStatValue(gain.gap, statType, gain.categoryName)}
                      </span>
                    ) : (
                      <span className="text-data text-positive font-medium">--</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-left">
                    {gain.teamAbove ? (
                      <span className="text-body-sm text-content-secondary truncate max-w-[120px] inline-block">
                        {gain.teamAbove.teamName}
                      </span>
                    ) : (
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide",
                        "text-positive bg-positive/10",
                      )}>
                        Leading
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide",
                        diff.className,
                      )}
                    >
                      {diff.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
