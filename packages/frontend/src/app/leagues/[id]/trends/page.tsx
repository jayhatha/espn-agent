"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
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
import { useLeagueTeam } from "@/lib/hooks";
import { useChartTheme } from "@/lib/useChartTheme";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/Container";
import { Heading } from "@/components/ui/Heading";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { TransactionMarker } from "@/components/league/TransactionMarker";
import {
  InflectionPointMarker,
  type InflectionPoint,
} from "@/components/league/InflectionPointMarker";
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

interface HotColdPlayer {
  playerId: number;
  playerName: string;
  rosterSlot: string | null;
  rosterStatus: string;
  playerType: "hitter" | "pitcher";
  trend: "hot" | "cold" | "neutral" | "insufficient";
  drivingStat: string | null;
  sevenDay: {
    ops?: number;
    era?: number;
    whip?: number;
    kRate?: number;
    hr?: number;
    sb?: number;
    ab?: number;
    ip?: number;
  };
  season: {
    ops?: number;
    era?: number;
    whip?: number;
    kRate?: number;
    hr?: number;
    sb?: number;
    ab?: number;
    ip?: number;
  };
  ratios: {
    opsRatio?: number | null;
    eraRatio?: number | null;
    kRateRatio?: number | null;
  };
}

interface EfficiencyDay {
  date: string;
  benchProduction: {
    totalHR: number;
    totalSB: number;
    totalOPS: number | null;
    totalAB: number;
  };
  warnings: Array<{
    benchPlayerId: number;
    benchPlayerName: string;
    starterId: number;
    starterName: string;
    position: string;
    benchStat: { hr: number; ops: number | null };
    starterStat: { hr: number; ops: number | null };
    reason: string;
  }>;
}

type ViewMode =
  | "overall"
  | "category"
  | "projected"
  | "values"
  | "hotcold"
  | "efficiency";

function TrendBadge({
  trend,
  drivingStat,
}: {
  trend: string;
  drivingStat: string | null;
}) {
  if (trend === "hot") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-positive/10 text-positive border border-positive/20">
        <span className="text-positive">&#9650;</span> HOT
        {drivingStat && (
          <span className="ml-1 opacity-75">({drivingStat})</span>
        )}
      </span>
    );
  }
  if (trend === "cold") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-negative/10 text-negative border border-negative/20">
        <span className="text-negative">&#9660;</span> COLD
        {drivingStat && (
          <span className="ml-1 opacity-75">({drivingStat})</span>
        )}
      </span>
    );
  }
  if (trend === "insufficient") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-500/10 text-neutral-400 dark:bg-shell-border dark:text-shell-muted">
        ? Insufficient
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-500/10 text-neutral-400 dark:bg-shell-border dark:text-shell-muted">
      &#8212; Neutral
    </span>
  );
}

function formatRate(val: number | undefined, decimals = 3): string {
  if (val == null) return "-";
  return val < 1 && val >= 0 ? val.toFixed(decimals) : val.toFixed(2);
}

function formatPct(ratio: number | null | undefined): string {
  if (ratio == null) return "-";
  return `${Math.round(ratio * 100)}%`;
}

