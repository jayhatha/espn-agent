import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useProjectedStandings(leagueId: string | number) {
  return useQuery({
    queryKey: queryKeys.standings.projected(leagueId),
    queryFn: () => api.getProjectedStandings(Number(leagueId)),
    staleTime: 120_000,
  });
}

export function useRollingStandings(
  leagueId: string | number,
  days: 15 | 30,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.standings.rolling(leagueId, days),
    queryFn: () => api.getRollingStandings(Number(leagueId), days),
    enabled,
    staleTime: 120_000,
  });
}
