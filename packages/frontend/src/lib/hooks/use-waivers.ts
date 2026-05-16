import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useWaiverRecommendations(
  leagueId: string | number,
  teamId: number | null,
  maxRecommendations = 10,
) {
  return useQuery({
    queryKey: queryKeys.waivers.recommendations(
      leagueId,
      teamId ?? 0,
      maxRecommendations,
    ),
    queryFn: () =>
      api.getWaiverRecommendations(Number(leagueId), teamId!, {
        maxRecommendations,
      }),
    enabled: teamId != null,
    staleTime: 120_000,
  });
}

export function useFreeAgents(
  leagueId: string | number,
  params?: { limit?: number; sortBy?: string; position?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.waivers.list(leagueId),
    queryFn: () => api.getFreeAgents(Number(leagueId), params),
    enabled,
    staleTime: 120_000,
  });
}