export default function TrendsPage() {
  const chartTheme = useChartTheme();
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId] = useLeagueTeam(leagueId);
  const [viewMode, setViewMode] = useState<ViewMode>("overall");
  const [selectedCategory, setSelectedCategory] = useState<string>("AVG");
  const [selectedSeason, setSelectedSeason] = useState<string | undefined>(
    undefined,
  );
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showInflectionPoints, setShowInflectionPoints] = useState(true);
  const [fromDate, setFromDate] = useState<string | undefined>(undefined);
  const [toDate, setToDate] = useState<string | undefined>(undefined);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Fetch teams
  const { data: teamsData } = useQuery({
    queryKey: ["league-teams", leagueId],
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
    queryKey: [
      "timeseries-overall",
      leagueId,
      selectedSeason,
      fromDate,
      toDate,
    ],
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
    queryKey: [
      "timeseries-category",
      leagueId,
      selectedCategory,
      selectedSeason,
      fromDate,
      toDate,
    ],
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
    queryKey: [
      "timeseries-projected",
      leagueId,
      selectedSeason,
      fromDate,
      toDate,
    ],
    queryFn: async () => {
      return api.getProjectedOverallTimeSeries(parseInt(leagueId, 10), {
        season: selectedSeason,
        from: fromDate,
        to: toDate,
      }) as Promise<{ series: ProjectedOverallDataPoint[] }>;
    },
    enabled: !!leagueId && viewMode === "projected",
  });

  // Fetch category total (values) time series
  const { data: categoryTotalData, isLoading: categoryTotalLoading } = useQuery(
    {
      queryKey: [
        "timeseries-category-total",
        leagueId,
        selectedCategory,
        selectedSeason,
        fromDate,
        toDate,
      ],
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
    },
  );

  // Fetch transaction annotations
  const { data: annotationsData } = useQuery({
    queryKey: [
      "annotations",
      leagueId,
      selectedTeamId,
      fromDate,
      toDate,
      selectedSeason,
    ],
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
  const inflectionCategory =
    viewMode === "category" ? selectedCategory : undefined;
  const { data: inflectionData } = useQuery({
    queryKey: [
      "inflection-points",
      leagueId,
      selectedTeamId,
      selectedSeason,
      fromDate,
      toDate,
      inflectionCategory,
    ],
    queryFn: () =>
      api.getInflectionPoints(parseInt(leagueId, 10), selectedTeamId!, {
        season: selectedSeason,
        from: fromDate,
        to: toDate,
        limit: 5,
        categoryId: inflectionCategory,
      }),
    enabled:
      !!leagueId &&
      !!selectedTeamId &&
      (viewMode === "category" || viewMode === "overall"),
  });

  // Hot/Cold trends
  const { data: hotColdData, isLoading: hotColdLoading } = useQuery({
    queryKey: ["hot-cold-trends", leagueId, selectedTeamId],
    queryFn: () =>
      api.getHotColdTrends(parseInt(leagueId, 10), selectedTeamId!, {
        days: 7,
      }),
    enabled: !!leagueId && !!selectedTeamId && viewMode === "hotcold",
  });

  // Lineup efficiency
  const { data: efficiencyData, isLoading: efficiencyLoading } = useQuery({
    queryKey: ["lineup-efficiency", leagueId, selectedTeamId],
    queryFn: () =>
      api.getLineupEfficiency(parseInt(leagueId, 10), selectedTeamId!, {
        days: 7,
      }),
    enabled: !!leagueId && !!selectedTeamId && viewMode === "efficiency",
  });

  const teams = teamsData?.teams || [];
  const teamMap = useMemo(
    () => new Map(teams.map((t) => [t.id, t.name])),
    [teams],
  );

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
    if (
      categories.length > 0 &&
      !categories.find((c: any) => c.value === selectedCategory)
    ) {
      setSelectedCategory(categories[0].value);
    }
  }, [categories, selectedCategory]);

  // Transform data for charts
  const chartData = useMemo(() => {
    if (viewMode === "overall" && overallData) {
      const dateMap = new Map<string, any>();
      overallData.series.forEach((point) => {
        if (!dateMap.has(point.snapshot_date)) {
          dateMap.set(point.snapshot_date, { date: point.snapshot_date });
        }
        const teamName = teamMap.get(point.team_id) || `Team ${point.team_id}`;
        dateMap.get(point.snapshot_date)[teamName] = point.overall_rank;
        dateMap.get(point.snapshot_date)[`${teamName}_points`] =
          point.overall_points;
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
        const teamName = teamMap.get(point.team_id) || `Team ${point.team_id}`;
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
        const teamName = teamMap.get(point.team_id) || `Team ${point.team_id}`;
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
        const teamName = teamMap.get(point.team_id) || `Team ${point.team_id}`;
        dateMap.get(point.snapshot_date)[teamName] =
          point.projected_overall_rank;
      });
      return Array.from(dateMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      );
    }
    return [];
  }, [
    viewMode,
    overallData,
    categoryTotalData,
    categoryData,
    projectedData,
    teamMap,
  ]);
  const isChartView =
    viewMode === "overall" ||
    viewMode === "category" ||
    viewMode === "projected" ||
    viewMode === "values";
  const isLoading =
    (viewMode === "overall" && overallLoading) ||
    (viewMode === "category" && categoryLoading) ||
    (viewMode === "projected" && projectedLoading) ||
    (viewMode === "values" && categoryTotalLoading) ||
    (viewMode === "hotcold" && hotColdLoading) ||
    (viewMode === "efficiency" && efficiencyLoading) ||
    ((viewMode === "category" || viewMode === "values") && categoriesLoading);

  const teamNames =
    chartData.length > 0
      ? Object.keys(chartData[0]).filter(
          (k) => k !== "date" && !k.endsWith("_points"),
        )
      : [];

  const relevantAnnotations = annotationsData?.annotations || [];

  const tabClass = (active: boolean) =>
    cn(
      "whitespace-nowrap py-4 px-6 border-b-2 font-medium text-body-sm transition-colors",
      active
        ? "border-accent dark:border-shell-accent text-content dark:text-shell-text font-semibold"
        : "border-transparent text-content-secondary dark:text-shell-muted hover:text-content dark:hover:text-shell-text hover:border-neutral-300 dark:hover:border-shell-border",
    );

  // Sort hot/cold players: hot first, then cold, then neutral, then insufficient
  const sortedHotColdPlayers = (() => {
    const players = (hotColdData?.players || []) as HotColdPlayer[];
    const order = { hot: 0, cold: 1, neutral: 2, insufficient: 3 };
    return [...players].sort((a, b) => {
      const ao = order[a.trend] ?? 4;
      const bo = order[b.trend] ?? 4;
      if (ao !== bo) return ao - bo;
      // Within same trend group, sort by deviation magnitude
      if (a.playerType === "hitter" && b.playerType === "hitter") {
        const aRatio = Math.abs(((a.ratios.opsRatio as number) ?? 1) - 1);
        const bRatio = Math.abs(((b.ratios.opsRatio as number) ?? 1) - 1);
        return bRatio - aRatio;
      }
      return 0;
    });
  })();

  const toggleDay = (date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  return (
    <Container size="wide" className="py-8">
      <PageHeader
        title="Performance Trends"
        subtitle="Track standings and category performance over time for all teams in your league."
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
      />

      {/* View Mode Tabs */}
      <div className="bg-white dark:bg-shell-panel shadow-card dark:shadow-none rounded-card border border-neutral-200 dark:border-shell-border mb-6">
        <div className="border-b border-neutral-200 dark:border-shell-border">
          <div className="flex items-center justify-between">
            <nav className="-mb-px flex flex-wrap">
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
              <button
                onClick={() => setViewMode("hotcold")}
                className={tabClass(viewMode === "hotcold")}
              >
                Hot/Cold Players
              </button>
              <button
                onClick={() => setViewMode("efficiency")}
                className={tabClass(viewMode === "efficiency")}
              >
                Lineup Efficiency
              </button>
            </nav>

            {/* Season Selector - only for chart views */}
            {isChartView && (
              <div className="pr-6">
                <select
                  value={selectedSeason || ""}
                  onChange={(e) =>
                    setSelectedSeason(e.target.value || undefined)
                  }
                  className="rounded-lg border border-neutral-300 dark:border-shell-border px-3 py-2 text-body-sm bg-white dark:bg-shell-bg text-content dark:text-shell-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <option value="">Current Season</option>
                  {seasonsData?.seasons?.map((s: number) => (
                    <option key={s} value={String(s)}>
                      {s} Season
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Category selector for category view */}
        {(viewMode === "category" || viewMode === "values") && (
          <div className="p-6 border-b border-neutral-200 dark:border-shell-border">
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
              className="block w-full md:w-64 rounded-lg border border-neutral-300 dark:border-shell-border bg-white dark:bg-shell-bg text-content dark:text-shell-text text-body-sm px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {categories.map((cat: { value: string; label: string }) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Filter controls - only for chart views */}
        {isChartView && (
          <div className="px-6 py-4 border-b border-neutral-200 dark:border-shell-border">
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
                    className="h-4 w-4 rounded border-neutral-300 text-accent dark:text-shell-accent focus:ring-accent dark:focus:ring-shell-accent"
                  />
                  <label
                    htmlFor="show-annotations"
                    className="ml-2 block text-body-sm text-content-secondary"
                  >
                    Show Transactions
                  </label>
                </div>

                {selectedTeamId &&
                  (viewMode === "overall" || viewMode === "category") && (
                    <div className="flex items-center">
                      <input
                        id="show-inflection-points"
                        type="checkbox"
                        checked={showInflectionPoints}
                        onChange={(e) =>
                          setShowInflectionPoints(e.target.checked)
                        }
                        className="h-4 w-4 rounded border-neutral-300 text-accent dark:text-shell-accent focus:ring-accent dark:focus:ring-shell-accent"
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
        )}
      </div>

      {/* Content Area */}
      <div className="bg-white dark:bg-shell-panel shadow-card dark:shadow-none rounded-card border border-neutral-200 dark:border-shell-border p-6">
        {isLoading ? (
          <LoadingSpinner quips />
        ) : viewMode === "hotcold" ? (
          /* ── Hot/Cold Players Panel ─────────────────────────── */
          !selectedTeamId ? (
            <div className="text-center py-12 text-content-secondary">
              <p>Select your team to view player trends.</p>
            </div>
          ) : hotColdData?.dataAvailable === false ? (
            <div className="text-center py-12 text-content-secondary">
              <p>
                Insufficient trend data. Player period stats will accumulate
                after daily snapshots run.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <Heading level={3}>7-Day Player Trends</Heading>
                {hotColdData?.snapshotDate && (
                  <span className="text-body-sm text-content-tertiary">
                    as of{" "}
                    {new Date(hotColdData.snapshotDate).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-shell-border text-content-secondary">
                      <th className="text-left py-3 px-3 font-medium">
                        Player
                      </th>
                      <th className="text-left py-3 px-3 font-medium">Pos</th>
                      <th className="text-left py-3 px-3 font-medium">Trend</th>
                      <th className="text-right py-3 px-3 font-medium">
                        7-Day
                      </th>
                      <th className="text-right py-3 px-3 font-medium">
                        Season
                      </th>
                      <th className="text-right py-3 px-3 font-medium">
                        vs Season
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHotColdPlayers.map((player) => (
                      <tr
                        key={player.playerId}
                        className="border-b border-neutral-100 dark:border-shell-border/50 dark:hover:bg-shell-bg transition-colors"
                      >
                        <td className="py-3 px-3 text-content dark:text-shell-text">
                          {player.playerName}
                        </td>
                        <td className="py-3 px-3 text-content-secondary text-xs uppercase">
                          {player.rosterSlot || "-"}
                        </td>
                        <td className="py-3 px-3">
                          <TrendBadge
                            trend={player.trend}
                            drivingStat={player.drivingStat}
                          />
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {player.playerType === "hitter" ? (
                            <span>
                              {formatRate(player.sevenDay.ops)} OPS
                              {player.sevenDay.hr != null && (
                                <span className="text-content-tertiary ml-2">
                                  {player.sevenDay.hr} HR
                                </span>
                              )}
                            </span>
                          ) : (
                            <span>
                              {formatRate(player.sevenDay.era, 2)} ERA
                              {player.sevenDay.kRate != null && (
                                <span className="text-content-tertiary ml-2">
                                  {formatRate(player.sevenDay.kRate, 2)} K/IP
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-content-tertiary text-xs">
                          {player.playerType === "hitter"
                            ? `${formatRate(player.season.ops)} OPS`
                            : `${formatRate(player.season.era, 2)} ERA`}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs">
                          {player.playerType === "hitter" ? (
                            <span
                              className={cn(
                                ((player.ratios.opsRatio as number) ?? 1) >
                                  1.1 && "text-positive",
                                ((player.ratios.opsRatio as number) ?? 1) <
                                  0.9 && "text-negative",
                              )}
                            >
                              {formatPct(
                                player.ratios.opsRatio as number | null,
                              )}
                            </span>
                          ) : (
                            <span
                              className={cn(
                                ((player.ratios.eraRatio as number) ?? 1) <
                                  0.9 && "text-positive",
                                ((player.ratios.eraRatio as number) ?? 1) >
                                  1.1 && "text-negative",
                              )}
                            >
                              {player.ratios.eraRatio != null
                                ? formatPct(
                                    player.ratios.eraRatio as number | null,
                                  )
                                : formatPct(
                                    player.ratios.kRateRatio as number | null,
                                  )}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : viewMode === "efficiency" ? (
          /* ── Lineup Efficiency Panel ────────────────────────── */
          !selectedTeamId ? (
            <div className="text-center py-12 text-content-secondary">
              <p>Select your team to view lineup efficiency.</p>
            </div>
          ) : efficiencyData?.dataAvailable === false ? (
            <div className="text-center py-12 text-content-secondary">
              <p>
                Insufficient data. Lineup efficiency will appear after daily
                snapshots run.
              </p>
            </div>
          ) : (
            <div>
              <Heading level={3} className="mb-4">
                Lineup Efficiency &mdash; Last 7 Days
              </Heading>

              <div className="space-y-3">
                {((efficiencyData?.days || []) as EfficiencyDay[]).map(
                  (day) => {
                    const isExpanded = expandedDays.has(day.date);
                    const hasWarnings = day.warnings.length > 0;

                    return (
                      <div
                        key={day.date}
                        className="border border-neutral-200 dark:border-shell-border rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() => toggleDay(day.date)}
                          className="w-full flex items-center justify-between p-4 dark:hover:bg-shell-bg transition-colors text-left"
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-body-sm font-medium text-content dark:text-shell-text">
                              {new Date(day.date).toLocaleDateString(
                                undefined,
                                {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                },
                              )}
                            </span>
                            <span className="text-body-sm font-mono text-content-secondary">
                              Bench: {day.benchProduction.totalHR} HR,{" "}
                              {day.benchProduction.totalSB} SB
                              {day.benchProduction.totalOPS != null && (
                                <>
                                  , {day.benchProduction.totalOPS.toFixed(3)}{" "}
                                  OPS
                                </>
                              )}{" "}
                              ({day.benchProduction.totalAB} AB)
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasWarnings ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning border border-warning/20">
                                {day.warnings.length} warning
                                {day.warnings.length !== 1 ? "s" : ""}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-positive/10 text-positive border border-positive/20">
                                No issues
                              </span>
                            )}
                            <span className="text-content-tertiary text-xs">
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-neutral-100 dark:border-shell-border/50">
                            {hasWarnings ? (
                              <div className="mt-3 space-y-2">
                                {day.warnings.map((w, idx) => (
                                  <div
                                    key={idx}
                                    className="p-3 rounded-md bg-warning/5 border border-warning/20 text-body-sm"
                                  >
                                    <span className="text-warning font-medium">
                                      {w.benchPlayerName}
                                    </span>
                                    <span className="text-content-secondary">
                                      {" "}
                                      (bench) outperformed{" "}
                                    </span>
                                    <span className="text-content dark:text-shell-text font-medium">
                                      {w.starterName}
                                    </span>
                                    <span className="text-content-secondary">
                                      {" "}
                                      ({w.position}):{" "}
                                    </span>
                                    <span className="font-mono text-warning text-xs">
                                      {w.reason}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-body-sm text-positive">
                                No lineup inefficiencies
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          )
        ) : chartData.length > 0 ? (
          /* ── Chart Views (Overall, Category, Projected, Values) ── */
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
                    stroke={chartTheme.grid.stroke}
                    strokeDasharray={chartTheme.grid.strokeDasharray}
                  />
                  <XAxis
                    dataKey="date"
                    tick={chartTheme.axis.tick}
                    tickFormatter={(date) =>
                      new Date(date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    }
                  />
                  <YAxis
                    tick={chartTheme.axis.tick}
                    reversed={viewMode !== "values"}
                    domain={
                      viewMode === "values"
                        ? ["auto", "auto"]
                        : [1, teamNames.length]
                    }
                    label={{
                      value: viewMode === "values" ? selectedCategory : "Rank",
                      angle: -90,
                      position: "insideLeft",
                      ...chartTheme.axis.label,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chartTheme.tooltip.backgroundColor,
                      borderColor: chartTheme.tooltip.borderColor,
                      borderRadius: chartTheme.tooltip.borderRadius,
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
                        const numVal =
                          typeof value === "number" ? value : parseFloat(value);
                        const formatted =
                          numVal < 1 && numVal > 0
                            ? numVal.toFixed(3)
                            : numVal % 1 !== 0
                              ? numVal.toFixed(2)
                              : String(numVal);
                        return [formatted, name];
                      }
                      if (viewMode === "overall") {
                        const points = props.payload?.[`${name}_points`];
                        return points != null
                          ? [`Rank ${value} (${points} pts)`, name]
                          : [`Rank ${value}`, name];
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
                        stroke={
                          chartTheme.colors[index % chartTheme.colors.length]
                        }
                        strokeWidth={isSelected ? 3 : 2}
                        opacity={isSelected ? 1 : 0.4}
                        dot={{ r: isSelected ? 4 : 2 }}
                        activeDot={{ r: 6 }}
                      />
                    );
                  })}

                  {/* Transaction annotations */}
                  {showAnnotations &&
                    relevantAnnotations.map((annotation) => (
                      <ReferenceLine
                        key={annotation.id}
                        x={annotation.event_date}
                        stroke={
                          annotation.event_type === "trade"
                            ? chartTheme.colors[5]
                            : annotation.event_type === "drop"
                              ? chartTheme.colors[4]
                              : chartTheme.colors[3]
                        }
                        strokeDasharray="3 3"
                        strokeOpacity={0.5}
                        label={<TransactionMarker annotation={annotation} />}
                      />
                    ))}

                  {/* Inflection point markers */}
                  {(viewMode === "overall" || viewMode === "category") &&
                    selectedTeamId &&
                    showInflectionPoints &&
                    inflectionData?.inflectionPoints?.map(
                      (ip: InflectionPoint) => (
                        <ReferenceLine
                          key={`ip-${ip.date}`}
                          x={ip.date}
                          stroke={
                            ip.rankDelta != null
                              ? ip.rankDelta > 0
                                ? chartTheme.colors[3]
                                : chartTheme.colors[4]
                              : ip.pointsDelta != null && ip.pointsDelta > 0
                                ? chartTheme.colors[3]
                                : chartTheme.colors[4]
                          }
                          strokeDasharray="6 3"
                          strokeOpacity={0.6}
                          label={<InflectionPointMarker point={ip} />}
                        />
                      ),
                    )}
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
