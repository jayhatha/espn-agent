"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import ImpactBadge from "@/components/league/ImpactBadge";
import ImpactDetailCard from "@/components/league/ImpactDetailCard";

type TabView = "timeline" | "leaderboard" | "draft";
type MoveFilter = "all" | "draft" | "add_drop" | "trade";

interface MoveImpact {
  id: number;
  moveType: string;
  effectiveDate: string;
  impactRotoPoints: number;
  playerGained: { id: number; name: string; positions: string[] } | null;
  playerLost: { id: number; name: string; positions: string[] } | null;
  categoryImpacts: Array<{
    categoryId: string;
    actualValue: number;
    counterfactualValue: number;
    deltaRotoPoints: number;
  }>;
  isIncomplete: boolean;
}

interface DraftPick {
  playerId: number;
  playerName: string;
  positions: string[];
  impactRotoPoints: number;
  categoryImpacts: Array<{
    categoryId: string;
    actualValue: number;
    counterfactualValue: number;
    deltaRotoPoints: number;
  }>;
  keyStats: Record<string, number> | null;
  stillOnTeam: boolean;
  isIncomplete: boolean;
}

const MOVE_TYPE_LABELS: Record<string, string> = {
  draft: "Draft",
  add_drop: "Add/Drop",
  trade: "Trade",
};

const MOVE_TYPE_COLORS: Record<string, string> = {
  draft: "text-blue-600 bg-blue-50",
  add_drop: "text-green-600 bg-green-50",
  trade: "text-purple-600 bg-purple-50",
};

