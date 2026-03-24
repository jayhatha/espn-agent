"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner, LoadingSkeleton } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { TeamSelector } from "@/components/league/TeamSelector";
import { Container } from "@/components/ui/Container";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { CheckCircle, AlertTriangle, ArrowLeftRight, TrendingUp } from "lucide-react";

interface Team {
  id: number;
  name: string;
}

interface LineupRecommendation {
  slotName: string;
  benchPlayerId: number;
  benchPlayerName: string;
  benchPlayerPositions: string[];
  benchPlayerProjectedValue: number;
  starterPlayerId: number;
  starterPlayerName: string;
  starterPlayerPositions: string[];
  starterPlayerProjectedValue: number;
  projectedGain: number;
  reason: string;
}

interface LineupData {
  recommendations: LineupRecommendation[];
  totalProjectedGain: number;
  snapshotDate: string;
  isOptimal: boolean;
  generatedAt: string;
}

export default function LineupOptimizerPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  // Fetch teams
  const {
    data: teamsData,
    isLoading: teamsLoading,
    error: teamsError,
  } = useQuery({
    queryKey: ["league-teams", leagueId],
    queryFn: async () => {
      return api.getTeams(parseInt(leagueId, 10)) as Promise<{
        teams: Team[];
      }>;
    },
  });

  // Fetch lineup recommendations
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["lineup-recommendations", leagueId, selectedTeamId],
    queryFn: async () => {
      if (!selectedTeamId) {
        throw new Error("No team selected");
      }

      return api.getLineupRecommendations(
        parseInt(leagueId, 10),
        selectedTeamId
      ) as Promise<LineupData>;
    },
    enabled: !!selectedTeamId,
  });

  const handleTeamSelect = (teamId: number) => {
    setSelectedTeamId(teamId);
  };

  return (
    <Container className="py-8">
      <PageHeader
        title="Lineup Optimizer"
        subtitle="Daily start/sit recommendations based on today's MLB schedule and RoS projections"
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
      />

      {/* Team Selector */}
      <div className="mb-6">
        {teamsData && teamsData.teams.length > 0 ? (
          <TeamSelector
            leagueId={leagueId}
            teams={teamsData.teams}
            selectedTeamId={selectedTeamId}
            onSelect={handleTeamSelect}
            loading={teamsLoading}
            error={!!teamsError}
          />
        ) : teamsLoading ? (
          <TeamSelector
            leagueId={leagueId}
            teams={[]}
            selectedTeamId={null}
            onSelect={handleTeamSelect}
            loading={true}
          />
        ) : teamsError ? (
          <TeamSelector
            leagueId={leagueId}
            teams={[]}
            selectedTeamId={null}
            onSelect={handleTeamSelect}
            error={true}
          />
        ) : (
          <div className="text-body-sm text-content-secondary">
            No teams found. Create a snapshot to sync league data from ESPN.
          </div>
        )}
      </div>

      {/* Content */}
      {!selectedTeamId ? (
        <ErrorAlert
          variant="warning"
          message="Select a team to see lineup recommendations."
        />
      ) : isLoading ? (
        <Card>
          <CardContent>
            <LoadingSkeleton lines={5} />
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent>
            <ErrorAlert
              message={(error as Error).message}
              onRetry={() => refetch()}
            />
          </CardContent>
        </Card>
      ) : data ? (
        <div className="space-y-6">
          {/* Summary Banner */}
          {data.isOptimal ? (
            <Card className="border-positive-border bg-positive-light">
              <CardContent className="py-5">
                <div className="flex items-center">
                  <CheckCircle className="h-8 w-8 text-positive mr-3 flex-shrink-0" />
                  <div>
                    <h2 className="text-h3 font-semibold text-content dark:text-shell-text">
                      Your Lineup is Optimal!
                    </h2>
                    <p className="text-body-sm text-content-secondary mt-1">
                      No recommended changes for today's schedule.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-warning-border bg-warning-light">
              <CardContent className="py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertTriangle className="h-8 w-8 text-warning mr-3 flex-shrink-0" />
                    <div>
                      <h2 className="text-h3 font-semibold text-content dark:text-shell-text">
                        {data.recommendations.length} Recommended Swap
                        {data.recommendations.length !== 1 ? "s" : ""}
                      </h2>
                      <p className="text-body-sm text-content-secondary mt-1">
                        Projected gain: +{data.totalProjectedGain.toFixed(2)} SGP
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommendation Cards */}
          {!data.isOptimal && data.recommendations.length > 0 && (
            <div className="space-y-4">
              {data.recommendations.map((rec, idx) => (
                <Card key={`${rec.slotName}-${idx}`}>
                  <CardContent className="py-5">
                    {/* Slot Header */}
                    <div className="mb-4">
                      <h3 className="text-h4 font-semibold text-content dark:text-shell-text">
                        {rec.slotName}
                      </h3>
                    </div>

                    {/* Two-column layout */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                      {/* Bench Player (Start) */}
                      <div className="border-2 border-positive-border rounded-lg p-4 bg-positive-light">
                        <div className="flex items-center mb-2">
                          <Badge variant="positive" className="text-xs uppercase tracking-wide">
                            Start
                          </Badge>
                        </div>
                        <div className="font-bold text-lg text-content dark:text-shell-text mb-1">
                          {rec.benchPlayerName}
                        </div>
                        <div className="text-body-sm text-content-secondary mb-2">
                          {rec.benchPlayerPositions.join(", ")}
                        </div>
                        <div className="text-2xl font-bold font-mono text-positive">
                          {rec.benchPlayerProjectedValue.toFixed(2)}
                        </div>
                      </div>

                      {/* Arrow */}
                      <div className="flex justify-center">
                        <ArrowLeftRight className="w-8 h-8 text-content-tertiary rotate-90 md:rotate-0" />
                      </div>

                      {/* Starter Player (Sit) */}
                      <div className="border-2 border-negative-border rounded-lg p-4 bg-negative-light opacity-75">
                        <div className="flex items-center mb-2">
                          <Badge variant="negative" className="text-xs uppercase tracking-wide">
                            Sit
                          </Badge>
                        </div>
                        <div className="font-bold text-lg text-content dark:text-shell-text mb-1">
                          {rec.starterPlayerName}
                        </div>
                        <div className="text-body-sm text-content-secondary mb-2">
                          {rec.starterPlayerPositions.join(", ")}
                        </div>
                        <div className="text-2xl font-medium font-mono text-content-secondary">
                          {rec.starterPlayerProjectedValue.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Reason and Gain */}
                    <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-shell-border">
                      <p className="text-body-sm text-content-secondary mb-2">{rec.reason}</p>
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-positive-light border border-positive-border text-body-sm font-semibold text-positive">
                        <TrendingUp className="w-4 h-4 mr-1" />
                        +{rec.projectedGain.toFixed(2)} SGP
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Note */}
          <div className="text-body-sm text-content-tertiary text-center mt-6">
            Recommendations based on today's MLB schedule and rest-of-season
            projections. Snapshot date: {data.snapshotDate}
          </div>
        </div>
      ) : null}
    </Container>
  );
}
