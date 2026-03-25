"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { PlayerStatLine } from "@/components/league/PlayerStatLine";
import { calculateAVG, calculateOBP, calculateERA, calculateWHIP } from "@espn-fantasy/shared";
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

interface RosterPlayer {
  playerId: number;
  espnPlayerId: number;
  playerName: string;
  mlbTeam: string | null;
  positions: string[];
  rosterStatus: string;
  rosterSlot: string;
  projections: Record<string, number> | null;
  currentStats: Record<string, number> | null;
}

function isPitcher(positions: string[]): boolean {
  return positions.some((p) => ["SP", "RP", "P"].includes(p));
}

function formatStat(value: number | null | undefined, decimals = 0): string {
  if (value == null || isNaN(value)) return "--";
  return decimals === 0 ? String(Math.round(value)) : value.toFixed(decimals);
}

function formatRate(
  value: number | null | undefined,
  decimals: number,
  denominatorKey: string,
  components: Record<string, number>,
): string {
  const denom = components[denominatorKey] ?? 0;
  if (denom === 0) return "--";
  if (value == null || isNaN(value)) return "--";
  return value.toFixed(decimals);
}

export default function LineupOptimizerPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  // Load selected team from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) setSelectedTeamId(parsed);
    }
  }, [leagueId]);

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

  // Fetch roster for stats section
  const { data: rosterData } = useQuery({
    queryKey: ["roster", leagueId, selectedTeamId],
    queryFn: async () => {
      if (!selectedTeamId) throw new Error("No team selected");
      return api.getTeamRoster(
        parseInt(leagueId, 10),
        selectedTeamId,
      ) as Promise<{ roster: RosterPlayer[]; snapshotDate: string }>;
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

      {/* Roster Stats Section */}
      {selectedTeamId && rosterData?.roster && rosterData.roster.length > 0 && (
        <div className="mt-8 space-y-6">
          <h2 className="text-h4 font-medium dark:text-shell-text text-content">Your Roster</h2>

          {/* Hitters Table */}
          {(() => {
            const hitters = rosterData.roster.filter((p) => !isPitcher(p.positions));
            if (hitters.length === 0) return null;
            return (
              <Card>
                <CardContent>
                  <h3 className="text-data font-medium uppercase dark:text-shell-text text-content mb-3">
                    Hitters — Proj RoS
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left text-data font-medium text-content-secondary uppercase">Player</th>
                          <th className="px-3 py-2 text-left text-data font-medium text-content-secondary uppercase">Pos</th>
                          <th className="px-3 py-2 text-left text-data font-medium text-content-secondary uppercase">Team</th>
                          <th className="px-3 py-2 text-right text-data font-medium text-content-secondary uppercase">HR</th>
                          <th className="px-3 py-2 text-right text-data font-medium text-content-secondary uppercase">R</th>
                          <th className="px-3 py-2 text-right text-data font-medium text-content-secondary uppercase">RBI</th>
                          <th className="px-3 py-2 text-right text-data font-medium text-content-secondary uppercase">SB</th>
                          <th className="px-3 py-2 text-right text-data font-medium text-content-secondary uppercase">AVG</th>
                          <th className="px-3 py-2 text-right text-data font-medium text-content-secondary uppercase">OBP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
                        {hitters.map((player) => {
                          const proj = player.projections;
                          return (
                            <tr key={player.playerId}>
                              <td className="px-3 py-2 text-body-sm font-medium dark:text-shell-text text-content whitespace-nowrap">
                                {player.playerName}
                                {player.currentStats && (
                                  <div className="mt-0.5">
                                    <PlayerStatLine components={player.currentStats} label="YTD" positions={player.positions} />
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-data dark:text-shell-muted text-content-secondary whitespace-nowrap">
                                {player.positions.join(", ")}
                              </td>
                              <td className="px-3 py-2 text-data dark:text-shell-muted text-content-secondary whitespace-nowrap">
                                {player.mlbTeam || "--"}
                              </td>
                              <td className="px-3 py-2 text-right text-data font-mono dark:text-shell-muted text-content-secondary">
                                {proj ? formatStat(proj.HR) : "--"}
                              </td>
                              <td className="px-3 py-2 text-right text-data font-mono dark:text-shell-muted text-content-secondary">
                                {proj ? formatStat(proj.R) : "--"}
                              </td>
                              <td className="px-3 py-2 text-right text-data font-mono dark:text-shell-muted text-content-secondary">
                                {proj ? formatStat(proj.RBI) : "--"}
                              </td>
                              <td className="px-3 py-2 text-right text-data font-mono dark:text-shell-muted text-content-secondary">
                                {proj ? formatStat(proj.SB) : "--"}
                              </td>
                              <td className="px-3 py-2 text-right text-data font-mono dark:text-shell-muted text-content-secondary">
                                {proj ? formatRate(calculateAVG(proj), 3, "AB", proj) : "--"}
                              </td>
                              <td className="px-3 py-2 text-right text-data font-mono dark:text-shell-muted text-content-secondary">
                                {proj ? formatRate(calculateOBP(proj), 3, "AB", proj) : "--"}
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
          })()}

          {/* Pitchers Table */}
          {(() => {
            const pitchers = rosterData.roster.filter((p) => isPitcher(p.positions));
            if (pitchers.length === 0) return null;
            return (
              <Card>
                <CardContent>
                  <h3 className="text-data font-medium uppercase dark:text-shell-text text-content mb-3">
                    Pitchers — Proj RoS
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left text-data font-medium text-content-secondary uppercase">Player</th>
                          <th className="px-3 py-2 text-left text-data font-medium text-content-secondary uppercase">Pos</th>
                          <th className="px-3 py-2 text-left text-data font-medium text-content-secondary uppercase">Team</th>
                          <th className="px-3 py-2 text-right text-data font-medium text-content-secondary uppercase">W</th>
                          <th className="px-3 py-2 text-right text-data font-medium text-content-secondary uppercase">SV</th>
                          <th className="px-3 py-2 text-right text-data font-medium text-content-secondary uppercase">K</th>
                          <th className="px-3 py-2 text-right text-data font-medium text-content-secondary uppercase">ERA</th>
                          <th className="px-3 py-2 text-right text-data font-medium text-content-secondary uppercase">WHIP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
                        {pitchers.map((player) => {
                          const proj = player.projections;
                          const ip = proj?.IP ?? 0;
                          return (
                            <tr key={player.playerId}>
                              <td className="px-3 py-2 text-body-sm font-medium dark:text-shell-text text-content whitespace-nowrap">
                                {player.playerName}
                                {player.currentStats && (
                                  <div className="mt-0.5">
                                    <PlayerStatLine components={player.currentStats} label="YTD" positions={player.positions} />
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-data dark:text-shell-muted text-content-secondary whitespace-nowrap">
                                {player.positions.join(", ")}
                              </td>
                              <td className="px-3 py-2 text-data dark:text-shell-muted text-content-secondary whitespace-nowrap">
                                {player.mlbTeam || "--"}
                              </td>
                              <td className="px-3 py-2 text-right text-data font-mono dark:text-shell-muted text-content-secondary">
                                {proj ? formatStat(proj.W) : "--"}
                              </td>
                              <td className="px-3 py-2 text-right text-data font-mono dark:text-shell-muted text-content-secondary">
                                {proj ? formatStat(proj.SV) : "--"}
                              </td>
                              <td className="px-3 py-2 text-right text-data font-mono dark:text-shell-muted text-content-secondary">
                                {proj ? formatStat(proj.K) : "--"}
                              </td>
                              <td className="px-3 py-2 text-right text-data font-mono dark:text-shell-muted text-content-secondary">
                                {proj && ip > 0 ? calculateERA(proj).toFixed(2) : "--"}
                              </td>
                              <td className="px-3 py-2 text-right text-data font-mono dark:text-shell-muted text-content-secondary">
                                {proj && ip > 0 ? calculateWHIP(proj).toFixed(3) : "--"}
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
          })()}
        </div>
      )}
    </Container>
  );
}
