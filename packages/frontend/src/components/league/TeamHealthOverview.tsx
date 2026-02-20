"use client";

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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Strengths Card */}
      <div className="bg-white shadow rounded-lg p-6 border-t-4 border-green-500">
        <div className="flex items-center gap-2 mb-4">
          <svg
            className="h-5 w-5 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">
            Top Strengths
          </h3>
        </div>

        {strengths.length > 0 ? (
          <div className="space-y-3">
            {strengths.map((cat) => (
              <div
                key={cat.category_id}
                className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">
                      {cat.name}
                    </span>
                    <ScarcityBadge
                      level={getScarcityLevel(cat.rank, totalTeams)}
                    />
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getRankColor(cat.rank, totalTeams)}`}
                    >
                      Rank #{cat.rank}
                    </span>
                    <span className="text-gray-700">
                      {formatStatValue(cat.value, cat.type, cat.stat_key)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">
            No top-tier categories yet
          </p>
        )}
      </div>

      {/* Weaknesses Card */}
      <div className="bg-white shadow rounded-lg p-6 border-t-4 border-red-500">
        <div className="flex items-center gap-2 mb-4">
          <svg
            className="h-5 w-5 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">
            Areas for Improvement
          </h3>
        </div>

        {weaknesses.length > 0 ? (
          <div className="space-y-3">
            {weaknesses.map((cat) => (
              <div
                key={cat.category_id}
                className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">
                      {cat.name}
                    </span>
                    <ScarcityBadge
                      level={getScarcityLevel(cat.rank, totalTeams)}
                    />
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getRankColor(cat.rank, totalTeams)}`}
                    >
                      Rank #{cat.rank}
                    </span>
                    <span className="text-gray-700">
                      {formatStatValue(cat.value, cat.type, cat.stat_key)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">
            No weak categories—great job!
          </p>
        )}
      </div>
    </div>
  );
}
