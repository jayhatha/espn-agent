"use client";

import Link from "next/link";
import { ChevronLeftIcon, KeyRoundIcon, RefreshCwIcon, Loader2Icon } from "lucide-react";
import { UseMutationResult } from "@tanstack/react-query";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { LoadingSkeleton } from "@/components/ui/LoadingSpinner";
import { TeamSelector } from "@/components/league/TeamSelector";
import { cn } from "@/lib/cn";

interface Team {
  id: number;
  league_id: number;
  espn_team_id: number;
  name: string;
  created_at: string;
}

interface TeamOverviewData {
  snapshotDate: string;
  team: { id: number; name: string };
  overall: {
    overall_points: number;
    overall_rank: number;
    total_teams: number;
  } | null;
  categories: unknown[];
  roster: unknown[];
}

interface LatestSnapshot {
  snapshot_date: string;
  is_degraded: boolean;
  degraded_reasons: string[];
}

interface IdentitySectionProps {
  league: {
    id: number;
    espn_league_id: number;
    season: number;
    name: string;
    timezone: string;
    user_team_id: number | null;
  };
  latestSnapshot: LatestSnapshot | null;
  snapshotCount: number;
  teamsData: { teams: Team[] } | undefined;
  teamsLoading: boolean;
  teamsError: boolean;
  selectedTeamId: number | null;
  onTeamSelect: (teamId: number) => void;
  autoDetectedTeamId: number | null;
  teamOverview: TeamOverviewData | undefined;
  teamOverviewLoading: boolean;
  showAuthModal: boolean;
  onShowAuthModal: (show: boolean) => void;
  createSnapshotMutation: UseMutationResult<unknown, unknown, void, unknown>;
  showSnapshotBanner: boolean;
  onDismissSnapshotBanner: () => void;
}

