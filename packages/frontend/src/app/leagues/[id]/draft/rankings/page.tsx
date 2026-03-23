"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { ClipboardList } from "lucide-react";

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

const getTierVariant = (tier: number): "default" | "positive" | "warning" | "info" => {
  switch (tier) {
    case 1:
      return "positive";
    case 2:
      return "info";
    case 3:
      return "warning";
    default:
      return "default";
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
    <Container size="wide" className="py-8">
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
            className="text-body-sm font-medium text-content"
          >
            Position:
          </label>
          <select
            id="position-filter"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="border border-neutral-300 dark:border-shell-border rounded-lg px-3 py-2 text-body-sm text-content dark:text-shell-text bg-white dark:bg-shell-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
          className="inline-flex items-center px-4 py-2 border border-neutral-300 dark:border-shell-border rounded-lg text-body-sm font-medium text-content dark:text-shell-text bg-white dark:bg-shell-bg hover:bg-surface-secondary dark:hover:bg-shell-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
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
          <ClipboardList className="mx-auto h-12 w-12 text-content-tertiary" />
          <h3 className="mt-2 text-body-sm font-medium text-content">
            No rankings available
          </h3>
          <p className="mt-1 text-body-sm text-content-secondary">
            Upload projections first to generate draft rankings.
          </p>
        </div>
      )}

      {/* Rankings Table */}
      {!isLoading && !error && data && data.rankings.length > 0 && (
        <div className="rounded-card border border-neutral-200 dark:border-shell-border bg-white dark:bg-shell-panel shadow-card dark:shadow-none overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-100 dark:divide-shell-border">
              <thead className="bg-surface-secondary dark:bg-shell-bg sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Player
                  </th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    VBD
                  </th>
                  <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    SGP
                  </th>
                  <th className="px-4 py-3 text-center text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Tier
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-shell-panel divide-y divide-neutral-100 dark:divide-shell-border">
                {data.rankings.map((ranking, index) => (
                  <tr
                    key={ranking.playerId}
                    className="border-b border-neutral-100 dark:border-shell-border hover:bg-surface-secondary dark:hover:bg-shell-bg transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-data font-medium text-content">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-body-sm font-medium text-content">
                        {ranking.playerName}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-body-sm text-content-secondary">
                      {ranking.positions.join("/")}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-data font-medium text-content text-right">
                      {ranking.vbdScore.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-data text-content-secondary text-right">
                      {ranking.sgpTotal.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <Badge variant={getTierVariant(ranking.tier)}>
                        {getTierLabel(ranking.tier)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Meta Info */}
          <div className="bg-surface-secondary dark:bg-shell-bg px-4 py-3 border-t border-neutral-100 dark:border-shell-border">
            <p className="text-body-sm text-content-secondary">
              Showing {data.rankings.length} player
              {data.rankings.length !== 1 ? "s" : ""} for{" "}
              {data.meta.totalTeams}-team league
            </p>
          </div>
        </div>
      )}
    </Container>
  );
}
