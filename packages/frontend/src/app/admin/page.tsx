"use client";

import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { AdminRoute } from "@/components/ProtectedRoute";
import { api } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { useAuth } from "@/contexts/AuthContext";
import { Container } from "@/components/ui/Container";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { cn } from "@/lib/cn";
import { Zap, Upload, Users, Settings, CheckCircle, ExternalLink } from "lucide-react";

interface User {
  id: number;
  email: string;
  display_name?: string;
  role: "user" | "admin";
  created_at: string;
  last_login_at?: string;
}

interface League {
  id: number;
  name: string;
  espn_league_id: number;
  season: number;
  snapshot_date?: string;
  status: "healthy" | "degraded" | "error";
  is_degraded?: boolean;
  degraded_reasons?: string[];
}

interface ProjectionRun {
  id: number;
  as_of_date: string;
  source: string;
  system: string;
  ingested_at: string;
  staleness: "fresh" | "stale" | "outdated";
}

interface BackfillJob {
  id: string;
  status: "completed" | "failed" | "active" | "waiting";
  data?: {
    leagueId?: number;
    season?: number;
  };
  progress?: {
    percentage?: number;
  };
  createdAt?: string;
}

interface BackfillJobResponse {
  jobId: string;
  message?: string;
}

function AdminPageContent() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [batterFile, setBatterFile] = useState<File | null>(null);
  const [pitcherFile, setPitcherFile] = useState<File | null>(null);
  const [batterDragActive, setBatterDragActive] = useState(false);
  const [pitcherDragActive, setPitcherDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Backfill state
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [season, setSeason] = useState<number>(new Date().getFullYear() - 1);
  const [startWeek, setStartWeek] = useState<number>(1);
  const [endWeek, setEndWeek] = useState<number>(28);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [clearExisting, setClearExisting] = useState<boolean>(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [backfillSuccess, setBackfillSuccess] = useState<string | null>(null);

  // Player pool sync state
  const [playerPoolSeason, setPlayerPoolSeason] = useState<number>(new Date().getFullYear());
  const [playerPoolError, setPlayerPoolError] = useState<string | null>(null);
  const [playerPoolSuccess, setPlayerPoolSuccess] = useState<string | null>(null);

  // System stats query
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.getAdminStats(),
    refetchInterval: 30000, // 30 seconds
  });

  // Users query
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.getAdminUsers(),
  });

  // League health query
  const { data: leaguesData, isLoading: leaguesLoading } = useQuery({
    queryKey: ["admin", "leagues"],
    queryFn: () => api.getAdminLeagues(),
  });

  // Projections history query
  const { data: projectionsData, isLoading: projectionsLoading } = useQuery({
    queryKey: ["projections"],
    queryFn: () => api.getProjections(),
  });

  // Backfill jobs query
  const { data: backfillJobsData } = useQuery({
    queryKey: ["backfill-jobs"],
    queryFn: () => api.getBackfillJobs(),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Active job status query (only when activeJobId is set)
  const { data: activeJobData } = useQuery({
    queryKey: ["backfill-job", activeJobId],
    queryFn: () => api.getBackfillJobStatus(activeJobId!),
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 2000;
    },
  });

  // Role update mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: "user" | "admin" }) => {
      return api.updateUserRole(userId, role);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: { batter: File | null; pitcher: File | null }) => {
      // Upload files sequentially
      const results = [];
      if (files.batter) {
        results.push(await api.uploadProjections(files.batter));
      }
      if (files.pitcher) {
        results.push(await api.uploadProjections(files.pitcher));
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projections"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      setUploadSuccess("Projections uploaded successfully!");
      setUploadError(null);
      setBatterFile(null);
      setPitcherFile(null);
    },
    onError: (error: Error) => {
      setUploadError(error.message);
      setUploadSuccess(null);
    },
  });

  // Backfill mutation
  const backfillMutation = useMutation({
    mutationFn: async (data: { leagueId: number; season: number; startWeek: number; endWeek: number; clearExisting: boolean }) => {
      return api.triggerBackfill(data.leagueId, {
        season: data.season,
        startWeek: data.startWeek,
        endWeek: data.endWeek,
        clearExisting: data.clearExisting,
      });
    },
    onSuccess: (data: BackfillJobResponse) => {
      setActiveJobId(data.jobId);
      setBackfillSuccess(`Backfill job started: ${data.message || data.jobId}`);
      setBackfillError(null);
      queryClient.invalidateQueries({ queryKey: ["backfill-jobs"] });
    },
    onError: (error: Error) => {
      setBackfillError(error.message);
      setBackfillSuccess(null);
    },
  });

  // Player pool sync mutation
  const playerPoolSyncMutation = useMutation({
    mutationFn: async (season: number) => {
      return api.triggerPlayerPoolSync(season);
    },
    onSuccess: (data: any) => {
      setPlayerPoolSuccess(`Player pool sync started: ${data.message || data.jobId}`);
      setPlayerPoolError(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
    onError: (error: Error) => {
      setPlayerPoolError(error.message);
      setPlayerPoolSuccess(null);
    },
  });

  const handleRoleToggle = (userId: number, currentRole: "user" | "admin", email: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    if (window.confirm(`Change ${email} role to ${newRole}?`)) {
      updateRoleMutation.mutate({ userId, role: newRole });
    }
  };

  const handleBatterDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setBatterDragActive(true);
    } else if (e.type === "dragleave") {
      setBatterDragActive(false);
    }
  };

  const handlePitcherDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setPitcherDragActive(true);
    } else if (e.type === "dragleave") {
      setPitcherDragActive(false);
    }
  };

  const handleBatterDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBatterDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setBatterFile(e.dataTransfer.files[0]);
    }
  };

  const handlePitcherDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPitcherDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setPitcherFile(e.dataTransfer.files[0]);
    }
  };

  const handleBatterFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setBatterFile(e.target.files[0]);
    }
  };

  const handlePitcherFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPitcherFile(e.target.files[0]);
    }
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (batterFile || pitcherFile) {
      uploadMutation.mutate({ batter: batterFile, pitcher: pitcherFile });
    }
  };

  const handleBackfillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeagueId) {
      setBackfillError("Please select a league");
      return;
    }
    if (startWeek > endWeek) {
      setBackfillError("Start week must be less than or equal to end week");
      return;
    }
    backfillMutation.mutate({
      leagueId: selectedLeagueId,
      season,
      startWeek,
      endWeek,
      clearExisting,
    });
  };

  const getJobStatusVariant = (status: string): "positive" | "negative" | "info" | "warning" => {
    if (status === "completed") return "positive";
    if (status === "failed") return "negative";
    if (status === "active") return "info";
    return "warning";
  };

  const getStalenessVariant = (staleness: string): "positive" | "warning" | "negative" => {
    if (staleness === "fresh") return "positive";
    if (staleness === "stale") return "warning";
    return "negative";
  };

  const getLeagueStatusVariant = (status: string): "positive" | "warning" | "negative" => {
    if (status === "healthy") return "positive";
    if (status === "degraded") return "warning";
    return "negative";
  };

  return (
    <Container size="wide" className="py-8">
      {/* Page Header */}
      <div className="mb-8">
        <Heading level={1} className="flex items-center">
          <Zap className="mr-3 h-8 w-8 text-accent" />
          Admin Dashboard
        </Heading>
        <p className="mt-2 text-body-sm text-content-secondary dark:text-shell-muted">
          Manage projections, users, and system health
        </p>
      </div>

      {/* System Health KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statsLoading ? (
          <div className="col-span-4 flex items-center justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <>
            <StatCard
              label="Total Users"
              value={statsData?.userCount || 0}
            />
            <StatCard
              label="Active Leagues"
              value={statsData?.leagueCount || 0}
            />
            <StatCard
              label="Snapshot Health"
              value={`${statsData?.snapshotStats?.successRate || 0}%`}
              subtitle={`${statsData?.snapshotStats?.healthy || 0} of ${statsData?.snapshotStats?.total || 0} healthy (7d)`}
            />
            <StatCard
              label="Latest Projections"
              value={statsData?.latestProjection?.as_of_date || "None"}
              subtitle={
                statsData?.latestProjection?.staleness === "fresh"
                  ? "Fresh"
                  : statsData?.latestProjection?.staleness === "stale"
                    ? "Stale"
                    : "Very stale"
              }
            />
          </>
        )}
      </div>

      {/* User Management */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <Heading level={2} className="flex items-center gap-2">
              <Users className="h-5 w-5 text-content-secondary dark:text-shell-muted" />
              Users
            </Heading>
            {usersData?.users && (
              <Badge variant="default">
                {usersData.users.length} total
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : !usersData?.users || usersData.users.length === 0 ? (
            <p className="text-center py-8 text-body-sm text-content-secondary dark:text-shell-muted">No users found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-100 dark:divide-shell-border">
                <thead className="bg-surface-secondary dark:bg-shell-bg">
                  <tr>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      Display Name
                    </th>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      Last Login
                    </th>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-shell-panel divide-y divide-neutral-100 dark:divide-shell-border">
                  {usersData.users.map((user: User) => {
                    const isSelf = currentUser?.id === user.id;
                    return (
                      <tr key={user.id} className="hover:bg-surface-secondary dark:hover:bg-shell-bg transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content dark:text-shell-text">
                          {user.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content-secondary dark:text-shell-muted">
                          {user.display_name || "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-body-sm">
                          <Badge
                            variant={user.role === "admin" ? "info" : "default"}
                          >
                            {user.role}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content-secondary dark:text-shell-muted">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content-secondary dark:text-shell-muted">
                          {user.last_login_at
                            ? new Date(user.last_login_at).toLocaleDateString()
                            : "Never"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-body-sm">
                          <Button
                            variant={user.role === "admin" ? "danger" : "secondary"}
                            size="sm"
                            onClick={() => handleRoleToggle(user.id, user.role, user.email)}
                            disabled={isSelf || updateRoleMutation.isPending}
                            title={isSelf ? "Cannot change own role" : ""}
                          >
                            {user.role === "admin" ? "Remove Admin" : "Make Admin"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Projections Section */}
      <Card className="mb-8">
        <CardHeader>
          <Heading level={2} className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-content-secondary dark:text-shell-muted" />
            Upload Projections
          </Heading>
          <p className="text-body-sm text-content-secondary dark:text-shell-muted mt-1">
            Upload FanGraphs Depth Charts RoS projections. Upload both batter and pitcher files together.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUploadSubmit} className="space-y-6">
            {/* Two Drop Zones */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Batter CSV Drop Zone */}
              <div>
                <label className="block text-body-sm font-medium text-content dark:text-shell-text mb-2">
                  Batters CSV
                </label>
                <div
                  className={cn(
                    "relative border-2 border-dashed rounded-card p-6 text-center transition-colors",
                    batterDragActive
                      ? "border-accent bg-accent-light"
                      : "border-neutral-300 dark:border-shell-border bg-surface-secondary dark:bg-shell-bg"
                  )}
                  onDragEnter={handleBatterDrag}
                  onDragLeave={handleBatterDrag}
                  onDragOver={handleBatterDrag}
                  onDrop={handleBatterDrop}
                >
                  <input
                    type="file"
                    id="batter-upload"
                    accept=".csv"
                    onChange={handleBatterFileChange}
                    className="sr-only"
                  />
                  <label htmlFor="batter-upload" className="cursor-pointer">
                    <Upload className="mx-auto h-10 w-10 text-content-tertiary" />
                    <p className="mt-2 text-body-sm font-medium text-content dark:text-shell-text">
                      {batterFile ? batterFile.name : "Drop batters CSV or click"}
                    </p>
                  </label>
                </div>
              </div>

              {/* Pitcher CSV Drop Zone */}
              <div>
                <label className="block text-body-sm font-medium text-content dark:text-shell-text mb-2">
                  Pitchers CSV
                </label>
                <div
                  className={cn(
                    "relative border-2 border-dashed rounded-card p-6 text-center transition-colors",
                    pitcherDragActive
                      ? "border-accent bg-accent-light"
                      : "border-neutral-300 dark:border-shell-border bg-surface-secondary dark:bg-shell-bg"
                  )}
                  onDragEnter={handlePitcherDrag}
                  onDragLeave={handlePitcherDrag}
                  onDragOver={handlePitcherDrag}
                  onDrop={handlePitcherDrop}
                >
                  <input
                    type="file"
                    id="pitcher-upload"
                    accept=".csv"
                    onChange={handlePitcherFileChange}
                    className="sr-only"
                  />
                  <label htmlFor="pitcher-upload" className="cursor-pointer">
                    <Upload className="mx-auto h-10 w-10 text-content-tertiary" />
                    <p className="mt-2 text-body-sm font-medium text-content dark:text-shell-text">
                      {pitcherFile ? pitcherFile.name : "Drop pitchers CSV or click"}
                    </p>
                  </label>
                </div>
              </div>
            </div>

            {uploadSuccess && (
              <div className="bg-positive-light border border-positive-border rounded-card p-4">
                <p className="text-body-sm font-medium text-positive">{uploadSuccess}</p>
              </div>
            )}

            {uploadError && (
              <div className="bg-negative-light border border-negative-border rounded-card p-4">
                <h3 className="text-negative font-medium text-body-sm">Upload Failed</h3>
                <p className="text-negative text-body-sm mt-1">{uploadError}</p>
              </div>
            )}

            <div className="flex items-center justify-center mt-4">
              <Button
                type="submit"
                variant="primary"
                className="w-full sm:w-auto"
                disabled={(!batterFile && !pitcherFile) || uploadMutation.isPending}
              >
                {uploadMutation.isPending ? "Uploading..." : "Upload Projections"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Instructions */}
      <div className="bg-info-light border border-info-border rounded-card p-6 mb-8">
        <h3 className="flex items-center text-body-sm font-medium text-info mb-3">
          <Settings className="mr-2 h-5 w-5" />
          How to export FanGraphs projections:
        </h3>
        <ol className="text-body-sm text-info space-y-2 ml-7 list-decimal">
          <li>
            Go to{" "}
            <a
              href="https://www.fangraphs.com/projections.aspx?pos=all&stats=bat&type=fangraphsdc"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80"
            >
              FanGraphs Depth Charts (Hitters)
            </a>
          </li>
          <li>Click "Export Data" and download the CSV file</li>
          <li>
            Repeat for{" "}
            <a
              href="https://www.fangraphs.com/projections.aspx?pos=all&stats=pit&type=fangraphsdc"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80"
            >
              Pitchers
            </a>
          </li>
          <li>Upload both files using the drop zones above</li>
        </ol>
        <p className="mt-3 text-body-sm text-info opacity-75">
          Note: You need a FanGraphs subscription to access Depth Charts projections.
        </p>
      </div>

      {/* Player Pool Sync */}
      <Card className="mb-8">
        <CardHeader>
          <Heading level={2}>Player Pool Sync</Heading>
          <p className="text-body-sm text-content-secondary dark:text-shell-muted mt-1">
            Sync top ~500 rostered players from ESPN to populate the player pool for draft recommendations.
            This runs automatically at 4 AM ET daily, but you can trigger it manually here.
          </p>
        </CardHeader>
        <CardContent>
          {playerPoolSuccess && (
            <div className="mb-4 bg-positive-light border border-positive-border text-positive px-4 py-3 rounded-card text-body-sm">
              {playerPoolSuccess}
            </div>
          )}

          {playerPoolError && (
            <div className="mb-4 bg-negative-light border border-negative-border text-negative px-4 py-3 rounded-card text-body-sm">
              {playerPoolError}
            </div>
          )}

          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-body-sm font-medium text-content dark:text-shell-text mb-2">
                Season
              </label>
              <input
                type="number"
                value={playerPoolSeason}
                onChange={(e) => setPlayerPoolSeason(parseInt(e.target.value, 10))}
                className="flex h-10 w-full rounded-lg border border-neutral-300 dark:border-shell-border bg-white dark:bg-shell-panel px-3 py-2 text-body-sm text-content dark:text-shell-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus:ring-shell-accent focus-visible:ring-offset-2"
                min="2020"
                max={new Date().getFullYear() + 1}
              />
            </div>
            <Button
              type="button"
              variant="primary"
              onClick={() => playerPoolSyncMutation.mutate(playerPoolSeason)}
              disabled={playerPoolSyncMutation.isPending}
            >
              {playerPoolSyncMutation.isPending ? "Syncing..." : "Sync Player Pool"}
            </Button>
          </div>

          <div className="mt-4 text-body-sm text-content-secondary dark:text-shell-muted">
            <p><span className="font-medium text-content dark:text-shell-text">Note:</span> This requires at least one connected league for the season. The sync uses that league's auth credentials to fetch player data from ESPN.</p>
          </div>
        </CardContent>
      </Card>

      {/* Auction Value Validation */}
      <Card className="mb-8">
        <CardHeader>
          <Heading level={2} className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-content-secondary dark:text-shell-muted" />
            Auction Value Validation
          </Heading>
          <p className="text-body-sm text-content-secondary dark:text-shell-muted mt-1">
            Compare our VBD-based auction values against ESPN's pre-draft baseline values to validate calculation accuracy.
          </p>
        </CardHeader>
        <CardContent>
          <a
            href="/admin/auction-validation"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-body-sm font-medium text-content-inverse bg-accent hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent transition-colors"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Validate Auction Values
          </a>
        </CardContent>
      </Card>

      {/* Upload History */}
      <Card className="mb-8">
        <CardHeader>
          <Heading level={2}>Upload History</Heading>
        </CardHeader>
        <CardContent>
          {projectionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : projectionsData?.runs?.length === 0 ? (
            <div className="text-center py-8">
              <Upload className="mx-auto h-12 w-12 text-content-tertiary" />
              <p className="mt-2 text-body-sm text-content-secondary dark:text-shell-muted">
                No projections uploaded yet
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-100 dark:divide-shell-border">
                <thead className="bg-surface-secondary dark:bg-shell-bg">
                  <tr>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      As of Date
                    </th>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      System
                    </th>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      Uploaded
                    </th>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-shell-panel divide-y divide-neutral-100 dark:divide-shell-border">
                  {projectionsData?.runs?.map((run: ProjectionRun) => (
                    <tr key={run.id} className="hover:bg-surface-secondary dark:hover:bg-shell-bg transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-body-sm font-medium text-content dark:text-shell-text">
                        {run.as_of_date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content-secondary dark:text-shell-muted">
                        {run.source}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content-secondary dark:text-shell-muted">
                        {run.system}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content-secondary dark:text-shell-muted">
                        {new Date(run.ingested_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={getStalenessVariant(run.staleness)}>
                          {run.staleness}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* League Health */}
      <Card className="mb-8">
        <CardHeader>
          <Heading level={2}>League Health</Heading>
        </CardHeader>
        <CardContent>
          {leaguesLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : !leaguesData?.leagues || leaguesData.leagues.length === 0 ? (
            <p className="text-center py-8 text-body-sm text-content-secondary dark:text-shell-muted">No leagues found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-100 dark:divide-shell-border">
                <thead className="bg-surface-secondary dark:bg-shell-bg">
                  <tr>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      League Name
                    </th>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      ESPN ID
                    </th>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      Latest Snapshot
                    </th>
                    <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-shell-panel divide-y divide-neutral-100 dark:divide-shell-border">
                  {leaguesData.leagues.map((league: League) => (
                    <tr key={league.id} className="hover:bg-surface-secondary dark:hover:bg-shell-bg transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-body-sm font-medium text-content dark:text-shell-text">
                        {league.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content-secondary dark:text-shell-muted">
                        {league.espn_league_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content-secondary dark:text-shell-muted">
                        {league.snapshot_date
                          ? new Date(league.snapshot_date).toLocaleDateString()
                          : "Never"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <Badge variant={getLeagueStatusVariant(league.status)}>
                            {league.status}
                          </Badge>
                          {league.is_degraded && league.degraded_reasons && (
                            <p className="text-body-sm text-content-secondary dark:text-shell-muted mt-1">
                              {league.degraded_reasons.join(", ")}
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historical Backfill */}
      <Card className="mb-8">
        <CardHeader>
          <Heading level={2}>Historical Backfill</Heading>
          <p className="text-body-sm text-content-secondary dark:text-shell-muted mt-1">
            Backfill historical snapshots for a league and season. This will fetch data from ESPN for the specified weeks.
          </p>
        </CardHeader>
        <CardContent>
          {/* Backfill Trigger Form */}
          <form onSubmit={handleBackfillSubmit} className="space-y-4 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-body-sm font-medium text-content dark:text-shell-text mb-2">
                  League
                </label>
                <select
                  value={selectedLeagueId || ""}
                  onChange={(e) => setSelectedLeagueId(e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="flex h-10 w-full rounded-lg border border-neutral-300 dark:border-shell-border bg-white dark:bg-shell-panel px-3 py-2 text-body-sm text-content dark:text-shell-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus:ring-shell-accent focus-visible:ring-offset-2"
                  required
                >
                  <option value="">Select a league</option>
                  {leaguesData?.leagues?.map((league: League) => (
                    <option key={league.id} value={league.id}>
                      {league.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-body-sm font-medium text-content dark:text-shell-text mb-2">
                  Season
                </label>
                <input
                  type="number"
                  value={season}
                  onChange={(e) => setSeason(parseInt(e.target.value, 10))}
                  min={2017}
                  max={new Date().getFullYear()}
                  className="flex h-10 w-full rounded-lg border border-neutral-300 dark:border-shell-border bg-white dark:bg-shell-panel px-3 py-2 text-body-sm text-content dark:text-shell-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus:ring-shell-accent focus-visible:ring-offset-2"
                  required
                />
              </div>

              <div>
                <label className="block text-body-sm font-medium text-content dark:text-shell-text mb-2">
                  Start Week
                </label>
                <input
                  type="number"
                  value={startWeek}
                  onChange={(e) => setStartWeek(parseInt(e.target.value, 10))}
                  min={1}
                  max={30}
                  className="flex h-10 w-full rounded-lg border border-neutral-300 dark:border-shell-border bg-white dark:bg-shell-panel px-3 py-2 text-body-sm text-content dark:text-shell-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus:ring-shell-accent focus-visible:ring-offset-2"
                  required
                />
              </div>

              <div>
                <label className="block text-body-sm font-medium text-content dark:text-shell-text mb-2">
                  End Week
                </label>
                <input
                  type="number"
                  value={endWeek}
                  onChange={(e) => setEndWeek(parseInt(e.target.value, 10))}
                  min={1}
                  max={30}
                  className="flex h-10 w-full rounded-lg border border-neutral-300 dark:border-shell-border bg-white dark:bg-shell-panel px-3 py-2 text-body-sm text-content dark:text-shell-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus:ring-shell-accent focus-visible:ring-offset-2"
                  required
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                id="clearExisting"
                type="checkbox"
                checked={clearExisting}
                onChange={(e) => setClearExisting(e.target.checked)}
                className="h-4 w-4 text-accent focus:ring-accent dark:focus:ring-shell-accent border-neutral-300 dark:border-shell-border rounded"
              />
              <label htmlFor="clearExisting" className="ml-2 block text-body-sm text-content dark:text-shell-text">
                Clear existing data before backfill
              </label>
              <span className="ml-2 text-body-sm text-content-secondary dark:text-shell-muted">
                (Deletes existing snapshots for the selected season/week range)
              </span>
            </div>

            {backfillSuccess && (
              <div className="bg-positive-light border border-positive-border rounded-card p-4">
                <p className="text-body-sm font-medium text-positive">{backfillSuccess}</p>
              </div>
            )}

            {backfillError && (
              <div className="bg-negative-light border border-negative-border rounded-card p-4">
                <p className="text-body-sm font-medium text-negative">{backfillError}</p>
              </div>
            )}

            <div className="flex items-center justify-end">
              <Button
                type="submit"
                variant="primary"
                disabled={!selectedLeagueId || backfillMutation.isPending}
              >
                {backfillMutation.isPending ? "Starting..." : "Start Backfill"}
              </Button>
            </div>
          </form>

          {/* Active Job Progress */}
          {activeJobId && activeJobData && (
            <div className="mb-8 p-4 bg-surface-secondary dark:bg-shell-bg rounded-card border border-neutral-100 dark:border-shell-border">
              <h3 className="text-body-sm font-semibold text-content dark:text-shell-text mb-3">
                Active Backfill Job
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-content-secondary dark:text-shell-muted">Job ID:</span>
                  <span className="font-mono text-xs text-content dark:text-shell-text">{activeJobId}</span>
                </div>
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-content-secondary dark:text-shell-muted">Status:</span>
                  <Badge variant={getJobStatusVariant(activeJobData.status)}>
                    {activeJobData.status}
                  </Badge>
                </div>
                {activeJobData.progress && (
                  <>
                    <div className="flex items-center justify-between text-body-sm">
                      <span className="text-content-secondary dark:text-shell-muted">Stage:</span>
                      <span className="text-content dark:text-shell-text">{activeJobData.progress.stage || "Processing"}</span>
                    </div>
                    <div className="flex items-center justify-between text-body-sm">
                      <span className="text-content-secondary dark:text-shell-muted">Progress:</span>
                      <span className="text-content dark:text-shell-text">
                        {activeJobData.progress.completedWeeks || 0} of {activeJobData.progress.totalWeeks || 0} weeks
                      </span>
                    </div>
                    <div className="w-full bg-neutral-200 dark:bg-shell-border rounded-full h-4 overflow-hidden">
                      <div
                        className="bg-accent h-4 w-full transition-transform duration-300 origin-left"
                        style={{ transform: `scaleX(${(activeJobData.progress.percentage || 0) / 100})` }}
                      />
                    </div>
                    <div className="text-body-sm text-content-secondary dark:text-shell-muted text-right">
                      {activeJobData.progress.percentage?.toFixed(1) || 0}%
                    </div>
                  </>
                )}
                {activeJobData.status === "completed" && activeJobData.returnValue && (
                  <div className="mt-3 bg-positive-light border border-positive-border rounded-card p-3">
                    <p className="text-body-sm text-positive font-medium">
                      Backfill completed successfully!
                    </p>
                    <p className="text-body-sm text-positive opacity-75 mt-1">
                      {activeJobData.returnValue.message || `Processed ${activeJobData.returnValue.snapshotsCreated || 0} snapshots`}
                    </p>
                  </div>
                )}
                {activeJobData.status === "failed" && activeJobData.failedReason && (
                  <div className="mt-3 bg-negative-light border border-negative-border rounded-card p-3">
                    <p className="text-body-sm text-negative font-medium">Backfill failed</p>
                    <p className="text-body-sm text-negative opacity-75 mt-1">{activeJobData.failedReason}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Backfill Jobs Table */}
          <div>
            <Heading level={3} className="mb-3">Recent Backfill Jobs</Heading>
            {!backfillJobsData?.jobs || backfillJobsData.jobs.length === 0 ? (
              <p className="text-center py-8 text-body-sm text-content-secondary dark:text-shell-muted">
                No backfill jobs yet
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-100 dark:divide-shell-border">
                  <thead className="bg-surface-secondary dark:bg-shell-bg">
                    <tr>
                      <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                        Job ID
                      </th>
                      <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                        League
                      </th>
                      <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                        Season
                      </th>
                      <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                        Progress
                      </th>
                      <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-shell-panel divide-y divide-neutral-100 dark:divide-shell-border">
                    {backfillJobsData.jobs.map((job: BackfillJob) => (
                      <tr key={job.id} className="hover:bg-surface-secondary dark:hover:bg-shell-bg transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-content dark:text-shell-text">
                          {job.id.length > 20 ? `${job.id.substring(0, 20)}...` : job.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content-secondary dark:text-shell-muted">
                          {job.data?.leagueId || "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content-secondary dark:text-shell-muted">
                          {job.data?.season || "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={getJobStatusVariant(job.status)}>
                            {job.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content-secondary dark:text-shell-muted">
                          {job.progress?.percentage
                            ? `${job.progress.percentage.toFixed(0)}%`
                            : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content-secondary dark:text-shell-muted">
                          {job.createdAt
                            ? new Date(job.createdAt).toLocaleString()
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Container>
  );
}

export default function AdminPage() {
  return (
    <AdminRoute>
      <AdminPageContent />
    </AdminRoute>
  );
}
