"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";

interface DraftRanking {
  playerId: number;
  playerName: string;
  positions: string[];
  primaryPosition: string;
  vbdScore: number;
  sgpTotal: number;
  categorySGPs: Record<string, number>;
  projectedStats: Record<string, number>;
  tier: number;
}

interface DraftRankingsResponse {
  rankings: DraftRanking[];
  meta: {
    leagueId: number;
    leagueName: string;
    totalTeams: number;
    generatedAt: string;
  };
}

const POSITIONS = ["ALL", "C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "DH"];

const getTierColor = (tier: number): string => {
  switch (tier) {
    case 1:
      return "bg-green-100 text-green-800";
    case 2:
      return "bg-blue-100 text-blue-800";
    case 3:
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const getTierLabel = (tier: number): string => {
  switch (tier) {
    case 1:
      return "T1";
    case 2:
      return "T2";
    case 3:
      return "T3";
    default:
      return "T4";
  }
};

export default function DraftRankingsPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [position, setPosition] = useState<string>("ALL");

  const { data, isLoading, error, refetch } = useQuery<DraftRankingsResponse>({
    queryKey: ["draft-rankings", leagueId, position],
    queryFn: async () => {
      const positionParam = position !== "ALL" ? `&position=${position}` : "";
      const response = await api.get(
        `/api/leagues/${leagueId}/draft/rankings?limit=300${positionParam}`,
      );
      return response;
    },
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <PageHeader
        title="Draft Rankings"
        subtitle={
          data?.meta.leagueName
            ? `${data.meta.leagueName} - VBD Rankings`
            : "Value Based Drafting Rankings"
        }
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
      />

      {/* Controls */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <label
            htmlFor="position-filter"
            className="text-sm font-medium text-gray-700"
          >
            Position:
          </label>
          <select
            id="position-filter"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {POSITIONS.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </div>

        <Link
          href={`/leagues/${leagueId}/draft/auction`}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          View Auction Values
        </Link>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {/* Error State */}
      {error && (
        <ErrorAlert
          message={
            error instanceof Error
              ? error.message
              : "Failed to load draft rankings"
          }
          onRetry={() => refetch()}
        />
      )}

      {/* Empty State */}
      {!isLoading && !error && data?.rankings.length === 0 && (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No rankings available
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Upload projections first to generate draft rankings.
          </p>
        </div>
      )}

      {/* Rankings Table */}
      {!isLoading && !error && data && data.rankings.length > 0 && (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Player
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    VBD
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SGP
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tier
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.rankings.map((ranking, index) => (
                  <tr
                    key={ranking.playerId}
                    className="even:bg-gray-50 hover:bg-blue-50"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {ranking.playerName}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {ranking.positions.join("/")}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {ranking.vbdScore.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-right">
                      {ranking.sgpTotal.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTierColor(ranking.tier)}`}
                      >
                        {getTierLabel(ranking.tier)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Meta Info */}
          <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              Showing {data.rankings.length} player
              {data.rankings.length !== 1 ? "s" : ""} for{" "}
              {data.meta.totalTeams}-team league
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
