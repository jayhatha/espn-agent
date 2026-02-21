"use client";

import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { AdminRoute } from "@/components/ProtectedRoute";
import { api } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { useAuth } from "@/contexts/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function AdminPageContent() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [batterFile, setBatterFile] = useState<File | null>(null);
  const [pitcherFile, setPitcherFile] = useState<File | null>(null);
  const [batterDragActive, setBatterDragActive] = useState(false);
  const [pitcherDragActive, setPitcherDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

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
      const formData = new FormData();
      if (files.batter) formData.append("batter", files.batter);
      if (files.pitcher) formData.append("pitcher", files.pitcher);

      const response = await fetch(`${API_URL}/api/projections/upload-batch`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || "Failed to upload projections");
      }

      return response.json();
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
          <svg
            className="mr-3 h-8 w-8 text-purple-600"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
              clipRule="evenodd"
            />
          </svg>
          Admin Dashboard
        </h1>
        <p className="mt-2 text-gray-600">
          Manage projections, users, and system health
        </p>
      </div>

      {/* System Health KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statsLoading ? (
          <div className="col-span-4 flex items-center justify-center py-8">
            <svg
              className="animate-spin h-8 w-8 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
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
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Users</h2>
          {usersData?.users && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              {usersData.users.length} total
            </span>
          )}
        </div>

        {usersLoading ? (
          <div className="flex items-center justify-center py-8">
            <svg
              className="animate-spin h-8 w-8 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
        ) : !usersData?.users || usersData.users.length === 0 ? (
          <p className="text-center py-8 text-sm text-gray-500">No users found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Display Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Login
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {usersData.users.map((user: any) => {
                  const isSelf = currentUser?.id === user.id;
                  return (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.display_name || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            user.role === "admin"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.last_login_at
                          ? new Date(user.last_login_at).toLocaleDateString()
                          : "Never"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleRoleToggle(user.id, user.role, user.email)}
                          disabled={isSelf || updateRoleMutation.isPending}
                          title={isSelf ? "Cannot change own role" : ""}
                          className={`inline-flex items-center px-3 py-1.5 border text-xs font-medium rounded-md ${
                            user.role === "admin"
                              ? "border-red-300 text-red-700 hover:bg-red-50"
                              : "border-gray-300 text-gray-700 hover:bg-gray-50"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {user.role === "admin" ? "Remove Admin" : "Make Admin"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Projections Section */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Upload Projections
        </h2>
        <p className="text-gray-600 mb-6">
          Upload FanGraphs Depth Charts RoS projections. Upload both batter and pitcher files together.
        </p>

        <form onSubmit={handleUploadSubmit} className="space-y-6">
          {/* Two Drop Zones */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Batter CSV Drop Zone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Batters CSV
              </label>
              <div
                className={`relative border-2 border-dashed rounded-lg p-6 text-center ${
                  batterDragActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 bg-gray-50"
                }`}
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
                  <svg
                    className="mx-auto h-10 w-10 text-gray-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    {batterFile ? batterFile.name : "Drop batters CSV or click"}
                  </p>
                </label>
              </div>
            </div>

            {/* Pitcher CSV Drop Zone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pitchers CSV
              </label>
              <div
                className={`relative border-2 border-dashed rounded-lg p-6 text-center ${
                  pitcherDragActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 bg-gray-50"
                }`}
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
                  <svg
                    className="mx-auto h-10 w-10 text-gray-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    {pitcherFile ? pitcherFile.name : "Drop pitchers CSV or click"}
                  </p>
                </label>
              </div>
            </div>
          </div>

          {uploadSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm font-medium text-green-800">{uploadSuccess}</p>
            </div>
          )}

          {uploadError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="text-red-800 font-medium">Upload Failed</h3>
              <p className="text-red-600 text-sm mt-1">{uploadError}</p>
            </div>
          )}

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={(!batterFile && !pitcherFile) || uploadMutation.isPending}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {uploadMutation.isPending ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Uploading...
                </>
              ) : (
                "Upload Projections"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
        <h3 className="flex items-center text-sm font-medium text-blue-800 mb-3">
          <svg
            className="mr-2 h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          How to export FanGraphs projections:
        </h3>
        <ol className="text-sm text-blue-700 space-y-2 ml-7 list-decimal">
          <li>
            Go to{" "}
            <a
              href="https://www.fangraphs.com/projections.aspx?pos=all&stats=bat&type=fangraphsdc"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-800"
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
              className="underline hover:text-blue-800"
            >
              Pitchers
            </a>
          </li>
          <li>Upload both files using the drop zones above</li>
        </ol>
        <p className="mt-3 text-xs text-blue-600">
          Note: You need a FanGraphs subscription to access Depth Charts projections.
        </p>
      </div>

      {/* Upload History */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Upload History</h2>

        {projectionsLoading ? (
          <div className="flex items-center justify-center py-8">
            <svg
              className="animate-spin h-8 w-8 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
        ) : projectionsData?.runs?.length === 0 ? (
          <div className="text-center py-8">
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="mt-2 text-sm text-gray-500">
              No projections uploaded yet
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    As of Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    System
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Uploaded
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {projectionsData?.runs?.map((run: any) => (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {run.as_of_date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {run.source}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {run.system}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(run.ingested_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          run.staleness === "fresh"
                            ? "bg-green-100 text-green-800"
                            : run.staleness === "stale"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {run.staleness}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* League Health */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">League Health</h2>

        {leaguesLoading ? (
          <div className="flex items-center justify-center py-8">
            <svg
              className="animate-spin h-8 w-8 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
        ) : !leaguesData?.leagues || leaguesData.leagues.length === 0 ? (
          <p className="text-center py-8 text-sm text-gray-500">No leagues found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    League Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ESPN ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Latest Snapshot
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leaguesData.leagues.map((league: any) => (
                  <tr key={league.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {league.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {league.espn_league_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {league.snapshot_date
                        ? new Date(league.snapshot_date).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            league.status === "healthy"
                              ? "bg-green-100 text-green-800"
                              : league.status === "degraded"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                          }`}
                        >
                          {league.status}
                        </span>
                        {league.is_degraded && league.degraded_reasons && (
                          <p className="text-xs text-gray-500 mt-1">
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
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AdminRoute>
      <AdminPageContent />
    </AdminRoute>
  );
}
