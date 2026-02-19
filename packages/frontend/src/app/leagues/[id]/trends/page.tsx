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
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

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

interface TransactionAnnotation {
  id: number;
  league_id: number;
  team_id: number;
  event_date: string;
  event_type: string;
  description: string;
}

interface Team {
  id: number;
  name: string;
}

type ViewMode = "overall" | "category" | "projected";

const COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#a855f7", // violet
];

export default function TrendsPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("overall");
  const [selectedCategory, setSelectedCategory] = useState<string>("AVG");

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

  // Fetch overall standings time series
  const { data: overallData, isLoading: overallLoading } = useQuery({
    queryKey: ["timeseries-overall", leagueId],
    queryFn: async () => {
      return api.getOverallTimeSeries(parseInt(leagueId, 10)) as Promise<{
        series: OverallDataPoint[];
      }>;
    },
    enabled: !!leagueId && viewMode === "overall",
  });

  // Fetch category rank time series
  const { data: categoryData, isLoading: categoryLoading } = useQuery({
    queryKey: ["timeseries-category", leagueId, selectedCategory],
    queryFn: async () => {
      return api.getCategoryRankTimeSeries(
        parseInt(leagueId, 10),
        selectedCategory,
      ) as Promise<{ series: CategoryRankDataPoint[] }>;
    },
    enabled: !!leagueId && viewMode === "category",
  });

  // Fetch projected overall time series
  const { data: projectedData, isLoading: projectedLoading } = useQuery({
    queryKey: ["timeseries-projected", leagueId],
    queryFn: async () => {
      return api.getProjectedOverallTimeSeries(
        parseInt(leagueId, 10),
      ) as Promise<{ series: ProjectedOverallDataPoint[] }>;
    },
    enabled: !!leagueId && viewMode === "projected",
  });

  // Fetch transaction annotations
  const { data: annotationsData } = useQuery({
    queryKey: ["annotations", leagueId],
    queryFn: async () => {
      return api.getAnnotations(parseInt(leagueId, 10)) as Promise<{
        annotations: TransactionAnnotation[];
      }>;
    },
    enabled: !!leagueId,
  });

  const teams = teamsData?.teams || [];
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  const categories = [
    { value: "AVG", label: "Batting Average" },
    { value: "HR", label: "Home Runs" },
    { value: "R", label: "Runs" },
    { value: "RBI", label: "RBI" },
    { value: "SB", label: "Stolen Bases" },
    { value: "WHIP", label: "WHIP" },
    { value: "ERA", label: "ERA" },
    { value: "K", label: "Strikeouts" },
    { value: "W", label: "Wins" },
    { value: "SV", label: "Saves" },
    { value: "HLD", label: "Holds" },
  ];

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
  const isLoading = overallLoading || categoryLoading || projectedLoading;

  const teamNames =
    chartData.length > 0
      ? Object.keys(chartData[0]).filter((k) => k !== "date")
      : [];

  const relevantAnnotations = annotationsData?.annotations || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PageHeader
        title="Performance Trends"
        subtitle="Track standings and category performance over time for all teams in your league."
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
      />

      {/* View Mode Tabs */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex">
            <button
              onClick={() => setViewMode("overall")}
              className={`${
                viewMode === "overall"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
            >
              Overall Standings
            </button>
            <button
              onClick={() => setViewMode("category")}
              className={`${
                viewMode === "category"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
            >
              Category Rankings
            </button>
            <button
              onClick={() => setViewMode("projected")}
              className={`${
                viewMode === "projected"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
            >
              Projected Standings
            </button>
          </nav>
        </div>

        {/* Category selector for category view */}
        {viewMode === "category" && (
          <div className="p-6 border-b border-gray-200">
            <label
              htmlFor="category-select"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Select Category:
            </label>
            <select
              id="category-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="block w-full md:w-64 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
            >
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Chart Display */}
      <div className="bg-white shadow rounded-lg p-6">
        {isLoading ? (
          <LoadingSpinner message="Loading chart data..." />
        ) : chartData.length > 0 ? (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              {viewMode === "overall" && "Overall Standings Over Time"}
              {viewMode === "category" &&
                `${categories.find((c) => c.value === selectedCategory)?.label} Rankings Over Time`}
              {viewMode === "projected" && "Projected Standings Over Time"}
            </h2>

            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) =>
                      new Date(date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    }
                  />
                  <YAxis
                    reversed
                    domain={[1, teamNames.length]}
                    label={{
                      value: "Rank",
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <Tooltip
                    labelFormatter={(date) =>
                      new Date(date).toLocaleDateString(undefined, {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    }
                    formatter={(value: any) => [`Rank ${value}`, ""]}
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
                        stroke={COLORS[index % COLORS.length]}
                        strokeWidth={isSelected ? 3 : 2}
                        opacity={isSelected ? 1 : 0.4}
                        dot={{ r: isSelected ? 4 : 2 }}
                        activeDot={{ r: 6 }}
                      />
                    );
                  })}

                  {/* Transaction annotations */}
                  {relevantAnnotations.map((annotation) => (
                    <ReferenceLine
                      key={annotation.id}
                      x={annotation.event_date}
                      stroke="#9ca3af"
                      strokeDasharray="3 3"
                      label={{
                        value: annotation.event_type,
                        position: "top",
                        fontSize: 10,
                      }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6 text-xs text-gray-500">
              <p>
                <strong>Note:</strong> Lower rank numbers are better (1st place
                = rank 1).
                {selectedTeamId &&
                  " Your team is highlighted with a thicker line."}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
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
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No trend data available
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Trend data will appear after snapshots have been created for your
              league.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
