"use client";

import { CheckCircleIcon, AlertTriangleIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { ScarcityBadge, getScarcityLevel } from "./ScarcityBadge";
import {
  formatStatValue,
  getRankColor,
} from "./CategoryStatsTable";

interface TeamOverviewCategory {
  category_id: string;
  name: string;
  stat_key: string;
  type: string;
  direction: string;
  value: number;
  rank: number;
  roto_points: number;
}

interface TeamHealthOverviewProps {
  categories: TeamOverviewCategory[];
  totalTeams: number;
}

export function TeamHealthOverview({
  categories,
  totalTeams,
}: TeamHealthOverviewProps) {
  // Sort categories by rank (ascending) to identify strengths (lowest rank = best)
  const sortedByRank = [...categories].sort((a, b) => a.rank - b.rank);

  // Top 3 strengths (lowest ranks)
  const strengths = sortedByRank.slice(0, 3);

  // Bottom 3 weaknesses (highest ranks)
  const weaknesses = sortedByRank.slice(-3).reverse();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Strengths */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircleIcon className="h-5 w-5 text-positive" />
          <h3 className="text-h4 font-semibold text-content dark:text-shell-text">Top Strengths</h3>
        </div>

        {strengths.length > 0 ? (
          <div className="divide-y divide-neutral-100 dark:divide-shell-border">
            {strengths.map((cat) => (
              <div
                key={cat.category_id}
                className="py-3 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-body font-medium text-content dark:text-shell-text">
                      {cat.name}
                    </span>
                    <ScarcityBadge
                      level={getScarcityLevel(cat.rank, totalTeams)}
                    />
                  </div>
                  <span className="text-body-sm text-content-secondary dark:text-shell-muted">
                    {formatStatValue(cat.value, cat.type, cat.stat_key)}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-data font-medium px-2 py-0.5 rounded",
                    getRankColor(cat.rank, totalTeams)
                  )}
                >
                  #{cat.rank}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-body-sm text-content-secondary dark:text-shell-muted italic">
            No top-tier categories yet
          </p>
        )}
      </div>

      {/* Weaknesses */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangleIcon className="h-5 w-5 text-negative" />
          <h3 className="text-h4 font-semibold text-content dark:text-shell-text">Areas for Improvement</h3>
        </div>

        {weaknesses.length > 0 ? (
          <div className="divide-y divide-neutral-100 dark:divide-shell-border">
            {weaknesses.map((cat) => (
              <div
                key={cat.category_id}
                className="py-3 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-body font-medium text-content dark:text-shell-text">
                      {cat.name}
                    </span>
                    <ScarcityBadge
                      level={getScarcityLevel(cat.rank, totalTeams)}
                    />
                  </div>
                  <span className="text-body-sm text-content-secondary dark:text-shell-muted">
                    {formatStatValue(cat.value, cat.type, cat.stat_key)}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-data font-medium px-2 py-0.5 rounded",
                    getRankColor(cat.rank, totalTeams)
                  )}
                >
                  #{cat.rank}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-body-sm text-content-secondary dark:text-shell-muted italic">
            All categories competitive
          </p>
        )}
      </div>
    </div>
  );
}
