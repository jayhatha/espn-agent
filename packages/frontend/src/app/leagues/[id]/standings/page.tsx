"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import React, { useState, useMemo } from "react";
import {
  computeMarginalGains,
  computeAtRiskCategories,
  calculateAVG,
  calculateOBP,
  calculateOPS,
  calculateERA,
  calculateWHIP,
} from "@espn-fantasy/shared";
import type { TeamCategoryProjection } from "@espn-fantasy/shared";
import { useLeagueTeam } from "@/lib/hooks";
import { api } from "@/lib/api";
import { useProjectedStandings, useRollingStandings } from "@/lib/hooks";
import { Container } from "@/components/ui/Container";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { StatsTable, StatsTableColumn } from "@/components/ui/StatsTable";
import {
  formatStatValue,
  getRankColor,
} from "@/components/league/CategoryStatsTable";
import { CategoryPaceBar } from "@/components/league/CategoryPaceBar";
import { GapDetailRow } from "@/components/league/GapDetailRow";
import { CategoryMiniChart } from "@/components/league/CategoryMiniChart";
import { CategoryOpportunityMap } from "@/components/league/CategoryOpportunityMap";
import { AtRiskSummary } from "@/components/league/AtRiskSummary";
import { SwingAttributionPanel } from "@/components/league/SwingAttributionPanel";
import { Term } from "@/components/ui/Term";
import { cn } from "@/lib/cn";

interface Category {
  category_id: string;
  name: string;
  stat_key: string;
  type: string;
  direction: string;
}

interface CategoryStanding {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  category_id: string;
  projected_value: number;
  projected_rank: number;
  projected_roto_points: number | null;
  teamName: string;
  confidence?: { p10: number; p50: number; p90: number } | null;
}

interface CurrentCategoryStanding {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  category_id: string;
  value: number;
  rank: number;
  roto_points: number;
  teamName: string;
}

interface OverallStanding {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  projected_overall_points: number;
  projected_overall_rank: number;
  teamName: string;
  previousProjectedPoints: number | null;
  pointsDelta: number | null;
  confidence?: { p10: number; p50: number; p90: number } | null;
}

interface CurrentOverallStanding {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  overall_points: number;
  overall_rank: number;
  teamName: string;
}

interface SwingAttributionData {
  snapshotDate: string;
  previousSnapshotDate: string | null;
  attribution_available: boolean;
  teamId: number;
  teamName: string;
  totalDelta: number;
  buckets: {
    actual_performance: number;
    projection_change: number;
    competitor_movement: number;
  } | null;
  categoryBreakdown: Array<{
    category_id: string;
    categoryName: string;
    prevProjectedValue: number;
    currProjectedValue: number;
    prevRotoPoints: number;
    currRotoPoints: number;
    rotoDelta: number;
    bucket:
      | "actual_performance"
      | "projection_change"
      | "competitor_movement"
      | "mixed";
    topDriverPlayer?: string;
    topCompetitorMoved?: string;
  }>;
}

interface RollingCategoryStanding {
  team_id: number;
  category_id: string;
  value: number;
  rank: number;
  roto_points: number;
  teamName: string;
}

interface RollingOverallStanding {
  team_id: number;
  overall_points: number;
  overall_rank: number;
  teamName: string;
}

interface RollingStandingsData {
  windowDays: number;
  snapshotDate: string;
  windowStartDate: string | null;
  dataAvailable: boolean;
  categories: Category[];
  categoryStandings: RollingCategoryStanding[];
  overallStandings: RollingOverallStanding[];
}

interface StandingsData {
  snapshotDate: string;
  previousSnapshotDate: string | null;
  categories: Category[];
  categoryStandings: CategoryStanding[];
  overallStandings: OverallStanding[];
  currentCategoryStandings: CurrentCategoryStanding[];
  currentOverallStandings: CurrentOverallStanding[];
}

interface TeamFinishDistribution {
  teamId: number;
  teamName: string;
  projectedRotoPoints: number;
  rotoPointsP10: number;
  rotoPointsP50: number;
  rotoPointsP90: number;
  finishProbabilities: number[];
  p1: number;
  pTop3: number;
  pTopHalf: number;
  categoryP50: Record<string, number>;
  categorySwing: Record<string, number>;
}

interface SimulationResult {
  leagueId: number;
  snapshotDate: string;
  runs: number;
  seed: number;
  computedAt: string;
  teams: TeamFinishDistribution[];
  calibration: { deterministicRotoPoints: Record<number, number> };
}

type ViewMode =
  | "current"
  | "rolling30"
  | "rolling15"
  | "projected"
  | "simulation";

