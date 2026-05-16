import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useLeagueStatus(leagueId: string | number) {
  return useQuery({
    queryKey: queryKeys.league.all(leagueId),
    queryFn: () => api.getLeagueStatus(Number(leagueId)),
    staleTime: 60_000,
  });
}

export function useLeagueTeams(leagueId: string | number) {
  return useQuery({
    queryKey: queryKeys.league.teams(leagueId),
    queryFn: () => api.getTeams(Number(leagueId)),
    staleTime: 300_000,
  });
}
