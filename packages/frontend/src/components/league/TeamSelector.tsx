"use client";

import { useEffect } from "react";

interface TeamOption {
  id: number;
  name: string;
}

interface TeamSelectorProps {
  leagueId: number | string;
  teams: TeamOption[];
  selectedTeamId: number | null;
  onSelect: (teamId: number) => void;
  autoDetectedTeamId?: number | null;
  loading?: boolean;
  error?: boolean;
}

export function TeamSelector({
  leagueId,
  teams,
  selectedTeamId,
  onSelect,
  autoDetectedTeamId,
  loading = false,
  error = false,
}: TeamSelectorProps) {
  // Sync with localStorage on selection
  const handleSelect = (teamId: number) => {
    onSelect(teamId);
    localStorage.setItem(`league_${leagueId}_team`, teamId.toString());
  };

  // Load from localStorage on mount
  useEffect(() => {
    if (autoDetectedTeamId) {
      handleSelect(autoDetectedTeamId);
      return;
    }

    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      onSelect(parseInt(stored, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, autoDetectedTeamId]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-gray-200 rounded w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600">
        Failed to load teams. Try refreshing the page.
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="text-sm text-gray-600">
        No teams found. Create a snapshot to sync league data from ESPN.
      </div>
    );
  }

  return (
    <div>
      {autoDetectedTeamId && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center">
            <svg
              className="h-5 w-5 text-green-400 mr-2"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">
                Team Auto-Detected
              </p>
              <p className="text-sm text-green-700">
                We automatically detected your team based on your ESPN account.
                You can change it below if needed.
              </p>
            </div>
          </div>
        </div>
      )}

      <label
        htmlFor="team-select"
        className="block text-sm font-medium text-gray-700 mb-2"
      >
        {autoDetectedTeamId
          ? "Your auto-detected team:"
          : "Select your team to get personalized recommendations:"}
      </label>
      <select
        id="team-select"
        value={selectedTeamId || ""}
        onChange={(e) => handleSelect(parseInt(e.target.value, 10))}
        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
      >
        <option value="">-- Select a team --</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
      {!selectedTeamId && !autoDetectedTeamId && (
        <p className="mt-2 text-sm text-gray-500">
          Select your team to access waiver recommendations, trade analysis, and
          projections.
        </p>
      )}
      {selectedTeamId && !autoDetectedTeamId && (
        <p className="mt-2 text-sm text-green-600 flex items-center">
          <svg
            className="mr-1 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          Team selected!
        </p>
      )}
    </div>
  );
}
