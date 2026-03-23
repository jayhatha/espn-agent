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
import { cn } from "@/lib/cn";
import { ChevronDown, ChevronRight, BarChart3 } from "lucide-react";

interface ProjectionComparison {
  espn: number;
  fangraphs: number;
  delta: number;
}

interface Comparison {
  playerId: number;
  playerName: string;
  positions: string[];
  espnValue: number;
  espnAdp: number;
  espnAvgAuction: number;
  ourValue: number;
  absoluteDelta: number;
  percentDelta: number;
  ratio: number;
  projectionComparison?: Record<string, ProjectionComparison>;
}

interface ValidationResponse {
  comparisons: Comparison[];
  summary: {
    totalCompared: number;
    playersWithProjectionComparison?: number;
    meanDelta: number;
    medianDelta: number;
    rmse: number;
    correlation: number;
    ourTopPlayer: { name: string; value: number };
    espnTopPlayer: { name: string; value: number };
  };
  meta: {
    leagueId: number;
    totalTeams: number;
    budget: number;
    generatedAt: string;
  };
  warning?: string;
}

const POSITIONS = ["ALL", "C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "DH"];

type SortKey = "absoluteDelta" | "espnValue" | "ourValue" | "playerName";

const getDeltaClass = (delta: number): string => {
  if (delta > 5) return "text-positive font-semibold";
  if (delta > 0) return "text-positive";
  if (delta < -5) return "text-negative font-semibold";
  if (delta < 0) return "text-negative";
  return "text-content-secondary";
};

const getCorrelationClass = (r: number): string => {
  if (r >= 0.8) return "text-positive";
  if (r >= 0.6) return "text-warning";
  return "text-negative";
};

export default function AuctionValidatePage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [position, setPosition] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("absoluteDelta");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const { data, isLoading, error, refetch } = useQuery<ValidationResponse>({
    queryKey: ["draft-auction-validate", leagueId],
    queryFn: async () => {
      const response = await api.get(
        `/api/leagues/${leagueId}/draft/auction/validate?limit=300`,
      );
      return response;
    },
  });

  const toggleRow = (playerId: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  // Filter and sort comparisons
  const filteredComparisons = data?.comparisons
    .filter((c) => position === "ALL" || c.positions.includes(position))
    .sort((a, b) => {
      switch (sortKey) {
        case "absoluteDelta":
          return Math.abs(b.absoluteDelta) - Math.abs(a.absoluteDelta);
        case "espnValue":
          return b.espnValue - a.espnValue;
        case "ourValue":
          return b.ourValue - a.ourValue;
        case "playerName":
          return a.playerName.localeCompare(b.playerName);
        default:
          return 0;
      }
    });

  return (
    <Container size="wide" className="py-8">
      <PageHeader
        title="Auction Validation"
        subtitle="Compare VBD auction values against ESPN"
        backLink={{
          href: `/leagues/${leagueId}/draft/auction`,
          label: "Back to Auction Values",
        }}
      />

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
              : "Failed to load validation data"
          }
          onRetry={() => refetch()}
        />
      )}

      {data && (
        <>
          {/* Warning */}
          {data.warning && (
            <div className="mb-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-body-sm text-warning">
              {data.warning}
            </div>
          )}

          {/* Summary Stats */}
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <SummaryCard
              label="Correlation"
              value={data.summary.correlation.toFixed(3)}
              className={getCorrelationClass(data.summary.correlation)}
            />
            <SummaryCard
              label="RMSE"
              value={`$${data.summary.rmse.toFixed(1)}`}
            />
            <SummaryCard
              label="Mean Delta"
              value={`${data.summary.meanDelta >= 0 ? "+" : ""}$${data.summary.meanDelta.toFixed(1)}`}
              className={getDeltaClass(data.summary.meanDelta)}
            />
            <SummaryCard
              label="Median Delta"
              value={`${data.summary.medianDelta >= 0 ? "+" : ""}$${data.summary.medianDelta.toFixed(1)}`}
              className={getDeltaClass(data.summary.medianDelta)}
            />
            <SummaryCard
              label="Players Compared"
              value={String(data.summary.totalCompared)}
            />
            <SummaryCard
              label="With Projections"
              value={String(data.summary.playersWithProjectionComparison ?? 0)}
            />
          </div>

          {/* Top Players */}
          <div className="mb-6 flex flex-wrap gap-4 text-body-sm text-content-secondary">
            <span>
              <span className="font-medium text-content">ESPN #1:</span>{" "}
              {data.summary.espnTopPlayer.name} ($
              {data.summary.espnTopPlayer.value})
            </span>
            <span>
              <span className="font-medium text-content">Our #1:</span>{" "}
              {data.summary.ourTopPlayer.name} ($
              {data.summary.ourTopPlayer.value})
            </span>
          </div>

          {/* Controls */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex items-center gap-3">
              <label
                htmlFor="position-filter"
                className="text-body-sm font-medium text-content whitespace-nowrap"
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

            <div className="flex items-center gap-3">
              <label
                htmlFor="sort-select"
                className="text-body-sm font-medium text-content whitespace-nowrap"
              >
                Sort by:
              </label>
              <select
                id="sort-select"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="border border-neutral-300 dark:border-shell-border rounded-lg px-3 py-2 text-body-sm text-content dark:text-shell-text bg-white dark:bg-shell-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <option value="absoluteDelta">Largest Discrepancy</option>
                <option value="espnValue">ESPN Value</option>
                <option value="ourValue">Our Value</option>
                <option value="playerName">Name</option>
              </select>
            </div>

            <Link
              href={`/leagues/${leagueId}/draft/auction`}
              className="inline-flex items-center px-4 py-2 border border-neutral-300 dark:border-shell-border rounded-lg text-body-sm font-medium text-content dark:text-shell-text bg-white dark:bg-shell-bg hover:bg-surface-secondary dark:hover:bg-shell-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
            >
              View Auction Values
            </Link>
          </div>

          {/* Comparisons Table */}
          {filteredComparisons && filteredComparisons.length > 0 ? (
            <div className="rounded-card border border-neutral-200 dark:border-shell-border bg-white dark:bg-shell-panel shadow-card dark:shadow-none overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-100 dark:divide-shell-border">
                  <thead className="bg-surface-secondary dark:bg-shell-bg sticky top-0">
                    <tr>
                      <th className="w-8 px-2 py-3" />
                      <th className="px-4 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                        #
                      </th>
                      <th className="px-4 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                        Player
                      </th>
                      <th className="px-4 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                        Pos
                      </th>
                      <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                        ESPN $
                      </th>
                      <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                        Our $
                      </th>
                      <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                        Delta
                      </th>
                      <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                        % Delta
                      </th>
                      <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                        ESPN ADP
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-shell-panel divide-y divide-neutral-100 dark:divide-shell-border">
                    {filteredComparisons.map((comp, index) => {
                      const isExpanded = expandedRows.has(comp.playerId);
                      const hasProjections =
                        comp.projectionComparison &&
                        Object.keys(comp.projectionComparison).length > 0;

                      return (
                        <>
                          <tr
                            key={comp.playerId}
                            className={cn(
                              "hover:bg-surface-secondary dark:hover:bg-shell-bg transition-colors",
                              hasProjections && "cursor-pointer",
                            )}
                            onClick={() =>
                              hasProjections && toggleRow(comp.playerId)
                            }
                          >
                            <td className="w-8 px-2 py-3 text-content-tertiary">
                              {hasProjections &&
                                (isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                ))}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-data font-medium text-content">
                              {index + 1}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-body-sm font-medium text-content">
                                {comp.playerName}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-body-sm text-content-secondary">
                              {comp.positions.join("/")}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-data text-right text-content">
                              ${comp.espnValue}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-data text-right text-content">
                              ${comp.ourValue}
                            </td>
                            <td
                              className={cn(
                                "px-4 py-3 whitespace-nowrap text-data text-right",
                                getDeltaClass(comp.absoluteDelta),
                              )}
                            >
                              {comp.absoluteDelta >= 0 ? "+" : ""}$
                              {comp.absoluteDelta}
                            </td>
                            <td
                              className={cn(
                                "px-4 py-3 whitespace-nowrap text-data text-right",
                                getDeltaClass(comp.percentDelta),
                              )}
                            >
                              {comp.percentDelta >= 0 ? "+" : ""}
                              {comp.percentDelta.toFixed(0)}%
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-data text-right text-content-secondary">
                              {comp.espnAdp > 0
                                ? comp.espnAdp.toFixed(1)
                                : "—"}
                            </td>
                          </tr>

                          {/* Expanded projection comparison */}
                          {isExpanded &&
                            hasProjections &&
                            comp.projectionComparison && (
                              <tr key={`${comp.playerId}-proj`}>
                                <td
                                  colSpan={9}
                                  className="px-8 py-3 bg-surface-secondary dark:bg-shell-bg"
                                >
                                  <div className="text-body-sm font-medium text-content mb-2">
                                    Projection Comparison (FanGraphs vs ESPN)
                                  </div>
                                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                    {Object.entries(
                                      comp.projectionComparison,
                                    ).map(([stat, values]) => (
                                      <div
                                        key={stat}
                                        className="bg-white dark:bg-shell-panel rounded-lg px-3 py-2 border border-neutral-100 dark:border-shell-border"
                                      >
                                        <div className="text-body-sm font-medium text-content-secondary uppercase tracking-wider mb-1">
                                          {stat}
                                        </div>
                                        <div className="flex justify-between text-data">
                                          <span
                                            className="text-content"
                                            title="FanGraphs"
                                          >
                                            {formatStat(stat, values.fangraphs)}
                                          </span>
                                          <span
                                            className={getDeltaClass(
                                              values.delta,
                                            )}
                                            title={`Delta: ${values.delta >= 0 ? "+" : ""}${values.delta}`}
                                          >
                                            {values.delta >= 0 ? "+" : ""}
                                            {formatStat(stat, values.delta)}
                                          </span>
                                        </div>
                                        <div className="text-body-sm text-content-tertiary">
                                          ESPN: {formatStat(stat, values.espn)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Meta Info */}
              <div className="bg-surface-secondary dark:bg-shell-bg px-4 py-3 border-t border-neutral-100 dark:border-shell-border">
                <p className="text-body-sm text-content-secondary">
                  Showing {filteredComparisons.length} of{" "}
                  {data.comparisons.length} comparisons for{" "}
                  {data.meta.totalTeams}-team league with ${data.meta.budget}{" "}
                  budget
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <BarChart3 className="mx-auto h-12 w-12 text-content-tertiary" />
              <h3 className="mt-2 text-body-sm font-medium text-content">
                No comparisons available
              </h3>
              <p className="mt-1 text-body-sm text-content-secondary">
                {position !== "ALL"
                  ? `No players found for position ${position}. Try selecting ALL.`
                  : "Upload projections and ensure ESPN data is available."}
              </p>
            </div>
          )}
        </>
      )}
    </Container>
  );
}

function SummaryCard({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-shell-border bg-white dark:bg-shell-panel px-4 py-3">
      <div className="text-body-sm text-content-secondary">{label}</div>
      <div className={cn("text-lg font-semibold text-content", className)}>
        {value}
      </div>
    </div>
  );
}

const RATE_STATS = new Set(["AVG", "OBP", "SLG", "OPS", "ERA", "WHIP", "K9", "WPCT"]);

function formatStat(key: string, value: number): string {
  if (RATE_STATS.has(key.toUpperCase())) {
    return value.toFixed(3);
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1);
}