export default function MovesPage() {
  const params = useParams();
  const leagueId = parseInt(params.id as string, 10);

  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabView>("leaderboard");
  const [moveFilter, setMoveFilter] = useState<MoveFilter>("all");
  const [expandedMoveId, setExpandedMoveId] = useState<number | null>(null);
  const [season] = useState(2025);

  // Load team from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) setSelectedTeamId(parseInt(stored, 10));
  }, [leagueId]);

  // Fetch teams
  const { data: teamsData } = useQuery({
    queryKey: ["teams", leagueId],
    queryFn: () => api.getTeams(leagueId),
    enabled: !!leagueId,
  });

  // Fetch transaction impacts
  const { data: impactData, isLoading: impactLoading, error: impactError } = useQuery({
    queryKey: ["transaction-impacts", leagueId, selectedTeamId, season],
    queryFn: () => api.getTransactionImpacts(leagueId, selectedTeamId!, { season }),
    enabled: !!selectedTeamId,
  });

  // Fetch draft report
  const { data: draftData, isLoading: draftLoading } = useQuery({
    queryKey: ["draft-report", leagueId, selectedTeamId, season],
    queryFn: () => api.getDraftReport(leagueId, selectedTeamId!, season),
    enabled: !!selectedTeamId && activeTab === "draft",
  });

  // Fetch overall standings timeline for the chart
  const { data: timelineData } = useQuery({
    queryKey: ["timeline-overall", leagueId, season],
    queryFn: () => api.getOverallTimeSeries(leagueId, { season: String(season) }),
    enabled: !!leagueId && activeTab === "timeline",
  });

  const teams = teamsData?.teams || [];
  const impacts: MoveImpact[] = impactData?.impacts || [];
  const summary = impactData?.summary;

  const filteredImpacts =
    moveFilter === "all"
      ? impacts
      : impacts.filter((m) => m.moveType === moveFilter);

  const handleTeamChange = (teamId: number) => {
    setSelectedTeamId(teamId);
    localStorage.setItem(`league_${leagueId}_team`, String(teamId));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PageHeader
        title="Move Impact"
        subtitle="See which roster moves helped or hurt your season the most"
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
      />

      {/* Team Selector */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-sm font-medium text-gray-700">Team:</label>
          <select
            value={selectedTeamId || ""}
            onChange={(e) => handleTeamChange(parseInt(e.target.value, 10))}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
          >
            <option value="">Select a team</option>
            {teams.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {summary && (
            <div className="flex items-center gap-4 ml-auto text-sm">
              <span className="text-gray-500">{summary.totalMoves} moves</span>
              <span className="font-semibold">
                Roster Mgmt: <ImpactBadge impact={summary.netRosterValue ?? summary.sumOfIndividualImpacts} />
              </span>
            </div>
          )}
        </div>
      </div>

      {!selectedTeamId ? (
        <div className="text-center py-12 text-gray-500">
          Select a team to view move impact analysis
        </div>
      ) : impactLoading ? (
        <LoadingSpinner message="Loading impact data..." />
      ) : impactError ? (
        <ErrorAlert message="Failed to load impact data. Make sure impact computation has been run." />
      ) : (
        <>
          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-white shadow rounded-lg p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Total Moves</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{summary.totalMoves}</div>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Roster Mgmt Value</div>
                <div className="text-2xl font-bold mt-1">
                  {summary.netRosterValue !== null && summary.netRosterValue !== undefined ? (
                    <ImpactBadge impact={summary.netRosterValue} />
                  ) : (
                    <span className="text-gray-400">N/A</span>
                  )}
                </div>
                {summary.actualRotoPoints !== null && summary.draftOnlyRotoPoints !== null && (
                  <div className="text-xs text-gray-400 mt-1">
                    {summary.actualRotoPoints} actual vs {summary.draftOnlyRotoPoints} draft-only
                  </div>
                )}
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Avg Impact/Move</div>
                <div className="text-2xl font-bold mt-1">
                  <ImpactBadge impact={summary.avgImpactPerMove} />
                </div>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Best Move</div>
                <div className="text-sm font-semibold text-green-700 mt-1">
                  {summary.bestMove?.playerName || "N/A"}
                </div>
                {summary.bestMove && (
                  <ImpactBadge impact={summary.bestMove.impact} size="sm" />
                )}
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <div className="text-xs font-medium text-gray-500 uppercase">Worst Move</div>
                <div className="text-sm font-semibold text-red-700 mt-1">
                  {summary.worstMove?.playerName || "N/A"}
                </div>
                {summary.worstMove && (
                  <ImpactBadge impact={summary.worstMove.impact} size="sm" />
                )}
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="bg-white shadow rounded-lg mb-6">
            <nav className="-mb-px flex border-b border-gray-200">
              {(["leaderboard", "draft", "timeline"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`${
                    activeTab === tab
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
                >
                  {tab === "leaderboard" ? "Move Leaderboard" : tab === "draft" ? "Draft Report" : "Impact Timeline"}
                </button>
              ))}
            </nav>

            <div className="p-6">
              {activeTab === "leaderboard" && (
                <LeaderboardTab
                  impacts={filteredImpacts}
                  moveFilter={moveFilter}
                  setMoveFilter={setMoveFilter}
                  expandedMoveId={expandedMoveId}
                  setExpandedMoveId={setExpandedMoveId}
                />
              )}
              {activeTab === "draft" && (
                <DraftReportTab
                  draftPicks={draftData?.draftPicks || []}
                  summary={draftData?.summary}
                  isLoading={draftLoading}
                />
              )}
              {activeTab === "timeline" && (
                <TimelineTab
                  impacts={impacts}
                  timelineData={timelineData}
                  selectedTeamId={selectedTeamId}
                  teams={teams}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Leaderboard Tab ─────────────────────────────────────────

function LeaderboardTab({
  impacts,
  moveFilter,
  setMoveFilter,
  expandedMoveId,
  setExpandedMoveId,
}: {
  impacts: MoveImpact[];
  moveFilter: MoveFilter;
  setMoveFilter: (f: MoveFilter) => void;
  expandedMoveId: number | null;
  setExpandedMoveId: (id: number | null) => void;
}) {
  return (
    <div>
      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(["all", "draft", "add_drop", "trade"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setMoveFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              moveFilter === f
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f === "all" ? "All" : MOVE_TYPE_LABELS[f] || f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player Gained</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player Lost</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Impact</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Top Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {impacts.map((move) => {
              const topCat = move.categoryImpacts
                ?.filter((c) => c.deltaRotoPoints !== 0)
                .sort((a, b) => Math.abs(b.deltaRotoPoints) - Math.abs(a.deltaRotoPoints))[0];

              return (
                <tr key={move.id} className="group">
                  <td colSpan={6} className="p-0">
                    <div
                      className="px-4 py-3 cursor-pointer hover:bg-gray-50 grid grid-cols-6 items-center"
                      onClick={() => setExpandedMoveId(expandedMoveId === move.id ? null : move.id)}
                    >
                      <div className="text-sm text-gray-600">
                        {new Date(move.effectiveDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                      <div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${MOVE_TYPE_COLORS[move.moveType] || "text-gray-600 bg-gray-50"}`}>
                          {MOVE_TYPE_LABELS[move.moveType] || move.moveType}
                        </span>
                        {move.isIncomplete && (
                          <span className="ml-1 text-amber-500" title="Incomplete data">&#9888;</span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-gray-900">
                        {move.playerGained?.name || "—"}
                      </div>
                      <div className="text-sm text-gray-500">
                        {move.playerLost?.name || "—"}
                      </div>
                      <div className="text-right">
                        <ImpactBadge impact={move.impactRotoPoints} />
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        {topCat ? `${topCat.categoryId} (${topCat.deltaRotoPoints > 0 ? "+" : ""}${topCat.deltaRotoPoints})` : "—"}
                      </div>
                    </div>

                    {expandedMoveId === move.id && (
                      <div className="px-4 pb-3">
                        <ImpactDetailCard
                          playerGained={move.playerGained}
                          playerLost={move.playerLost}
                          moveType={move.moveType}
                          effectiveDate={move.effectiveDate}
                          impactRotoPoints={move.impactRotoPoints}
                          categoryImpacts={move.categoryImpacts}
                          isIncomplete={move.isIncomplete}
                          onClose={() => setExpandedMoveId(null)}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {impacts.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No moves found. Run impact computation from the admin panel first.
        </div>
      )}
    </div>
  );
}

// ─── Draft Report Tab ────────────────────────────────────────

function DraftReportTab({
  draftPicks,
  summary,
  isLoading,
}: {
  draftPicks: DraftPick[];
  summary?: {
    totalPicks: number;
    totalDraftValue: number;
    bestPick: { playerName: string; impact: number } | null;
    worstPick: { playerName: string; impact: number } | null;
  };
  isLoading: boolean;
}) {
  if (isLoading) return <LoadingSpinner message="Loading draft report..." />;

  return (
    <div>
      {/* Draft Summary */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-xs font-medium text-blue-600 uppercase">Total Picks</div>
            <div className="text-xl font-bold text-blue-900">{summary.totalPicks}</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-xs font-medium text-blue-600 uppercase">Total Draft Value</div>
            <div className="text-xl font-bold text-blue-900">{summary.totalDraftValue.toFixed(1)} pts</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-xs font-medium text-green-600 uppercase">Best Pick</div>
            <div className="text-sm font-semibold text-green-800">{summary.bestPick?.playerName}</div>
            {summary.bestPick && <ImpactBadge impact={summary.bestPick.impact} size="sm" />}
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="text-xs font-medium text-red-600 uppercase">Worst Pick</div>
            <div className="text-sm font-semibold text-red-800">{summary.worstPick?.playerName}</div>
            {summary.worstPick && <ImpactBadge impact={summary.worstPick.impact} size="sm" />}
          </div>
        </div>
      )}

      {/* Draft Picks Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pos</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Key Stats</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Roto Pts Value</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Still On Team</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {draftPicks.map((pick, idx) => (
              <tr key={pick.playerId} className={pick.stillOnTeam ? "" : "opacity-60"}>
                <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{pick.playerName}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{pick.positions?.join(", ")}</td>
                <td className="px-4 py-3 text-right text-xs text-gray-600">
                  {pick.keyStats && formatKeyStats(pick.keyStats)}
                </td>
                <td className="px-4 py-3 text-right">
                  <ImpactBadge impact={pick.impactRotoPoints} />
                </td>
                <td className="px-4 py-3 text-center">
                  {pick.stillOnTeam ? (
                    <span className="text-green-500">&#10003;</span>
                  ) : (
                    <span className="text-gray-300">&#10007;</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatKeyStats(stats: Record<string, number>): string {
  const parts: string[] = [];
  if (stats.R) parts.push(`${Math.round(stats.R)}R`);
  if (stats.HR) parts.push(`${Math.round(stats.HR)}HR`);
  if (stats.RBI) parts.push(`${Math.round(stats.RBI)}RBI`);
  if (stats.SB) parts.push(`${Math.round(stats.SB)}SB`);
  if (stats.K) parts.push(`${Math.round(stats.K)}K`);
  if (stats.W) parts.push(`${Math.round(stats.W)}W`);
  if (stats.SV) parts.push(`${Math.round(stats.SV)}SV`);
  if (parts.length === 0 && stats.H) parts.push(`${Math.round(stats.H)}H`);
  if (parts.length === 0 && stats.IP) parts.push(`${stats.IP.toFixed(1)}IP`);
  return parts.slice(0, 4).join(" / ");
}

// ─── Timeline Tab ────────────────────────────────────────────

const COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#14B8A6",
  "#D946EF", "#84CC16",
];

function TimelineTab({
  impacts,
  timelineData,
  selectedTeamId,
  teams,
}: {
  impacts: MoveImpact[];
  timelineData: any;
  selectedTeamId: number;
  teams: any[];
}) {
  if (!timelineData?.data?.length) {
    return (
      <div className="text-center py-8 text-gray-500">
        No timeline data available. View the Trends page for standings over time.
      </div>
    );
  }

  // Build chart data from timeline
  const chartData = timelineData.data.map((point: any) => ({
    date: point.snapshot_date,
    points: point.overall_points,
  }));

  const selectedTeam = teams.find((t: any) => t.id === selectedTeamId);
  const teamName = selectedTeam?.name || `Team ${selectedTeamId}`;

  // Map impacts to chart dates for annotation
  const impactsByDate = new Map<string, MoveImpact[]>();
  for (const m of impacts) {
    const date = m.effectiveDate;
    if (!impactsByDate.has(date)) impactsByDate.set(date, []);
    impactsByDate.get(date)!.push(m);
  }

  return (
    <div>
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(date) =>
                new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              }
            />
            <YAxis />
            <Tooltip
              labelFormatter={(label) => new Date(label).toLocaleDateString()}
              formatter={(value: number) => [`${value} pts`, teamName]}
            />
            <Line
              type="monotone"
              dataKey="points"
              stroke={COLORS[0]}
              strokeWidth={2}
              dot={false}
              name={teamName}
            />
            {/* Annotate move dates */}
            {Array.from(impactsByDate.entries()).map(([date, moves]) => {
              const dataPoint = chartData.find((d: any) => d.date === date);
              if (!dataPoint) return null;
              const netImpact = moves.reduce((s, m) => s + m.impactRotoPoints, 0);
              const color = netImpact > 0 ? "#10B981" : netImpact < 0 ? "#EF4444" : "#9CA3AF";
              return (
                <ReferenceDot
                  key={date}
                  x={date}
                  y={dataPoint.points}
                  r={6}
                  fill={color}
                  stroke="white"
                  strokeWidth={2}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend for annotations */}
      <div className="flex items-center gap-4 justify-center mt-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-green-500" /> Positive impact
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-red-500" /> Negative impact
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-gray-400" /> Neutral
        </span>
      </div>
    </div>
  );
}
