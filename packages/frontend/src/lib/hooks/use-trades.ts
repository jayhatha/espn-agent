import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useTradeRecommendations(
  leagueId: string | number,
  teamId: number | null,
) {
  return useQuery({
    queryKey: queryKeys.trades.recommendations(leagueId, teamId ?? 0),
    queryFn: () => api.getTradeRecommendations(Number(leagueId), teamId!),
    enabled: teamId != null,
    staleTime: 300_000,
  });
}