export function IdentitySection({
  league,
  latestSnapshot,
  snapshotCount,
  teamsData,
  teamsLoading,
  teamsError,
  selectedTeamId,
  onTeamSelect,
  autoDetectedTeamId,
  teamOverview,
  teamOverviewLoading,
  onShowAuthModal,
  createSnapshotMutation,
  showSnapshotBanner,
  onDismissSnapshotBanner,
}: IdentitySectionProps) {
  const isPending = createSnapshotMutation.isPending;

  return (
    <section className="bg-white pt-10 pb-8">
      <Container size="wide">
        {/* Top utility row: back link + action buttons */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/leagues"
            className="flex items-center gap-1 text-body-sm text-content-secondary hover:text-content transition-colors"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            {league.name}
          </Link>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onShowAuthModal(true)}
            >
              <KeyRoundIcon className="mr-1.5 h-4 w-4" />
              Update Auth
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => createSnapshotMutation.mutate()}
              disabled={isPending}
            >
              <RefreshCwIcon
                className={cn("mr-1.5 h-4 w-4", isPending ? "animate-spin" : "")}
              />
              {isPending ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>

        {/* Snapshot banner */}
        {showSnapshotBanner && (
          <div className="mb-6 bg-info-light border border-info-border rounded-lg p-4">
            <div className="flex items-start">
              <Loader2Icon className="h-5 w-5 text-info mt-0.5 mr-3 flex-shrink-0 animate-spin" />
              <div className="flex-1">
                <h3 className="text-body-sm font-medium text-info">
                  Initial snapshot in progress
                </h3>
                <p className="mt-1 text-body-sm text-info">
                  We&apos;re fetching your league data from ESPN. This may take a
                  minute. The page will update automatically when complete.
                </p>
                <button
                  onClick={onDismissSnapshotBanner}
                  className="mt-2 text-xs text-info hover:underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Degraded warning */}
        {latestSnapshot?.is_degraded &&
          latestSnapshot.degraded_reasons.length > 0 && (
            <div className="mb-6">
              <ErrorAlert
                variant="warning"
                message={`Snapshot Issues Detected: ${latestSnapshot.degraded_reasons.map((r) => r.replace(/_/g, " ")).join(", ")}`}
                onRetry={
                  !isPending
                    ? () => createSnapshotMutation.mutate()
                    : undefined
                }
              />
            </div>
          )}

        {/* Team identity: shows when team is selected and data loaded */}
        {teamOverviewLoading ? (
          <div className="py-8">
            <LoadingSkeleton lines={3} />
          </div>
        ) : teamOverview ? (
          <>
            {/* Team name — editorial scale, serif */}
            <h1 className="text-display font-display tracking-tight text-content mb-2">
              {teamOverview.team.name}
            </h1>
            <p className="text-body-sm text-content-tertiary mb-10">
              {league.name} &middot; Season {league.season} &middot;{" "}
              {teamOverview.snapshotDate.split("T")[0]}
            </p>

            {/* Rank + Points — oversized numerals, no box */}
            {teamOverview.overall && (
              <div className="flex items-end gap-12 mb-8">
                <div>
                  <p className="text-caption uppercase tracking-widest text-content-tertiary mb-1">
                    Overall Rank
                  </p>
                  <p className="text-h1 font-display text-content leading-none">
                    {teamOverview.overall.overall_rank}
                    <span className="text-h3 font-sans font-normal text-content-tertiary ml-2">
                      / {teamOverview.overall.total_teams}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-caption uppercase tracking-widest text-content-tertiary mb-1">
                    Total Points
                  </p>
                  <p className="text-h1 font-display text-content leading-none">
                    {Number(teamOverview.overall.overall_points)}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          /* No team selected: show team selector as the primary CTA */
          <div className="mb-8">
            <h1 className="text-h1 font-display tracking-tight text-content mb-2">
              {league.name}
            </h1>
            <p className="text-body-sm text-content-tertiary mb-8">
              Season {league.season} &middot; Select your team to get started
            </p>

            {teamsData && teamsData.teams.length > 0 ? (
              <TeamSelector
                leagueId={String(league.id)}
                teams={teamsData.teams}
                selectedTeamId={selectedTeamId}
                onSelect={onTeamSelect}
                autoDetectedTeamId={autoDetectedTeamId}
                loading={teamsLoading}
                error={teamsError}
              />
            ) : teamsLoading ? (
              <TeamSelector
                leagueId={String(league.id)}
                teams={[]}
                selectedTeamId={null}
                onSelect={onTeamSelect}
                loading={true}
              />
            ) : teamsError ? (
              <TeamSelector
                leagueId={String(league.id)}
                teams={[]}
                selectedTeamId={null}
                onSelect={onTeamSelect}
                error={true}
              />
            ) : (
              <div>
                <p className="text-body-sm text-content-secondary mb-4">
                  No teams found. Create a snapshot to sync league data from ESPN.
                </p>
                {createSnapshotMutation.isError && (
                  <div className="mb-4">
                    <ErrorAlert
                      message={(createSnapshotMutation.error as Error).message}
                    />
                  </div>
                )}
                <Button
                  onClick={() => createSnapshotMutation.mutate()}
                  disabled={isPending}
                >
                  {isPending ? (
                    <>
                      <Loader2Icon className="animate-spin -ml-1 mr-2 h-4 w-4" />
                      Creating Snapshot...
                    </>
                  ) : (
                    <>
                      <RefreshCwIcon className="-ml-1 mr-2 h-4 w-4" />
                      Create Snapshot
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Inline team selector when team is selected but not loading */}
        {selectedTeamId && !teamOverviewLoading && teamsData && teamsData.teams.length > 0 && (
          <div className="mt-6">
            <TeamSelector
              leagueId={String(league.id)}
              teams={teamsData.teams}
              selectedTeamId={selectedTeamId}
              onSelect={onTeamSelect}
              autoDetectedTeamId={autoDetectedTeamId}
              loading={teamsLoading}
              error={teamsError}
            />
          </div>
        )}

        {/* Snapshot count info — only shown when no snapshots yet */}
        {snapshotCount === 0 && (
          <div className="mt-6">
            <ErrorAlert
              variant="info"
              message={`Your league is connected! The first snapshot will be created at 03:00 ${league.timezone}. You can upload projections now to start getting recommendations.`}
            />
          </div>
        )}
      </Container>
    </section>
  );
}
