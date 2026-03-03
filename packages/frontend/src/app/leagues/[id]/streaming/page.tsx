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
import { FileText } from "lucide-react";

interface Team {
  id: number;
  name: string;
}

interface StreamingCandidate {
  playerId: number;
  playerName: string;
  mlbTeam: string;
  matchupOpponent: string;
  isHome: boolean;
  gameDate: string;
  compositeScore: number;
  projectionScore: number;
  matchupScore: number;
  multiStartBonus: number;
  weekStarts: number;
  ownershipPct: number | null;
}

interface StreamingData {
  candidates: StreamingCandidate[];
  dateRange: { start: string; end: string };
  totalCandidates: number;
  generatedAt: string;
}

export default function StreamingPitchersPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [lookAheadDays, setLookAheadDays] = useState(7);

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

  // Fetch streaming pitchers
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["streaming-pitchers", leagueId, selectedTeamId, lookAheadDays],
    queryFn: async () => {
      if (!selectedTeamId) {
        throw new Error("No team selected");
      }

      return api.getStreamingPitchers(parseInt(leagueId, 10), {
        teamId: selectedTeamId,
        lookAheadDays,
        limit: 20,
      }) as Promise<StreamingData>;
    },
    enabled: !!selectedTeamId,
  });

  const handleTeamSelect = (teamId: number) => {
    setSelectedTeamId(teamId);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getScoreVariant = (score: number): "positive" | "warning" | "default" => {
    if (score > 30) return "positive";
    if (score > 15) return "warning";
    return "default";
  };

  const getScoreClass = (score: number): string => {
    if (score > 30) return "text-positive";
    if (score > 15) return "text-warning";
    return "text-content-secondary";
  };

  return (
    <Container className="py-8">
      <PageHeader
        title="Streaming Pitchers"
        subtitle="Favorable matchup analysis for short-term pitcher adds"
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

      {/* Controls */}
      {selectedTeamId && (
        <div className="mb-6 flex items-center justify-between">
          <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-1 gap-1">
            {[1, 3, 7].map((days) => (
              <button
                key={days}
                onClick={() => setLookAheadDays(days)}
                className={cn(
                  "px-4 py-2 text-body-sm font-medium rounded-md transition-colors",
                  lookAheadDays === days
                    ? "bg-accent text-content-inverse shadow-sm"
                    : "text-content hover:bg-surface-secondary"
                )}
              >
                {days === 1 ? "1 Day" : days === 3 ? "3 Days" : "7 Days"}
              </button>
            ))}
          </div>

          {data && (
            <div className="text-body-sm text-content-secondary">
              Showing matchups: {formatDate(data.dateRange.start)} -{" "}
              {formatDate(data.dateRange.end)}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {!selectedTeamId ? (
        <ErrorAlert
          variant="warning"
          message="Select a team to see streaming pitcher recommendations."
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
      ) : data && data.candidates.length > 0 ? (
        <div className="space-y-4">
          {data.candidates.map((candidate, idx) => (
            <Card
              key={candidate.playerId}
              className="hover:shadow-lg transition-shadow"
            >
              <CardContent className="py-5">
                <div className="flex items-start gap-4">
                  {/* Rank Badge */}
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-12 w-12 rounded-full bg-accent text-content-inverse font-bold text-lg shadow-sm">
                      #{idx + 1}
                    </div>
                  </div>

                  {/* Player Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-h4 font-semibold text-content mb-1">
                          {candidate.playerName}
                        </h3>
                        <div className="flex items-center gap-2 text-body-sm text-content-secondary">
                          <span className="font-medium text-content">{candidate.mlbTeam}</span>
                          <span className="text-content-tertiary">•</span>
                          <span>
                            {candidate.isHome ? "vs." : "@"}{" "}
                            {candidate.matchupOpponent}
                          </span>
                          <span className="text-content-tertiary">•</span>
                          <span>{formatDate(candidate.gameDate)}</span>
                        </div>
                      </div>

                      {/* Composite Score */}
                      <div className="flex flex-col items-end">
                        <div
                          className={cn(
                            "text-3xl font-bold",
                            getScoreClass(candidate.compositeScore)
                          )}
                        >
                          {candidate.compositeScore.toFixed(0)}
                        </div>
                        <div className="text-body-sm text-content-tertiary">Score</div>
                      </div>
                    </div>

                    {/* Score Breakdown */}
                    <div className="flex flex-wrap gap-3 mb-3">
                      <Badge variant={getScoreVariant(candidate.projectionScore)}>
                        Projection: {candidate.projectionScore.toFixed(0)}
                      </Badge>
                      <Badge variant={getScoreVariant(candidate.matchupScore)}>
                        Matchup: {candidate.matchupScore.toFixed(0)}
                      </Badge>
                      {candidate.multiStartBonus > 0 && (
                        <Badge variant="info">
                          Multi-start: +{candidate.multiStartBonus.toFixed(0)}
                        </Badge>
                      )}
                    </div>

                    {/* Additional Badges */}
                    <div className="flex items-center gap-2">
                      {candidate.weekStarts >= 2 && (
                        <Badge variant="default" className="bg-accent text-content-inverse border-transparent">
                          {candidate.weekStarts}-Start Week
                        </Badge>
                      )}
                      {candidate.ownershipPct !== null && (
                        <Badge variant="default">
                          {candidate.ownershipPct.toFixed(1)}% Owned
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-surface-secondary rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-content-tertiary" />
            </div>
            <h3 className="text-h4 font-semibold text-content mb-2">
              No Streaming Candidates Found
            </h3>
            <p className="text-body-sm text-content-secondary mb-4">
              No streaming candidates found for this period. Try expanding the
              lookahead window.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Note */}
      {data && data.candidates.length > 0 && (
        <div className="text-body-sm text-content-tertiary text-center mt-6">
          Probable pitchers sourced from MLB StatsAPI. Pitchers may change before
          game time.
        </div>
      )}
    </Container>
  );
}
