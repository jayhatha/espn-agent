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
