const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const api = {
  // Leagues
  async getLeagues() {
    const res = await fetch(`${API_URL}/api/leagues`);
    if (!res.ok) throw new Error("Failed to fetch leagues");
    return res.json();
  },

  async getLeagueStatus(leagueId: number) {
    const res = await fetch(`${API_URL}/api/leagues/${leagueId}/status`);
    if (!res.ok) throw new Error("Failed to fetch league status");
    return res.json();
  },

  async connectLeague(data: {
    espnLeagueId: number;
    season: number;
    auth?: { SWID?: string; espn_s2?: string };
    name?: string;
    timezone?: string;
  }) {
    const res = await fetch(`${API_URL}/api/leagues/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to connect league");
    return res.json();
  },

  // Projections
  async uploadProjections(data: {
    battersCsv?: string;
    pitchersCsv?: string;
    asOfDate: string;
  }) {
    const res = await fetch(`${API_URL}/api/projections/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to upload projections");
    return res.json();
  },

  async getProjections(limit = 20) {
    const res = await fetch(`${API_URL}/api/projections?limit=${limit}`);
    if (!res.ok) throw new Error("Failed to fetch projections");
    return res.json();
  },

  // Time series
  async getOverallTimeSeries(
    leagueId: number,
    params?: { from?: string; to?: string; teamIds?: string },
  ) {
    const query = new URLSearchParams(params as any).toString();
    const res = await fetch(
      `${API_URL}/api/leagues/${leagueId}/timeseries/overall?${query}`,
    );
    if (!res.ok) throw new Error("Failed to fetch time series");
    return res.json();
  },

  async getCategoryRankTimeSeries(
    leagueId: number,
    categoryId: string,
    params?: { from?: string; to?: string; teamIds?: string },
  ) {
    const query = new URLSearchParams({
      ...params,
      categoryId,
    } as any).toString();
    const res = await fetch(
      `${API_URL}/api/leagues/${leagueId}/timeseries/category-rank?${query}`,
    );
    if (!res.ok) throw new Error("Failed to fetch category rank time series");
    return res.json();
  },

  async getProjectedOverallTimeSeries(
    leagueId: number,
    params?: { from?: string; to?: string; teamIds?: string },
  ) {
    const query = new URLSearchParams(params as any).toString();
    const res = await fetch(
      `${API_URL}/api/leagues/${leagueId}/timeseries/projected-overall?${query}`,
    );
    if (!res.ok) throw new Error("Failed to fetch projected time series");
    return res.json();
  },

  // Recommendations
  async getWaiverRecommendations(
    leagueId: number,
    teamId: number,
    params?: { snapshotDate?: string; maxRecommendations?: number },
  ) {
    const query = new URLSearchParams(params as any).toString();
    const res = await fetch(
      `${API_URL}/api/leagues/${leagueId}/teams/${teamId}/waivers/recommendations?${query}`,
    );
    if (!res.ok) throw new Error("Failed to fetch waiver recommendations");
    return res.json();
  },
};
