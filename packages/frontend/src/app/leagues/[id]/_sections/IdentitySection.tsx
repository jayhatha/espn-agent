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
  deltaRank: number | null;
  deltaPoints: number | null;
}

/** Simple relative time helper -- no library needed */
function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getSnapshotStatus(snapshot: LatestSnapshot | null): {
  label: string;
  color: string;
} {
  if (!snapshot) return { label: "No Data", color: "bg-neutral-400 text-white" };
  if (snapshot.is_degraded) return { label: "Degraded", color: "bg-negative text-white" };
  const age = Date.now() - new Date(snapshot.snapshot_date).getTime();
  if (age > 24 * 60 * 60 * 1000) return { label: "Stale", color: "bg-warning text-white" };
  return { label: "Live", color: "bg-positive text-white" };
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
  deltaRank,
  deltaPoints,
}: IdentitySectionProps) {
  const isPending = createSnapshotMutation.isPending;
  const status = getSnapshotStatus(latestSnapshot);

  return (
    <section className="bg-white dark:bg-shell-panel pt-6 pb-4">
      <Container size="wide">
        {/* Top utility row: back link + action buttons */}
        <div className="flex items-center justify-between mb-4">
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
          </div>
        </div>

        {/* Snapshot banner */}
        {showSnapshotBanner && (
          <div className="mb-4 bg-info-light border border-info-border rounded-lg p-4">
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

        {/* Team identity: shows when team is selected and data loaded */}
        {teamOverviewLoading ? (
          <div className="py-6">
            <LoadingSkeleton lines={3} />
          </div>
        ) : teamOverview ? (
          <>
            {/* Hero Card */}
            <div className="border-l-4 border-shell-accent bg-white dark:bg-shell-panel rounded-r-lg pl-5 pr-4 py-5 mb-3">
              {/* Team name */}
              <h1 className="text-h1 font-extrabold tracking-tight text-content dark:text-shell-text mb-4">
                {teamOverview.team.name}
              </h1>

              {/* Primary KPIs: Rank + Points + Delta */}
              {teamOverview.overall && (
                <div className="flex items-end gap-10">
                  <div>
                    <p className="text-caption uppercase tracking-widest text-content-tertiary mb-1">
                      Overall Rank
                    </p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-h2 font-bold font-mono text-content dark:text-shell-text leading-none">
                        {teamOverview.overall.overall_rank}
                      </p>
                      <span className="text-base font-sans font-normal text-content-tertiary">
                        / {teamOverview.overall.total_teams}
                      </span>
                      {deltaRank !== null && (
                        <span
                          className={cn(
                            "text-sm font-semibold font-mono ml-1",
                            deltaRank < 0
                              ? "text-positive"
                              : deltaRank > 0
                              ? "text-negative"
                              : "text-content-tertiary"
                          )}
                          title="Rank change vs yesterday (negative = improvement)"
                        >
                          {deltaRank < 0
                            ? `+${Math.abs(deltaRank)}`
                            : deltaRank > 0
                            ? `-${deltaRank}`
                            : "="}
                        </span>
                      )}
                      {deltaRank === null && (
                        <span className="text-sm text-content-tertiary ml-1">--</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-caption uppercase tracking-widest text-content-tertiary mb-1">
                      Total Points
                    </p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-h2 font-bold font-mono text-content dark:text-shell-text leading-none">
                        {Number(teamOverview.overall.overall_points)}
                      </p>
                      {deltaPoints !== null && (
                        <span
                          className={cn(
                            "text-sm font-semibold font-mono",
                            deltaPoints > 0
                              ? "text-positive"
                              : deltaPoints < 0
                              ? "text-negative"
                              : "text-content-tertiary"
                          )}
                        >
                          {deltaPoints > 0
                            ? `+${deltaPoints.toFixed(1)}`
                            : deltaPoints < 0
                            ? deltaPoints.toFixed(1)
                            : "="}
                        </span>
                      )}
                      {deltaPoints === null && (
                        <span className="text-sm text-content-tertiary">--</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Status Bar */}
            <div className="flex items-center gap-4 px-2 py-2 mb-2">
              {/* Last updated */}
              <span className="text-xs text-content-secondary dark:text-shell-muted">
                Updated {latestSnapshot ? relativeTime(latestSnapshot.snapshot_date) : "never"}
              </span>

              {/* Status pill */}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium transition-all duration-300",
                  status.color
                )}
              >
                {status.label}
              </span>

              {/* Refresh CTA -- compact pill */}
              <button
                onClick={() => createSnapshotMutation.mutate()}
                disabled={isPending}
                className="flex items-center gap-1 text-xs text-content-secondary dark:text-shell-muted hover:text-content dark:hover:text-shell-text transition-colors disabled:opacity-50"
              >
                <RefreshCwIcon
                  className={cn("h-3 w-3", isPending ? "animate-spin" : "")}
                />
                {isPending ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {/* Degraded reasons (small text, not a big banner) */}
            {latestSnapshot?.is_degraded &&
              latestSnapshot.degraded_reasons.length > 0 && (
                <p className="text-xs text-negative dark:text-negative px-2 mb-2">
                  {latestSnapshot.degraded_reasons
                    .map((r) => r.replace(/_/g, " "))
                    .join(", ")}
                </p>
              )}

            {/* Inline team selector */}
            {teamsData && teamsData.teams.length > 0 && (
              <div className="mt-2 mb-1">
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
          </>
        ) : (
          /* No team selected: show team selector as the primary CTA */
          <div className="mb-4">
            <h1 className="text-h1 font-extrabold tracking-tight text-content dark:text-shell-text mb-2">
              Season Snapshot &mdash; {league.season}
            </h1>
            <p className="text-body-sm text-content-tertiary mb-6">
              {league.name} &middot; Select your team to get started
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

        {/* Snapshot count info -- only shown when no snapshots yet */}
        {snapshotCount === 0 && (
          <div className="mt-4">
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
