"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { api } from "@/lib/api";
import { COLORS } from "@/lib/constants";
import { CHART_THEME } from "@/lib/chart-theme";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/Container";
import { Heading } from "@/components/ui/Heading";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { TransactionMarker } from "@/components/league/TransactionMarker";
import { InflectionPointMarker, type InflectionPoint } from "@/components/league/InflectionPointMarker";
import { DateRangeFilter } from "@/components/league/DateRangeFilter";

interface OverallDataPoint {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  overall_points: number;
  overall_rank: number;
}

interface CategoryRankDataPoint {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  category_id: string;
  rank: number;
  roto_points: number;
}

interface ProjectedOverallDataPoint {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  projected_overall_points: number;
  projected_overall_rank: number;
}

interface CategoryTotalDataPoint {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  category_id: string;
  value: number;
}

interface TransactionAnnotation {
  id: number;
  league_id: number;
  team_id: number;
  event_date: string;
  event_type: string;
  description: string;
  team_name?: string;
  players_added_details?: { id: number; name: string }[];
  players_dropped_details?: { id: number; name: string }[];
}

interface Team {
  id: number;
  name: string;
}

type ViewMode = "overall" | "category" | "projected" | "values";

export default function TrendsPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("overall");
  const [selectedCategory, setSelectedCategory] = useState<string>("AVG");
  const [selectedSeason, setSelectedSeason] = useState<string | undefined>(undefined);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showInflectionPoints, setShowInflectionPoints] = useState(true);
  const [fromDate, setFromDate] = useState<string | undefined>(undefined);
  const [toDate, setToDate] = useState<string | undefined>(undefined);

  // Load selected team from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      setSelectedTeamId(parseInt(stored, 10));
    }
  }, [leagueId]);

  // Fetch teams
  const { data: teamsData } = useQuery({
    queryKey: ["teams", leagueId],
    queryFn: async () => {
      return api.getTeams(parseInt(leagueId, 10)) as Promise<{
        teams: Team[];
      }>;
    },
    enabled: !!leagueId,
  });

  // Fetch available seasons
  const { data: seasonsData } = useQuery({
    queryKey: ["league-seasons", leagueId],
    queryFn: () => api.getLeagueSeasons(parseInt(leagueId, 10)),
    enabled: !!leagueId,
  });

  // Update fromDate/toDate when season changes
  useEffect(() => {
    if (selectedSeason) {
      setFromDate(`${selectedSeason}-01-01`);
      setToDate(`${selectedSeason}-12-31`);
    }
  }, [selectedSeason]);

  // Fetch overall standings time series
  const { data: overallData, isLoading: overallLoading } = useQuery({
    queryKey: ["timeseries-overall", leagueId, selectedSeason, fromDate, toDate],
    queryFn: async () => {
      return api.getOverallTimeSeries(parseInt(leagueId, 10), {
        season: selectedSeason,
        from: fromDate,
        to: toDate,
      }) as Promise<{
        series: OverallDataPoint[];
      }>;
    },
    enabled: !!leagueId && viewMode === "overall",
  });

  // Fetch category rank time series
  const { data: categoryData, isLoading: categoryLoading } = useQuery({
    queryKey: ["timeseries-category", leagueId, selectedCategory, selectedSeason, fromDate, toDate],
    queryFn: async () => {
      return api.getCategoryRankTimeSeries(
        parseInt(leagueId, 10),
        selectedCategory,
        {
          season: selectedSeason,
          from: fromDate,
          to: toDate,
        },
      ) as Promise<{ series: CategoryRankDataPoint[] }>;
    },
    enabled: !!leagueId && viewMode === "category",
  });

  // Fetch projected overall time series
  const { data: projectedData, isLoading: projectedLoading } = useQuery({
    queryKey: ["timeseries-projected", leagueId, selectedSeason, fromDate, toDate],
    queryFn: async () => {
      return api.getProjectedOverallTimeSeries(
        parseInt(leagueId, 10),
        {
          season: selectedSeason,
          from: fromDate,
          to: toDate,
        },
      ) as Promise<{ series: ProjectedOverallDataPoint[] }>;
    },
    enabled: !!leagueId && viewMode === "projected",
  });

  // Fetch category total (values) time series
  const { data: categoryTotalData, isLoading: categoryTotalLoading } = useQuery({
    queryKey: ["timeseries-category-total", leagueId, selectedCategory, selectedSeason, fromDate, toDate],
    queryFn: async () => {
      return api.getCategoryTotalTimeSeries(
        parseInt(leagueId, 10),
        selectedCategory,
        {
          season: selectedSeason,
          from: fromDate,
          to: toDate,
        },
      ) as Promise<{ series: CategoryTotalDataPoint[] }>;
    },
    enabled: !!leagueId && viewMode === "values",
  });

  // Fetch transaction annotations
  const { data: annotationsData } = useQuery({
    queryKey: ["annotations", leagueId, selectedTeamId, fromDate, toDate, selectedSeason],
    queryFn: async () => {
      return api.getAnnotations(parseInt(leagueId, 10), {
        teamIds: selectedTeamId ? String(selectedTeamId) : undefined,
        from: fromDate,
        to: toDate,
        season: selectedSeason,
      }) as Promise<{
        annotations: TransactionAnnotation[];
      }>;
    },
    enabled: showAnnotations && !!leagueId,
  });

  // Fetch inflection points (category-specific when viewing category rank chart)
  const inflectionCategory = viewMode === "category" ? selectedCategory : undefined;
  const { data: inflectionData } = useQuery({
    queryKey: ["inflection-points", leagueId, selectedTeamId, selectedSeason, fromDate, toDate, inflectionCategory],
    queryFn: () => api.getInflectionPoints(parseInt(leagueId, 10), selectedTeamId!, {
      season: selectedSeason,
      from: fromDate,
      to: toDate,
      limit: 5,
      categoryId: inflectionCategory,
    }),
    enabled: !!leagueId && !!selectedTeamId && (viewMode === "category" || viewMode === "overall"),
  });

  const teams = teamsData?.teams || [];
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  // Fetch league categories for dynamic category dropdown
  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ["league-categories", leagueId],
    queryFn: () => api.getLeagueCategories(parseInt(leagueId, 10)),
    enabled: !!leagueId,
  });

  const categories = (categoriesData?.categories || []).map((cat: any) => ({
    value: cat.stat_key || cat.category_id,
    label: cat.name,
  }));

  // Update selectedCategory when categories load if current selection is invalid
  useEffect(() => {
    if (categories.length > 0 && !categories.find((c: any) => c.value === selectedCategory)) {
      setSelectedCategory(categories[0].value);
    }
  }, [categories, selectedCategory]);

  // Transform data for charts
  const getChartData = () => {
    if (viewMode === "overall" && overallData) {
      const dateMap = new Map<string, any>();
      overallData.series.forEach((point) => {
        if (!dateMap.has(point.snapshot_date)) {
          dateMap.set(point.snapshot_date, { date: point.snapshot_date });
        }
        const teamName =
          teamMap.get(point.team_id) || `Team ${point.team_id}`;
        dateMap.get(point.snapshot_date)[teamName] = point.overall_rank;
        dateMap.get(point.snapshot_date)[`${teamName}_points`] = point.overall_points;
      });
      return Array.from(dateMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      );
    } else if (viewMode === "values" && categoryTotalData) {
      const dateMap = new Map<string, any>();
      categoryTotalData.series.forEach((point) => {
        if (!dateMap.has(point.snapshot_date)) {
          dateMap.set(point.snapshot_date, { date: point.snapshot_date });
        }
        const teamName =
          teamMap.get(point.team_id) || `Team ${point.team_id}`;
        dateMap.get(point.snapshot_date)[teamName] = point.value;
      });
      return Array.from(dateMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      );
    } else if (viewMode === "category" && categoryData) {
      const dateMap = new Map<string, any>();
      categoryData.series.forEach((point) => {
        if (!dateMap.has(point.snapshot_date)) {
          dateMap.set(point.snapshot_date, { date: point.snapshot_date });
        }
        const teamName =
          teamMap.get(point.team_id) || `Team ${point.team_id}`;
        dateMap.get(point.snapshot_date)[teamName] = point.rank;
      });
      return Array.from(dateMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      );
    } else if (viewMode === "projected" && projectedData) {
      const dateMap = new Map<string, any>();
      projectedData.series.forEach((point) => {
        if (!dateMap.has(point.snapshot_date)) {
          dateMap.set(point.snapshot_date, { date: point.snapshot_date });
        }
        const teamName =
          teamMap.get(point.team_id) || `Team ${point.team_id}`;
        dateMap.get(point.snapshot_date)[teamName] =
          point.projected_overall_rank;
      });
      return Array.from(dateMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      );
    }
    return [];
  };

  const chartData = getChartData();
  const isLoading = overallLoading || categoryLoading || projectedLoading || categoryTotalLoading || ((viewMode === "category" || viewMode === "values") && categoriesLoading);

  const teamNames =
    chartData.length > 0
      ? Object.keys(chartData[0]).filter((k) => k !== "date" && !k.endsWith("_points"))
      : [];

  const relevantAnnotations = annotationsData?.annotations || [];

  const tabClass = (active: boolean) =>
    cn(
      "whitespace-nowrap py-4 px-6 border-b-2 font-medium text-body-sm transition-colors",
      active
        ? "border-accent text-content font-semibold"
        : "border-transparent text-content-secondary hover:text-content hover:border-neutral-300"
    );

  return (
    <Container size="wide" className="py-8">
      <PageHeader
        title="Performance Trends"
        subtitle="Track standings and category performance over time for all teams in your league."
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
      />

      {/* View Mode Tabs */}
      <div className="bg-white shadow-card rounded-card border border-neutral-200 mb-6">
        <div className="border-b border-neutral-200">
          <div className="flex items-center justify-between">
            <nav className="-mb-px flex">
              <button
                onClick={() => setViewMode("overall")}
                className={tabClass(viewMode === "overall")}
              >
                Overall Standings
              </button>
              <button
                onClick={() => setViewMode("category")}
                className={tabClass(viewMode === "category")}
              >
                Category Rankings
              </button>
              <button
                onClick={() => setViewMode("projected")}
                className={tabClass(viewMode === "projected")}
              >
                Projected Standings
              </button>
              <button
                onClick={() => setViewMode("values")}
                className={tabClass(viewMode === "values")}
              >
                Category Values
              </button>
            </nav>

            {/* Season Selector */}
            <div className="pr-6">
              <select
                value={selectedSeason || ""}
                onChange={(e) => setSelectedSeason(e.target.value || undefined)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-body-sm bg-white text-content focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Current Season</option>
                {seasonsData?.seasons?.map((s: number) => (
                  <option key={s} value={String(s)}>
                    {s} Season
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Category selector for category view */}
        {(viewMode === "category" || viewMode === "values") && (
          <div className="p-6 border-b border-neutral-200">
            <label
              htmlFor="category-select"
              className="block text-body-sm font-medium text-content-secondary mb-2"
            >
              Select Category:
            </label>
            <select
              id="category-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={categoriesLoading}
              className="block w-full md:w-64 rounded-lg border border-neutral-300 bg-white text-content text-body-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {categories.map((cat: { value: string; label: string }) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Filter controls */}
        <div className="px-6 py-4 border-b border-neutral-200">
          <div className="flex flex-row gap-6 items-end">
            <DateRangeFilter
              onRangeChange={(from, to) => {
                setFromDate(from);
                setToDate(to);
              }}
              initialFrom={fromDate}
              initialTo={toDate}
            />

            <div className="flex items-center gap-4">
              <div className="flex items-center">
                <input
                  id="show-annotations"
                  type="checkbox"
                  checked={showAnnotations}
                  onChange={(e) => setShowAnnotations(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300 text-accent focus:ring-accent"
                />
                <label
                  htmlFor="show-annotations"
                  className="ml-2 block text-body-sm text-content-secondary"
                >
                  Show Transactions
                </label>
              </div>

              {selectedTeamId && (viewMode === "overall" || viewMode === "category") && (
                <div className="flex items-center">
                  <input
                    id="show-inflection-points"
                    type="checkbox"
                    checked={showInflectionPoints}
                    onChange={(e) => setShowInflectionPoints(e.target.checked)}
                    className="h-4 w-4 rounded border-neutral-300 text-accent focus:ring-accent"
                  />
                  <label
                    htmlFor="show-inflection-points"
                    className="ml-2 block text-body-sm text-content-secondary"
                  >
                    Show Inflection Points
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chart Display */}
      <div className="bg-white shadow-card rounded-card border border-neutral-200 p-6">
        {isLoading ? (
          <LoadingSpinner message="Loading chart data..." />
        ) : chartData.length > 0 ? (
          <div>
            <Heading level={3} className="mb-4">
              {viewMode === "overall" && "Overall Standings Over Time"}
              {viewMode === "category" &&
                `${categories.find((c: { value: string; label: string }) => c.value === selectedCategory)?.label} Rankings Over Time`}
              {viewMode === "projected" && "Projected Standings Over Time"}
              {viewMode === "values" &&
                `${categories.find((c: { value: string; label: string }) => c.value === selectedCategory)?.label} Values Over Time`}
            </Heading>

            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid
                    stroke={CHART_THEME.grid.stroke}
                    strokeDasharray={CHART_THEME.grid.strokeDasharray}
                  />
                  <XAxis
                    dataKey="date"
                    tick={CHART_THEME.axis.tick}
                    tickFormatter={(date) =>
                      new Date(date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    }
                  />
                  <YAxis
                    tick={CHART_THEME.axis.tick}
                    reversed={viewMode !== "values"}
                    domain={viewMode === "values" ? ["auto", "auto"] : [1, teamNames.length]}
                    label={{
                      value: viewMode === "values" ? selectedCategory : "Rank",
                      angle: -90,
                      position: "insideLeft",
                      ...CHART_THEME.axis.label,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: CHART_THEME.tooltip.backgroundColor,
                      borderColor: CHART_THEME.tooltip.borderColor,
                      borderRadius: CHART_THEME.tooltip.borderRadius,
                    }}
                    labelFormatter={(date) =>
                      new Date(date).toLocaleDateString(undefined, {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    }
                    formatter={(value: any, name: string, props: any) => {
                      if (viewMode === "values") {
                        const numVal = typeof value === "number" ? value : parseFloat(value);
                        const formatted = numVal < 1 && numVal > 0
                          ? numVal.toFixed(3)
                          : numVal % 1 !== 0
                          ? numVal.toFixed(2)
                          : String(numVal);
                        return [formatted, name];
                      }
                      if (viewMode === "overall") {
                        const points = props.payload?.[`${name}_points`];
                        return points != null ? [`Rank ${value} (${points} pts)`, name] : [`Rank ${value}`, name];
                      }
                      return [`Rank ${value}`, name];
                    }}
                  />
                  <Legend />

                  {teamNames.map((teamName, index) => {
                    const isSelected =
                      selectedTeamId &&
                      teamMap.get(selectedTeamId) === teamName;
                    return (
                      <Line
                        key={teamName}
                        type="monotone"
                        dataKey={teamName}
                        stroke={CHART_THEME.colors[index % CHART_THEME.colors.length]}
                        strokeWidth={isSelected ? 3 : 2}
                        opacity={isSelected ? 1 : 0.4}
                        dot={{ r: isSelected ? 4 : 2 }}
                        activeDot={{ r: 6 }}
                      />
                    );
                  })}

                  {/* Transaction annotations */}
                  {showAnnotations && relevantAnnotations.map((annotation) => (
                    <ReferenceLine
                      key={annotation.id}
                      x={annotation.event_date}
                      stroke={
                        annotation.event_type === "trade"
                          ? CHART_THEME.colors[5]
                          : annotation.event_type === "drop"
                          ? CHART_THEME.colors[4]
                          : CHART_THEME.colors[3]
                      }
                      strokeDasharray="3 3"
                      strokeOpacity={0.5}
                      label={<TransactionMarker annotation={annotation} />}
                    />
                  ))}

                  {/* Inflection point markers */}
                  {(viewMode === "overall" || viewMode === "category") && selectedTeamId && showInflectionPoints && inflectionData?.inflectionPoints?.map((ip: InflectionPoint) => (
                    <ReferenceLine
                      key={`ip-${ip.date}`}
                      x={ip.date}
                      stroke={ip.rankDelta != null ? (ip.rankDelta > 0 ? CHART_THEME.colors[3] : CHART_THEME.colors[4]) : (ip.pointsDelta != null && ip.pointsDelta > 0 ? CHART_THEME.colors[3] : CHART_THEME.colors[4])}
                      strokeDasharray="6 3"
                      strokeOpacity={0.6}
                      label={<InflectionPointMarker point={ip} />}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6 text-body-sm text-content-tertiary">
              <p>
                <strong>Note:</strong>{" "}
                {viewMode === "values"
                  ? "Shows cumulative stat values over the season."
                  : "Lower rank numbers are better (1st place = rank 1)."}
                {selectedTeamId &&
                  " Your team is highlighted with a thicker line."}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-content-tertiary"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <Heading level={3} className="mt-2 text-body-sm font-medium">
              No trend data available
            </Heading>
            <p className="mt-1 text-body-sm text-content-secondary">
              Trend data will appear after snapshots have been created for your
              league.
            </p>
          </div>
        )}
      </div>
    </Container>
  );
}