export default function StandingsPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId] = useLeagueTeam(leagueId);
  const [viewMode, setViewMode] = useState<ViewMode>("current");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [drilldownTeamId, setDrilldownTeamId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useProjectedStandings(leagueId);

  const rollingWindowDays = viewMode === "rolling15" ? 15 : 30;
  const { data: rollingData, isLoading: rollingLoading } = useRollingStandings(
    leagueId,
    rollingWindowDays,
    viewMode === "rolling30" || viewMode === "rolling15",
  ) as { data: RollingStandingsData | undefined; isLoading: boolean };

  // Fetch historical category-rank data as fallback when projected data unavailable
  const { data: categoryRankHistory } = useQuery({
    queryKey: ["category-rank-history", leagueId, selectedTeamId],
    queryFn: async () => {
      if (!selectedTeamId || !data?.categories) return null;
      const entries = await Promise.allSettled(
        data.categories.map((cat: Category) =>
          api.getCategoryRankTimeSeries(
            parseInt(leagueId, 10),
            cat.category_id,
            { teamIds: String(selectedTeamId) },
          ),
        ),
      );
      const results: Record<string, Array<{ date: string; rank: number }>> = {};
      data.categories.forEach((cat: Category, i: number) => {
        const entry = entries[i];
        if (entry.status === "fulfilled") {
          results[cat.category_id] =
            (entry.value as any).series?.map((s: any) => ({
              date: s.snapshot_date,
              rank: s.rank,
            })) ?? [];
        } else {
          results[cat.category_id] = [];
        }
      });
      return results;
    },
    enabled:
      viewMode === "projected" &&
      !!data &&
      data.overallStandings.length === 0 &&
      !!selectedTeamId,
  });

  // Roster drilldown for Season Outlook
  const { data: drilldownRosterData, isLoading: drilldownLoading } = useQuery({
    queryKey: ["team-roster-drilldown", leagueId, drilldownTeamId],
    queryFn: () =>
      api.getTeamRoster(parseInt(leagueId, 10), drilldownTeamId!) as Promise<{
        roster: Array<{
          playerId: number;
          playerName: string;
          mlbTeam: string | null;
          positions: string[];
          rosterStatus: string;
          projections: Record<string, number> | null;
          blendedProjections: Record<string, number> | null;
        }>;
        snapshotDate: string;
      }>,
    enabled: !!drilldownTeamId,
    staleTime: 5 * 60 * 1000,
  });

  // Monte Carlo simulation — runs when Season Outlook tab is active
  const {
    data: simulationResult,
    isLoading: simLoading,
    error: simError,
  } = useQuery({
    queryKey: ["simulation", leagueId],
    queryFn: () =>
      api.runSimulation(parseInt(leagueId, 10)) as Promise<SimulationResult>,
    enabled: viewMode === "simulation",
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Swing attribution — fetches when projected tab is active and a team is selected
  const { data: swingData } = useQuery({
    queryKey: ["standings-swing", leagueId, selectedTeamId, data?.snapshotDate],
    queryFn: async () => {
      if (!selectedTeamId) return null;
      return api.getStandingsSwing(
        parseInt(leagueId, 10),
        selectedTeamId,
        data?.snapshotDate ? { snapshotDate: data.snapshotDate } : undefined,
      ) as Promise<SwingAttributionData>;
    },
    enabled:
      viewMode === "projected" && !!selectedTeamId && !!data?.snapshotDate,
  });

  const currentMatrix = useMemo(() => {
    if (!data) return null;
    const { categories, currentCategoryStandings, currentOverallStandings } =
      data;
    if (!currentOverallStandings || currentOverallStandings.length === 0)
      return null;
    if (!currentCategoryStandings) return null;

    const teamCategoryMap = new Map<
      number,
      Map<string, CurrentCategoryStanding>
    >();
    for (const cs of currentCategoryStandings) {
      if (!teamCategoryMap.has(cs.team_id)) {
        teamCategoryMap.set(cs.team_id, new Map());
      }
      teamCategoryMap.get(cs.team_id)!.set(cs.category_id, cs);
    }

    return {
      categories,
      overallStandings: currentOverallStandings,
      teamCategoryMap,
    };
  }, [data]);

  const rollingMatrix = useMemo(() => {
    if (!rollingData || !rollingData.dataAvailable) return null;
    const { categories, categoryStandings, overallStandings } = rollingData;
    if (!overallStandings || overallStandings.length === 0) return null;

    const teamCategoryMap = new Map<
      number,
      Map<string, RollingCategoryStanding>
    >();
    for (const cs of categoryStandings) {
      if (!teamCategoryMap.has(cs.team_id)) {
        teamCategoryMap.set(cs.team_id, new Map());
      }
      teamCategoryMap.get(cs.team_id)!.set(cs.category_id, cs);
    }

    return { categories, overallStandings, teamCategoryMap };
  }, [rollingData]);

  const projectedMatrix = useMemo(() => {
    if (!data) return null;
    const { categories, categoryStandings, overallStandings } = data;
    if (overallStandings.length === 0) return null;

    const teamCategoryMap = new Map<number, Map<string, CategoryStanding>>();
    for (const cs of categoryStandings) {
      if (!teamCategoryMap.has(cs.team_id)) {
        teamCategoryMap.set(cs.team_id, new Map());
      }
      teamCategoryMap.get(cs.team_id)!.set(cs.category_id, cs);
    }

    return { categories, overallStandings, teamCategoryMap };
  }, [data]);

  // Build current-category lookup for pace bars
  const currentCategoryLookup = useMemo(() => {
    if (!data?.currentCategoryStandings) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const cs of data.currentCategoryStandings) {
      map.set(`${cs.team_id}_${cs.category_id}`, cs.value);
    }
    return map;
  }, [data]);

  // Build projected category values for gap detail
  const projectedCategoryValues = useMemo(() => {
    if (!data?.categoryStandings)
      return new Map<string, TeamCategoryProjection[]>();
    const map = new Map<string, TeamCategoryProjection[]>();
    for (const cs of data.categoryStandings) {
      if (!map.has(cs.category_id)) map.set(cs.category_id, []);
      map.get(cs.category_id)!.push({
        teamId: cs.team_id,
        teamName: cs.teamName,
        value: cs.projected_value,
      });
    }
    return map;
  }, [data]);

  // Compute marginal gains for selected team
  const marginalGains = useMemo(() => {
    if (
      !selectedTeamId ||
      !data?.categories ||
      projectedCategoryValues.size === 0
    )
      return [];
    return computeMarginalGains(
      selectedTeamId,
      projectedCategoryValues,
      data.categories.map((c: Category) => ({
        category_id: c.category_id,
        name: c.name || c.stat_key,
        direction: c.direction as "HIGHER_BETTER" | "LOWER_BETTER",
      })),
    );
  }, [selectedTeamId, data?.categories, projectedCategoryValues]);

  // Compute at-risk categories for selected team
  const atRiskCategories = useMemo(() => {
    if (
      !selectedTeamId ||
      !data?.categories ||
      projectedCategoryValues.size === 0
    )
      return [];
    return computeAtRiskCategories(
      selectedTeamId,
      projectedCategoryValues,
      data.categories.map((c: Category) => ({
        category_id: c.category_id,
        name: c.name || c.stat_key,
        direction: c.direction as "HIGHER_BETTER" | "LOWER_BETTER",
      })),
    );
  }, [selectedTeamId, data?.categories, projectedCategoryValues]);

  const getPlayerStatForCategory = (
    projections: Record<string, number> | null,
    category: Category,
  ): number | null => {
    if (!projections) return null;
    if (category.type === "COUNTING") {
      return projections[category.stat_key] ?? null;
    }
    const fid = category.stat_key.toLowerCase();
    switch (fid) {
      case "avg":
        return calculateAVG(projections);
      case "obp":
        return calculateOBP(projections);
      case "ops":
        return calculateOPS(projections);
      case "era":
        return calculateERA(projections);
      case "whip":
        return calculateWHIP(projections);
      default:
        return null;
    }
  };

  const hasCurrentData = currentMatrix !== null;
  const hasProjectedData = projectedMatrix !== null;

  // Build overall standings table columns
  const overallColumns: StatsTableColumn[] = [
    {
      key: "rank",
      label: "Rank",
      align: "left",
      format: (val) => (
        <span className="font-medium text-content dark:text-shell-text">
          {val}
        </span>
      ),
    },
    {
      key: "teamName",
      label: "Team",
      align: "left",
      format: (val, row) => (
        <div className="flex items-center">
          {selectedTeamId === row.team_id && (
            <span className="inline-block w-2 h-2 rounded-full bg-accent mr-2" />
          )}
          <span className="font-medium text-content dark:text-shell-text">
            {val}
          </span>
        </div>
      ),
    },
    {
      key: "points",
      label: <Term id="roto-points">Total Roto Points</Term>,
      align: "right",
      format: (val) => (
        <span className="font-semibold text-data text-content dark:text-shell-text">
          {Number(val)}
        </span>
      ),
    },
  ];

  // Projected overall columns include delta and confidence range
  const projectedOverallColumns: StatsTableColumn[] = [
    {
      key: "rank",
      label: "Rank",
      align: "left",
      format: (val) => (
        <span className="font-medium text-content dark:text-shell-text">
          {val}
        </span>
      ),
    },
    {
      key: "teamName",
      label: "Team",
      align: "left",
      format: (val, row) => (
        <div className="flex items-center">
          {selectedTeamId === row.team_id && (
            <span className="inline-block w-2 h-2 rounded-full bg-accent mr-2" />
          )}
          <span className="font-medium text-content dark:text-shell-text">
            {val}
          </span>
        </div>
      ),
    },
    {
      key: "points",
      label: <Term id="roto-points">Total Roto Points</Term>,
      align: "right",
      format: (val, row) => {
        const mc = (row as OverallStanding).confidence;
        return (
          <div className="flex flex-col items-end">
            <span className="font-semibold text-data text-content dark:text-shell-text">
              {Number(val)}
            </span>
            {mc && (
              <span className="text-[0.65rem] text-content-tertiary dark:text-shell-muted tabular-nums">
                {mc.p10}–{mc.p90}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "pointsDelta",
      label: "Change",
      align: "right",
      format: (val) => {
        if (val == null)
          return (
            <span className="text-content-tertiary dark:text-shell-muted">
              --
            </span>
          );
        const num = Number(val);
        if (num === 0)
          return (
            <span className="text-content-tertiary dark:text-shell-muted">
              0
            </span>
          );
        return (
          <span
            className={
              num > 0
                ? "text-positive font-medium"
                : "text-negative font-medium"
            }
          >
            {num > 0 ? "+" : ""}
            {num}
          </span>
        );
      },
    },
  ];

  // Helper to render the category breakdown matrix table
  const renderCategoryBreakdown = (
    title: string,
    categories: Category[],
    overallStandings: Array<{
      team_id: number;
      teamName: string;
      [key: string]: any;
    }>,
    teamCategoryMap: Map<number, Map<string, any>>,
    valueKey: string,
    rankKey: string,
    pointsKey: string,
    overallPointsKey: string,
    showPaceBars: boolean,
    showGapDetail: boolean,
  ) => {
    const numTeams = overallStandings.length;
    const totalColSpan = categories.length + 2; // team col + categories + total col

    return (
      <Card>
        <CardHeader>
          <Heading level={3}>{title}</Heading>
          {showGapDetail && (
            <p className="text-body-sm text-content-tertiary dark:text-shell-muted mt-1">
              Click a category header to see gap detail
            </p>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
              <thead className="bg-surface-secondary dark:bg-shell-bg">
                <tr>
                  <th className="px-3 py-3 text-left text-data font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider sticky left-0 bg-surface-secondary dark:bg-shell-bg z-10">
                    Team
                  </th>
                  {categories.map((cat) => (
                    <th
                      key={cat.category_id}
                      className={cn(
                        "px-3 py-3 text-center text-data font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider min-w-[80px]",
                        showGapDetail &&
                          "cursor-pointer hover:text-accent dark:hover:text-shell-accent transition-colors",
                        expandedCategory === cat.category_id &&
                          "text-accent dark:text-shell-accent",
                      )}
                      onClick={
                        showGapDetail
                          ? () =>
                              setExpandedCategory(
                                expandedCategory === cat.category_id
                                  ? null
                                  : cat.category_id,
                              )
                          : undefined
                      }
                    >
                      {cat.name || cat.stat_key}
                      {showGapDetail &&
                        expandedCategory === cat.category_id && (
                          <span className="ml-1 text-accent dark:text-shell-accent">
                            {"\u25BC"}
                          </span>
                        )}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center text-data font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider font-bold">
                    <Term id="roto-points">Total</Term>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-shell-panel divide-y divide-neutral-100 dark:divide-shell-border">
                {overallStandings.map((team) => {
                  const isSelected = selectedTeamId === team.team_id;
                  const teamCats = teamCategoryMap.get(team.team_id);

                  return (
                    <React.Fragment key={team.team_id}>
                      <tr
                        className={cn(
                          "hover:bg-surface-secondary dark:hover:bg-shell-bg transition-colors",
                          isSelected
                            ? "bg-accent-light dark:bg-shell-accent/20"
                            : "",
                        )}
                      >
                        <td className="px-3 py-3 whitespace-nowrap text-body-sm font-medium text-content dark:text-shell-text sticky left-0 bg-inherit z-10">
                          <div className="flex items-center">
                            {isSelected && (
                              <span className="inline-block w-2 h-2 rounded-full bg-accent mr-2 flex-shrink-0" />
                            )}
                            <span className="truncate max-w-[150px]">
                              {team.teamName}
                            </span>
                          </div>
                        </td>
                        {categories.map((cat) => {
                          const catData = teamCats?.get(cat.category_id);
                          if (!catData) {
                            return (
                              <td
                                key={cat.category_id}
                                className="px-3 py-3 text-center text-data text-content-tertiary dark:text-shell-muted"
                              >
                                -
                              </td>
                            );
                          }

                          const currentValue = currentCategoryLookup.get(
                            `${team.team_id}_${cat.category_id}`,
                          );

                          return (
                            <td
                              key={cat.category_id}
                              className="px-3 py-3 text-center"
                            >
                              <div className="flex flex-col items-center">
                                <span className="text-data text-content dark:text-shell-text font-medium">
                                  {formatStatValue(
                                    catData[valueKey],
                                    cat.type,
                                    cat.stat_key,
                                  )}
                                </span>
                                <span
                                  className={`text-data rounded px-1 mt-0.5 ${getRankColor(catData[rankKey], numTeams)}`}
                                >
                                  #{catData[rankKey]} (
                                  {Number(catData[pointsKey])}
                                  pts)
                                </span>
                                {/* Confidence range: show P10–P90 for projected view */}
                                {showPaceBars &&
                                  (catData as CategoryStanding).confidence && (
                                    <span className="text-[0.65rem] text-content-tertiary dark:text-shell-muted mt-0.5 tabular-nums">
                                      {formatStatValue(
                                        (catData as CategoryStanding)
                                          .confidence!.p10,
                                        cat.type,
                                        cat.stat_key,
                                      )}
                                      –
                                      {formatStatValue(
                                        (catData as CategoryStanding)
                                          .confidence!.p90,
                                        cat.type,
                                        cat.stat_key,
                                      )}
                                    </span>
                                  )}
                                {/* Pace bar: show for selected team in projected view */}
                                {showPaceBars &&
                                  isSelected &&
                                  currentValue != null &&
                                  catData[valueKey] != null && (
                                    <CategoryPaceBar
                                      current={currentValue}
                                      projected={Number(catData[valueKey])}
                                      statKey={cat.stat_key}
                                      type={cat.type as "COUNTING" | "RATE"}
                                    />
                                  )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-3 py-3 text-center text-data font-bold text-content dark:text-shell-text">
                          {Number(team[overallPointsKey])}
                        </td>
                      </tr>

                      {/* Gap detail row: show after the selected team's row when a category is expanded */}
                      {showGapDetail &&
                        isSelected &&
                        expandedCategory &&
                        (() => {
                          const cat = categories.find(
                            (c) => c.category_id === expandedCategory,
                          );
                          if (!cat) return null;
                          const values = projectedCategoryValues.get(
                            cat.category_id,
                          );
                          if (!values) return null;
                          return (
                            <GapDetailRow
                              key={`gap-${team.team_id}-${expandedCategory}`}
                              categoryId={cat.category_id}
                              categoryName={cat.name || cat.stat_key}
                              myTeamId={team.team_id}
                              allTeamValues={values}
                              direction={
                                cat.direction as
                                  | "HIGHER_BETTER"
                                  | "LOWER_BETTER"
                              }
                              numTeams={numTeams}
                              statType={cat.type}
                              statKey={cat.stat_key}
                              isExpanded={true}
                              colSpan={totalColSpan}
                            />
                          );
                        })()}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Container size="wide" className="py-8">
      <PageHeader
        title="Standings"
        subtitle="Current and projected end-of-season standings by category."
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
      />

      {data?.snapshotDate && (
        <p className="mt-1 mb-6 text-body-sm text-content-secondary dark:text-shell-muted">
          As of snapshot:{" "}
          {new Date(data.snapshotDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          {data.previousSnapshotDate && viewMode === "projected" && (
            <span className="text-content-tertiary dark:text-shell-muted ml-2">
              (change since{" "}
              {new Date(data.previousSnapshotDate!).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" },
              )}
              )
            </span>
          )}
        </p>
      )}

      {isLoading ? (
        <LoadingSpinner quips />
      ) : error ? (
        <ErrorAlert message={(error as Error).message} />
      ) : hasCurrentData || hasProjectedData ? (
        <>
          {/* View Mode Tabs */}
          <div className="mb-6">
            <div className="border-b border-neutral-200 dark:border-shell-border">
              <nav className="-mb-px flex space-x-6">
                <button
                  onClick={() => setViewMode("current")}
                  className={cn(
                    "py-3 px-1 border-b-2 font-medium text-body-sm transition-colors",
                    viewMode === "current"
                      ? "border-accent dark:border-shell-accent text-content dark:text-shell-text"
                      : "border-transparent text-content-secondary dark:text-shell-muted hover:text-content dark:hover:text-shell-text hover:border-neutral-300",
                  )}
                >
                  Current Standings
                </button>
                <button
                  onClick={() => setViewMode("rolling30")}
                  className={cn(
                    "py-3 px-1 border-b-2 font-medium text-body-sm transition-colors",
                    viewMode === "rolling30"
                      ? "border-accent dark:border-shell-accent text-content dark:text-shell-text"
                      : "border-transparent text-content-secondary dark:text-shell-muted hover:text-content dark:hover:text-shell-text hover:border-neutral-300",
                  )}
                >
                  Past 30 Days
                </button>
                <button
                  onClick={() => setViewMode("rolling15")}
                  className={cn(
                    "py-3 px-1 border-b-2 font-medium text-body-sm transition-colors",
                    viewMode === "rolling15"
                      ? "border-accent dark:border-shell-accent text-content dark:text-shell-text"
                      : "border-transparent text-content-secondary dark:text-shell-muted hover:text-content dark:hover:text-shell-text hover:border-neutral-300",
                  )}
                >
                  Past 15 Days
                </button>
                <button
                  onClick={() => setViewMode("projected")}
                  className={cn(
                    "py-3 px-1 border-b-2 font-medium text-body-sm transition-colors",
                    viewMode === "projected"
                      ? "border-accent dark:border-shell-accent text-content dark:text-shell-text"
                      : "border-transparent text-content-secondary dark:text-shell-muted hover:text-content dark:hover:text-shell-text hover:border-neutral-300",
                  )}
                >
                  Projected Standings
                </button>
                <button
                  onClick={() => setViewMode("simulation")}
                  className={cn(
                    "py-3 px-1 border-b-2 font-medium text-body-sm transition-colors",
                    viewMode === "simulation"
                      ? "border-accent dark:border-shell-accent text-content dark:text-shell-text"
                      : "border-transparent text-content-secondary dark:text-shell-muted hover:text-content dark:hover:text-shell-text hover:border-neutral-300",
                  )}
                >
                  Season Outlook
                </button>
              </nav>
            </div>
          </div>

          {viewMode === "current" && currentMatrix ? (
            <div className="space-y-6">
              {/* Current Overall Standings */}
              <Card>
                <CardHeader>
                  <Heading level={3}>Current Overall Standings</Heading>
                </CardHeader>
                <CardContent className="p-0">
                  <StatsTable
                    columns={overallColumns}
                    data={currentMatrix.overallStandings.map(
                      (t: CurrentOverallStanding) => ({
                        ...t,
                        rank: t.overall_rank,
                        points: t.overall_points,
                      }),
                    )}
                    rowKey="team_id"
                    highlightRow={(row) => selectedTeamId === row.team_id}
                  />
                </CardContent>
              </Card>

              {/* Current Category Breakdown */}
              {renderCategoryBreakdown(
                "Current Category Breakdown",
                currentMatrix.categories,
                currentMatrix.overallStandings,
                currentMatrix.teamCategoryMap,
                "value",
                "rank",
                "roto_points",
                "overall_points",
                false, // no pace bars in current view
                false, // no gap detail in current view
              )}
            </div>
          ) : viewMode === "current" && !currentMatrix ? (
            <Card>
              <CardContent className="py-4">
                <ErrorAlert
                  variant="info"
                  message="Current standings require a daily snapshot. Trigger a snapshot from the league dashboard to sync your league data from ESPN."
                  action={{
                    label: "Go to Dashboard",
                    href: `/leagues/${leagueId}`,
                  }}
                />
              </CardContent>
            </Card>
          ) : null}

          {(viewMode === "rolling30" || viewMode === "rolling15") &&
          rollingLoading ? (
            <LoadingSpinner quips />
          ) : (viewMode === "rolling30" || viewMode === "rolling15") &&
            rollingMatrix ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <Heading level={3}>
                    Past {rollingWindowDays} Days Overall Standings
                  </Heading>
                  {rollingData?.windowStartDate && (
                    <p className="text-body-sm text-content-tertiary dark:text-shell-muted mt-1">
                      {new Date(rollingData.windowStartDate).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                        },
                      )}{" "}
                      –{" "}
                      {new Date(rollingData.snapshotDate).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <StatsTable
                    columns={overallColumns}
                    data={rollingMatrix.overallStandings.map(
                      (t: RollingOverallStanding) => ({
                        ...t,
                        rank: t.overall_rank,
                        points: t.overall_points,
                      }),
                    )}
                    rowKey="team_id"
                    highlightRow={(row) => selectedTeamId === row.team_id}
                  />
                </CardContent>
              </Card>

              {renderCategoryBreakdown(
                `Past ${rollingWindowDays} Days Category Breakdown`,
                rollingMatrix.categories,
                rollingMatrix.overallStandings,
                rollingMatrix.teamCategoryMap,
                "value",
                "rank",
                "roto_points",
                "overall_points",
                false,
                false,
              )}
            </div>
          ) : (viewMode === "rolling30" || viewMode === "rolling15") &&
            !rollingMatrix ? (
            <Card>
              <CardContent className="py-4">
                <ErrorAlert
                  variant="info"
                  message={`Not enough snapshot history yet to compute past ${rollingWindowDays}-day standings. Keep syncing daily snapshots and check back once the league has ${rollingWindowDays}+ days of data.`}
                />
              </CardContent>
            </Card>
          ) : null}

          {viewMode === "projected" && projectedMatrix ? (
            <div className="space-y-6">
              {/* Projected Overall Standings with Delta */}
              <Card>
                <CardHeader>
                  <Heading level={3}>Overall Projected Standings</Heading>
                </CardHeader>
                <CardContent className="p-0">
                  <StatsTable
                    columns={projectedOverallColumns}
                    data={projectedMatrix.overallStandings.map(
                      (t: OverallStanding) => ({
                        ...t,
                        rank: t.projected_overall_rank,
                        points: t.projected_overall_points,
                        pointsDelta: t.pointsDelta,
                      }),
                    )}
                    rowKey="team_id"
                    highlightRow={(row) => selectedTeamId === row.team_id}
                  />
                </CardContent>
              </Card>

              {/* What Changed? — Swing Attribution Panel */}
              {selectedTeamId &&
                swingData?.attribution_available &&
                Math.abs(swingData.totalDelta) >= 0.5 && (
                  <Card>
                    <CardHeader>
                      <Heading level={3}>What Changed?</Heading>
                      <p className="text-body-sm text-content-tertiary dark:text-shell-muted mt-1">
                        Why your projected roto points changed since the last
                        snapshot
                      </p>
                    </CardHeader>
                    <CardContent>
                      <SwingAttributionPanel
                        data={swingData}
                        previousSnapshotDate={swingData.previousSnapshotDate}
                      />
                    </CardContent>
                  </Card>
                )}

              {/* Marginal Gains Summary */}
              {selectedTeamId && marginalGains.length > 0 && (
                <Card>
                  <CardHeader>
                    <Heading level={3}>
                      <Term id="marginal-gains">
                        Cheapest Path to Next Roto Point
                      </Term>
                    </Heading>
                    <p className="text-body-sm text-content-tertiary dark:text-shell-muted mt-1">
                      Categories sorted by smallest gap to gain 1 roto point
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {marginalGains
                        .filter((g) => g.teamAbove !== null)
                        .slice(0, 5)
                        .map((gain) => {
                          const cat = data?.categories?.find(
                            (c: Category) => c.category_id === gain.categoryId,
                          );
                          return (
                            <div
                              key={gain.categoryId}
                              className="flex items-center justify-between py-2 px-3 rounded bg-surface-secondary dark:bg-shell-bg"
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={cn(
                                    "inline-flex items-center px-1.5 py-0.5 rounded text-caption font-medium",
                                    getRankColor(
                                      gain.currentRank,
                                      data?.overallStandings?.length ?? 13,
                                    ),
                                  )}
                                >
                                  #{gain.currentRank}
                                </span>
                                <span className="font-medium text-body-sm text-content dark:text-shell-text">
                                  {gain.categoryName}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-body-sm">
                                <span className="text-content-secondary dark:text-shell-muted font-mono text-data">
                                  {formatStatValue(
                                    gain.gap,
                                    cat?.type ?? "COUNTING",
                                    cat?.stat_key ?? "",
                                  )}
                                </span>
                                <span className="text-content-tertiary dark:text-shell-muted text-caption">
                                  gap to #{gain.currentRank - 1}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Category Opportunity Map (ROTO-04) */}
              {selectedTeamId && marginalGains.length > 0 && (
                <Card>
                  <CardHeader>
                    <Heading level={3}>
                      <Term id="category-opportunity">
                        Category Opportunity Map
                      </Term>
                    </Heading>
                    <p className="text-body-sm text-content-tertiary dark:text-shell-muted mt-1">
                      All categories ranked by gap to next roto point with
                      difficulty rating
                    </p>
                  </CardHeader>
                  <CardContent className="p-0">
                    <CategoryOpportunityMap marginalGains={marginalGains} />
                  </CardContent>
                </Card>
              )}

              {/* Standings Points at Risk (ROTO-06) */}
              {selectedTeamId && atRiskCategories.length > 0 && (
                <Card>
                  <CardHeader>
                    <Heading level={3}>
                      <Term id="at-risk">Standings Points at Risk</Term>
                    </Heading>
                    <p className="text-body-sm text-content-tertiary dark:text-shell-muted mt-1">
                      Categories where another team could overtake you
                    </p>
                  </CardHeader>
                  <CardContent>
                    <AtRiskSummary atRiskCategories={atRiskCategories} />
                  </CardContent>
                </Card>
              )}

              {/* Projected Category Breakdown with pace bars and gap detail */}
              {renderCategoryBreakdown(
                "Projected Category Breakdown",
                projectedMatrix.categories,
                projectedMatrix.overallStandings,
                projectedMatrix.teamCategoryMap,
                "projected_value",
                "projected_rank",
                "projected_roto_points",
                "projected_overall_points",
                true, // show pace bars
                true, // show gap detail
              )}
            </div>
          ) : viewMode === "projected" && !projectedMatrix ? (
            <>
              <Card>
                <CardContent className="py-4">
                  <ErrorAlert
                    variant="info"
                    message="Projected standings require both a daily snapshot and uploaded FanGraphs projections. Upload projections from the league dashboard to see projected final standings."
                    action={{
                      label: "Go to Dashboard",
                      href: `/leagues/${leagueId}`,
                    }}
                  />
                </CardContent>
              </Card>

              {/* ROTO-03: Historical fallback charts */}
              {categoryRankHistory && data?.categories && (
                <Card className="mt-8">
                  <CardHeader>
                    <Heading level={3}>Historical Category Trends</Heading>
                    <p className="text-body-sm text-content-tertiary dark:text-shell-muted mt-1">
                      Projected standings unavailable. Showing historical rank
                      trends.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {data.categories.map((cat: Category) => {
                        const history =
                          categoryRankHistory[cat.category_id] ?? [];
                        return (
                          <CategoryMiniChart
                            key={cat.category_id}
                            data={history}
                            label={cat.name || cat.stat_key}
                            height={100}
                          />
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}

          {viewMode === "simulation" && (
            <div className="space-y-6">
              {simLoading ? (
                <LoadingSpinner quips />
              ) : simError ? (
                <Card>
                  <CardContent className="py-4">
                    <ErrorAlert
                      message={(simError as Error).message}
                      action={{
                        label: "Retry",
                        onClick: () =>
                          queryClient.invalidateQueries({
                            queryKey: ["simulation", leagueId],
                          }),
                      }}
                    />
                  </CardContent>
                </Card>
              ) : simulationResult ? (
                <>
                  {/* Header row: metadata + re-run */}
                  <div className="flex items-center justify-between">
                    <p className="text-body-sm text-content-secondary dark:text-shell-muted">
                      {simulationResult.runs.toLocaleString()} runs &middot;
                      seed {simulationResult.seed} &middot; computed{" "}
                      {new Date(simulationResult.computedAt).toLocaleTimeString(
                        "en-US",
                        { hour: "numeric", minute: "2-digit" },
                      )}
                    </p>
                    <button
                      onClick={() =>
                        queryClient.invalidateQueries({
                          queryKey: ["simulation", leagueId],
                        })
                      }
                      className="text-body-sm text-accent dark:text-shell-accent hover:underline"
                    >
                      Re-run
                    </button>
                  </div>

                  {/* Finish probability table */}
                  <Card>
                    <CardHeader>
                      <Heading level={3}>Season Finish Probabilities</Heading>
                      <p className="text-body-sm text-content-tertiary dark:text-shell-muted mt-1">
                        Sorted by median projected roto points (P50)
                      </p>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
                          <thead className="bg-surface-secondary dark:bg-shell-bg">
                            <tr>
                              <th className="px-4 py-3 text-left text-data font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider w-12">
                                #
                              </th>
                              <th className="px-4 py-3 text-left text-data font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                                Team
                              </th>
                              <th className="px-4 py-3 text-right text-data font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                                Win %
                              </th>
                              <th className="px-4 py-3 text-right text-data font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                                Top 3
                              </th>
                              <th className="px-4 py-3 text-right text-data font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                                Top Half
                              </th>
                              <th className="px-4 py-3 text-right text-data font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                                P50 Pts
                              </th>
                              <th className="px-4 py-3 text-right text-data font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                                P10–P90 Range
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-shell-panel divide-y divide-neutral-100 dark:divide-shell-border">
                            {simulationResult.teams
                              .slice()
                              .sort((a, b) => b.rotoPointsP50 - a.rotoPointsP50)
                              .map((team, i) => {
                                const isSelected =
                                  selectedTeamId === team.teamId;
                                const isDrilldown =
                                  drilldownTeamId === team.teamId;
                                return (
                                  <tr
                                    key={team.teamId}
                                    onClick={() =>
                                      setDrilldownTeamId(
                                        isDrilldown ? null : team.teamId,
                                      )
                                    }
                                    className={cn(
                                      "cursor-pointer hover:bg-surface-secondary dark:hover:bg-shell-bg transition-colors",
                                      isSelected
                                        ? "bg-accent-light dark:bg-shell-accent/20"
                                        : "",
                                      isDrilldown
                                        ? "bg-surface-secondary dark:bg-shell-bg"
                                        : "",
                                    )}
                                  >
                                    <td className="px-4 py-3 text-data text-content-secondary dark:text-shell-muted">
                                      {i + 1}
                                    </td>
                                    <td className="px-4 py-3 text-body-sm font-medium text-content dark:text-shell-text">
                                      <div className="flex items-center gap-2">
                                        {isSelected && (
                                          <span className="inline-block w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                                        )}
                                        {team.teamName}
                                        <span
                                          className={cn(
                                            "ml-auto text-content-tertiary dark:text-shell-muted text-caption transition-transform",
                                            isDrilldown ? "rotate-90" : "",
                                          )}
                                        >
                                          ›
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-right text-data tabular-nums">
                                      <span
                                        className={cn(
                                          "font-medium",
                                          team.p1 >= 0.2
                                            ? "text-positive"
                                            : team.p1 >= 0.08
                                              ? "text-content dark:text-shell-text"
                                              : "text-content-tertiary dark:text-shell-muted",
                                        )}
                                      >
                                        {(team.p1 * 100).toFixed(1)}%
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-data tabular-nums text-content dark:text-shell-text">
                                      {(team.pTop3 * 100).toFixed(1)}%
                                    </td>
                                    <td className="px-4 py-3 text-right text-data tabular-nums text-content-secondary dark:text-shell-muted">
                                      {(team.pTopHalf * 100).toFixed(1)}%
                                    </td>
                                    <td className="px-4 py-3 text-right text-data font-semibold tabular-nums text-content dark:text-shell-text">
                                      {team.rotoPointsP50.toFixed(1)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-data tabular-nums text-content-tertiary dark:text-shell-muted">
                                      {team.rotoPointsP10.toFixed(1)}–
                                      {team.rotoPointsP90.toFixed(1)}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Team player drilldown */}
                  {drilldownTeamId &&
                    data?.categories &&
                    (() => {
                      const team = simulationResult.teams.find(
                        (t) => t.teamId === drilldownTeamId,
                      );
                      if (!team) return null;
                      const cats = data.categories as Category[];
                      const countingCats = cats.filter(
                        (c: Category) => c.type === "COUNTING",
                      );

                      // Compute team totals for counting cats (for % share)
                      const teamTotals: Record<string, number> = {};
                      if (drilldownRosterData?.roster) {
                        for (const cat of countingCats) {
                          teamTotals[cat.category_id] =
                            drilldownRosterData.roster.reduce(
                              (sum, p) =>
                                sum +
                                ((p.blendedProjections ?? p.projections)?.[
                                  cat.stat_key
                                ] ?? 0),
                              0,
                            );
                        }
                      }

                      // Compute WPA per player: share of projected counting-cat roto points
                      // WPA_p = Σ_k [(player_stat_k / team_total_k) × categoryP50_k]
                      const playerWPAMap = new Map<number, number>();
                      if (drilldownRosterData?.roster) {
                        for (const player of drilldownRosterData.roster) {
                          let wpa = 0;
                          for (const cat of countingCats) {
                            const teamTotal = teamTotals[cat.category_id] ?? 0;
                            if (teamTotal <= 0) continue;
                            const playerStat =
                              (player.blendedProjections ??
                                player.projections)?.[cat.stat_key] ?? 0;
                            const catRoto =
                              team.categoryP50[cat.category_id] ?? 0;
                            wpa += (playerStat / teamTotal) * catRoto;
                          }
                          playerWPAMap.set(player.playerId, wpa);
                        }
                      }
                      const teamWPA = countingCats.reduce(
                        (sum, cat) =>
                          sum + (team.categoryP50[cat.category_id] ?? 0),
                        0,
                      );

                      return (
                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <div>
                                <Heading level={3}>
                                  Player Breakdown — {team.teamName}
                                </Heading>
                                <p className="text-body-sm text-content-tertiary dark:text-shell-muted mt-1">
                                  Full-season projected contributions (current +
                                  RoS)
                                </p>
                              </div>
                              <button
                                onClick={() => setDrilldownTeamId(null)}
                                className="text-content-tertiary dark:text-shell-muted hover:text-content dark:hover:text-shell-text text-xl leading-none"
                                aria-label="Close drilldown"
                              >
                                ×
                              </button>
                            </div>
                          </CardHeader>
                          <CardContent className="p-0">
                            {drilldownLoading ? (
                              <div className="px-6 py-4">
                                <LoadingSpinner />
                              </div>
                            ) : drilldownRosterData?.roster &&
                              drilldownRosterData.roster.length > 0 ? (
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border text-data">
                                  <thead className="bg-surface-secondary dark:bg-shell-bg">
                                    <tr>
                                      <th className="px-4 py-2 text-left font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider w-40">
                                        Player
                                      </th>
                                      <th className="px-2 py-2 text-left font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider w-20">
                                        Pos
                                      </th>
                                      {cats.map((cat: Category) => (
                                        <th
                                          key={cat.category_id}
                                          className="px-3 py-2 text-right font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider min-w-[60px]"
                                        >
                                          {cat.name || cat.stat_key}
                                        </th>
                                      ))}
                                      <th
                                        className="px-3 py-2 text-right font-medium text-accent dark:text-shell-accent uppercase tracking-wider min-w-[56px]"
                                        title="Win Points Added: share of projected counting-category roto points"
                                      >
                                        WPA
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-100 dark:divide-shell-border bg-white dark:bg-shell-panel">
                                    {drilldownRosterData.roster
                                      .slice()
                                      .sort((a, b) => {
                                        const aWPA =
                                          playerWPAMap.get(a.playerId) ?? 0;
                                        const bWPA =
                                          playerWPAMap.get(b.playerId) ?? 0;
                                        return bWPA - aWPA;
                                      })
                                      .map((player) => (
                                        <tr
                                          key={player.playerId}
                                          className="hover:bg-surface-secondary dark:hover:bg-shell-bg"
                                        >
                                          <td className="px-4 py-2 text-body-sm font-medium text-content dark:text-shell-text whitespace-nowrap">
                                            <div>{player.playerName}</div>
                                            {player.mlbTeam && (
                                              <div className="text-caption text-content-tertiary dark:text-shell-muted">
                                                {player.mlbTeam}
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-2 py-2 text-caption text-content-secondary dark:text-shell-muted whitespace-nowrap">
                                            {(player.positions ?? []).join(
                                              ", ",
                                            )}
                                          </td>
                                          {cats.map((cat: Category) => {
                                            const val =
                                              getPlayerStatForCategory(
                                                player.blendedProjections ??
                                                  player.projections,
                                                cat,
                                              );
                                            const teamTotal =
                                              teamTotals[cat.category_id] ?? 0;
                                            const pct =
                                              cat.type === "COUNTING" &&
                                              teamTotal > 0 &&
                                              val !== null
                                                ? Math.round(
                                                    (val / teamTotal) * 100,
                                                  )
                                                : null;
                                            return (
                                              <td
                                                key={cat.category_id}
                                                className="px-3 py-2 text-right tabular-nums whitespace-nowrap"
                                              >
                                                {val === null ? (
                                                  <span className="text-content-tertiary dark:text-shell-muted">
                                                    —
                                                  </span>
                                                ) : (
                                                  <div className="flex flex-col items-end">
                                                    <span className="text-content dark:text-shell-text">
                                                      {formatStatValue(
                                                        val,
                                                        cat.type,
                                                        cat.stat_key,
                                                      )}
                                                    </span>
                                                    {pct !== null &&
                                                      pct > 0 && (
                                                        <span className="text-caption text-content-tertiary dark:text-shell-muted">
                                                          {pct}%
                                                        </span>
                                                      )}
                                                  </div>
                                                )}
                                              </td>
                                            );
                                          })}
                                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                                            {(() => {
                                              const wpa =
                                                playerWPAMap.get(
                                                  player.playerId,
                                                ) ?? 0;
                                              return (
                                                <span
                                                  className={cn(
                                                    "font-medium",
                                                    wpa >= 2
                                                      ? "text-positive"
                                                      : wpa >= 0.5
                                                        ? "text-content dark:text-shell-text"
                                                        : "text-content-tertiary dark:text-shell-muted",
                                                  )}
                                                >
                                                  {wpa.toFixed(1)}
                                                </span>
                                              );
                                            })()}
                                          </td>
                                        </tr>
                                      ))}
                                    {/* Team total row */}
                                    <tr className="bg-surface-secondary dark:bg-shell-bg font-semibold">
                                      <td
                                        colSpan={2}
                                        className="px-4 py-2 text-body-sm text-content dark:text-shell-text"
                                      >
                                        Team Total
                                      </td>
                                      {cats.map((cat: Category) => {
                                        const val =
                                          cat.type === "COUNTING"
                                            ? teamTotals[cat.category_id]
                                            : null;
                                        return (
                                          <td
                                            key={cat.category_id}
                                            className="px-3 py-2 text-right tabular-nums text-content dark:text-shell-text"
                                          >
                                            {val !== undefined &&
                                            val !== null ? (
                                              formatStatValue(
                                                val,
                                                cat.type,
                                                cat.stat_key,
                                              )
                                            ) : (
                                              <span className="text-content-tertiary dark:text-shell-muted">
                                                —
                                              </span>
                                            )}
                                          </td>
                                        );
                                      })}
                                      <td className="px-3 py-2 text-right tabular-nums text-accent dark:text-shell-accent">
                                        {teamWPA.toFixed(1)}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="px-6 py-4 text-body-sm text-content-secondary dark:text-shell-muted">
                                No roster data available for this team.
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })()}

                  {/* Category volatility for selected team */}
                  {selectedTeamId &&
                    data?.categories &&
                    (() => {
                      const myTeam = simulationResult.teams.find(
                        (t) => t.teamId === selectedTeamId,
                      );
                      if (!myTeam) return null;
                      const catsWithSwing: Array<{
                        cat: Category;
                        swing: number;
                      }> = data.categories
                        .map((cat: Category) => ({
                          cat,
                          swing: myTeam.categorySwing[cat.category_id] ?? 0,
                        }))
                        .sort(
                          (
                            a: { cat: Category; swing: number },
                            b: { cat: Category; swing: number },
                          ) => b.swing - a.swing,
                        );
                      return (
                        <Card>
                          <CardHeader>
                            <Heading level={3}>
                              Category Volatility — {myTeam.teamName}
                            </Heading>
                            <p className="text-body-sm text-content-tertiary dark:text-shell-muted mt-1">
                              P90–P10 spread per category across all simulation
                              runs. Higher = more uncertain.
                            </p>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {catsWithSwing.map(({ cat, swing }) => {
                                const maxSwing = catsWithSwing[0]?.swing ?? 1;
                                const pct =
                                  maxSwing > 0
                                    ? Math.round((swing / maxSwing) * 100)
                                    : 0;
                                return (
                                  <div
                                    key={cat.category_id}
                                    className="flex items-center gap-3"
                                  >
                                    <span className="w-14 text-right text-data font-medium text-content-secondary dark:text-shell-muted shrink-0">
                                      {cat.name || cat.stat_key}
                                    </span>
                                    <div className="flex-1 bg-neutral-100 dark:bg-shell-bg rounded-full h-2 overflow-hidden">
                                      <div
                                        className="h-2 rounded-full bg-accent dark:bg-shell-accent transition-all"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="w-20 text-right text-data tabular-nums text-content dark:text-shell-text shrink-0">
                                      ±
                                      {formatStatValue(
                                        swing / 2,
                                        cat.type,
                                        cat.stat_key,
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })()}
                </>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-4">
            <ErrorAlert
              variant="info"
              message="Projected standings require both a daily snapshot and uploaded FanGraphs projections. Upload projections from the league dashboard to see projected final standings."
              action={{
                label: "Go to Dashboard",
                href: `/leagues/${leagueId}`,
              }}
            />
          </CardContent>
        </Card>
      )}
    </Container>
  );
}
