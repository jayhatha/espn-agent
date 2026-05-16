"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Reads and persists the selected team for a league from localStorage.
 * Key: `league_${leagueId}_team`
 *
 * @returns [selectedTeamId, selectTeam] — null until a team has been stored.
 */
export function useLeagueTeam(
  leagueId: string,
): [number | null, (id: number) => void] {
  const [teamId, setTeamId] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) setTeamId(parsed);
    }
  }, [leagueId]);

  const selectTeam = useCallback(
    (id: number) => {
      setTeamId(id);
      localStorage.setItem(`league_${leagueId}_team`, String(id));
    },
    [leagueId],
  );

  return [teamId, selectTeam];
}
