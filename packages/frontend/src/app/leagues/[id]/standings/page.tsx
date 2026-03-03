"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
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
}

interface CurrentOverallStanding {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  overall_points: number;
  overall_rank: number;
  teamName: string;
}

interface StandingsData {
  snapshotDate: string;
  categories: Category[];
  categoryStandings: CategoryStanding[];
  overallStandings: OverallStanding[];
  currentCategoryStandings: CurrentCategoryStanding[];
  currentOverallStandings: CurrentOverallStanding[];
}

type ViewMode = "current" | "projected";

export default function StandingsPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("current");

  useEffect(() => {
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      setSelectedTeamId(parseInt(stored, 10));
    }
  }, [leagueId]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["standings", leagueId],
    queryFn: async () => {
      return api.getProjectedStandings(
        parseInt(leagueId, 10),
      ) as Promise<StandingsData>;
    },
  });

  const buildCurrentMatrix = () => {
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
  };

  const buildProjectedMatrix = () => {
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
  };

  const currentMatrix = data ? buildCurrentMatrix() : null;
  const projectedMatrix = data ? buildProjectedMatrix() : null;

  const hasCurrentData = currentMatrix !== null;
  const hasProjectedData = projectedMatrix !== null;

  // Build overall standings table columns
  const overallColumns: StatsTableColumn[] = [
    {
      key: "rank",
      label: "Rank",
      align: "left",
      format: (val) => (
        <span className="font-medium text-content">{val}</span>
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
          <span className="font-medium text-content">{val}</span>
        </div>
      ),
    },
    {
      key: "points",
      label: "Total Roto Points",
      align: "right",
      format: (val) => (
        <span className="font-semibold text-data text-content">{Number(val)}</span>
      ),
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
  ) => {
    const numTeams = overallStandings.length;

    return (
      <Card>
        <CardHeader>
          <Heading level={3}>{title}</Heading>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-surface-secondary">
                <tr>
                  <th className="px-3 py-3 text-left text-data font-medium text-content-secondary uppercase tracking-wider sticky left-0 bg-surface-secondary z-10">
                    Team
                  </th>
                  {categories.map((cat) => (
                    <th
                      key={cat.category_id}
                      className="px-3 py-3 text-center text-data font-medium text-content-secondary uppercase tracking-wider min-w-[80px]"
                    >
                      {cat.name || cat.stat_key}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center text-data font-medium text-content-secondary uppercase tracking-wider font-bold">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-neutral-100">
                {overallStandings.map((team) => {
                  const isSelected = selectedTeamId === team.team_id;
                  const teamCats = teamCategoryMap.get(team.team_id);

                  return (
                    <tr
                      key={team.team_id}
                      className={cn(
                        "hover:bg-surface-secondary transition-colors",
                        isSelected ? "bg-accent-light" : "",
                      )}
                    >
                      <td className="px-3 py-3 whitespace-nowrap text-body-sm font-medium text-content sticky left-0 bg-inherit z-10">
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
                              className="px-3 py-3 text-center text-data text-content-tertiary"
                            >
                              -
                            </td>
                          );
                        }
                        return (
                          <td
                            key={cat.category_id}
                            className="px-3 py-3 text-center"
                          >
                            <div className="flex flex-col items-center">
                              <span className="text-data text-content font-medium">
                                {formatStatValue(catData[valueKey], cat.type, cat.stat_key)}
                              </span>
                              <span
                                className={`text-data rounded px-1 mt-0.5 ${getRankColor(catData[rankKey], numTeams)}`}
                              >
                                #{catData[rankKey]} ({Number(catData[pointsKey])}
                                pts)
                              </span>
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center text-data font-bold text-content">
                        {Number(team[overallPointsKey])}
                      </td>
                    </tr>
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
        <p className="mt-1 mb-6 text-body-sm text-content-secondary">
          As of snapshot: {data.snapshotDate}
        </p>
      )}

      {isLoading ? (
        <LoadingSpinner message="Loading standings..." />
      ) : error ? (
        <ErrorAlert message={(error as Error).message} />
      ) : hasCurrentData || hasProjectedData ? (
        <>
          {/* View Mode Tabs */}
          <div className="mb-6">
            <div className="border-b border-neutral-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setViewMode("current")}
                  className={cn(
                    "py-3 px-1 border-b-2 font-medium text-body-sm transition-colors",
                    viewMode === "current"
                      ? "border-accent text-content"
                      : "border-transparent text-content-secondary hover:text-content hover:border-neutral-300",
                  )}
                >
                  Current Standings
                </button>
                <button
                  onClick={() => setViewMode("projected")}
                  className={cn(
                    "py-3 px-1 border-b-2 font-medium text-body-sm transition-colors",
                    viewMode === "projected"
                      ? "border-accent text-content"
                      : "border-transparent text-content-secondary hover:text-content hover:border-neutral-300",
                  )}
                >
                  Projected Standings
                </button>
              </nav>
            </div>
          </div>

          {viewMode === "current" && currentMatrix ? (
            <>
              {/* Current Overall Standings */}
              <Card className="mb-8">
                <CardHeader>
                  <Heading level={3}>Current Overall Standings</Heading>
                </CardHeader>
                <CardContent className="p-0">
                  <StatsTable
                    columns={overallColumns}
                    data={currentMatrix.overallStandings.map((t) => ({
                      ...t,
                      rank: t.overall_rank,
                      points: t.overall_points,
                    }))}
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
              )}
            </>
          ) : viewMode === "current" && !currentMatrix ? (
            <Card>
              <CardContent>
                <div className="text-center py-12">
                  <Heading level={4} className="text-body-sm font-medium text-content mb-1">
                    No current standings available
                  </Heading>
                  <p className="text-body-sm text-content-secondary">
                    Current standings will appear after you create a snapshot.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {viewMode === "projected" && projectedMatrix ? (
            <>
              {/* Projected Overall Standings */}
              <Card className="mb-8">
                <CardHeader>
                  <Heading level={3}>Overall Projected Standings</Heading>
                </CardHeader>
                <CardContent className="p-0">
                  <StatsTable
                    columns={overallColumns}
                    data={projectedMatrix.overallStandings.map((t) => ({
                      ...t,
                      rank: t.projected_overall_rank,
                      points: t.projected_overall_points,
                    }))}
                    rowKey="team_id"
                    highlightRow={(row) => selectedTeamId === row.team_id}
                  />
                </CardContent>
              </Card>

              {/* Projected Category Breakdown */}
              {renderCategoryBreakdown(
                "Projected Category Breakdown",
                projectedMatrix.categories,
                projectedMatrix.overallStandings,
                projectedMatrix.teamCategoryMap,
                "projected_value",
                "projected_rank",
                "projected_roto_points",
                "projected_overall_points",
              )}
            </>
          ) : viewMode === "projected" && !projectedMatrix ? (
            <Card>
              <CardContent>
                <div className="text-center py-12">
                  <Heading level={4} className="text-body-sm font-medium text-content mb-1">
                    No projected standings available
                  </Heading>
                  <p className="text-body-sm text-content-secondary">
                    Projected standings will appear after projections are uploaded
                    and a snapshot is created. Contact your administrator if
                    projections are needed.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          <CardContent>
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
                  d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <Heading level={4} className="mt-2 text-body-sm font-medium text-content mb-1">
                No standings available
              </Heading>
              <p className="text-body-sm text-content-secondary">
                Standings will appear after you create a snapshot.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}
