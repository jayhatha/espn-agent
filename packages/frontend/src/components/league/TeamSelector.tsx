"use client";

import { useEffect } from "react";
import { CheckCircleIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Text } from "@/components/ui/Text";
import { Select } from "@/components/ui/Select";

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
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) onSelect(parsed);
    }
  }, [leagueId, autoDetectedTeamId, onSelect]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-neutral-200 dark:bg-shell-border rounded-lg w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Text size="sm" color="secondary">
        Failed to load teams. Try refreshing the page.
      </Text>
    );
  }

  if (teams.length === 0) {
    return (
      <Text size="sm" color="secondary">
        No teams found. Create a snapshot to sync league data from ESPN.
      </Text>
    );
  }

  return (
    <div>
      {autoDetectedTeamId && (
        <div className="mb-4 bg-positive-light border border-positive-border rounded-lg p-3">
          <div className="flex items-center">
            <CheckCircleIcon className="h-5 w-5 text-positive mr-2 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-body-sm font-medium text-positive">
                Team Auto-Detected
              </p>
              <Text size="sm" color="secondary">
                We automatically detected your team based on your ESPN account.
                You can change it below if needed.
              </Text>
            </div>
          </div>
        </div>
      )}

      <label
        htmlFor="team-select"
        className="block text-body-sm font-medium text-content dark:text-shell-text mb-2"
      >
        {autoDetectedTeamId
          ? "Your auto-detected team:"
          : "Select your team to get personalized recommendations:"}
      </label>
      <Select
        id="team-select"
        value={selectedTeamId || ""}
        onChange={(e) => handleSelect(parseInt(e.target.value, 10))}
      >
        <option value="">-- Select a team --</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </Select>
      {!selectedTeamId && !autoDetectedTeamId && (
        <Text size="sm" color="tertiary" className="mt-2">
          Select your team to access waiver recommendations, trade analysis, and projections.
        </Text>
      )}
      {selectedTeamId && !autoDetectedTeamId && (
        <p className={cn("mt-2 text-body-sm text-positive flex items-center")}>
          <CheckCircleIcon className="mr-1 h-4 w-4" />
          Team selected!
        </p>
      )}
    </div>
  );
}
