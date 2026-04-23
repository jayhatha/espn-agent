const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Strip undefined/null values before passing to URLSearchParams
function cleanParams(params: Record<string, any>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v != null) clean[k] = String(v);
  }
  return clean;
}

// =============================================================================
// AUTH BYPASSED: Single-user mode (v4.0)
// No token refresh, no 401 redirect-to-login. Just fetch and return.
// =============================================================================

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return res.json();
}

export const api = {
  // Generic GET method for arbitrary endpoints
  async get(endpoint: string) {
    return fetchAPI(endpoint);
  },

  // Leagues
  async getLeagues() {
    return fetchAPI("/api/leagues");
  },

  async getLeagueStatus(leagueId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/status`);
  },

  async connectLeague(data: {
    espnLeagueId: number;
    season: number;
    auth?: { SWID?: string; espn_s2?: string };
    name?: string;
    timezone?: string;
    teamEspnId?: number;
  }) {
    return fetchAPI("/api/leagues/connect", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Projections
  async uploadProjections(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    // Use fetch directly to avoid Content-Type override
    // Browser will automatically set multipart/form-data with boundary
    const res = await fetch(`${API_URL}/api/projections/upload`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(error.error || error.message || "Upload failed");
    }

    return res.json();
  },

  async getProjections(limit = 20) {
    return fetchAPI(`/api/projections?limit=${limit}`);
  },

  // Time series
  async getOverallTimeSeries(
    leagueId: number,
    params?: { from?: string; to?: string; teamIds?: string; season?: string },
  ) {
    const query = new URLSearchParams(cleanParams(params || {})).toString();
    return fetchAPI(`/api/leagues/${leagueId}/timeseries/overall?${query}`);
  },

  async getCategoryRankTimeSeries(
    leagueId: number,
    categoryId: string,
    params?: { from?: string; to?: string; teamIds?: string; season?: string },
  ) {
    const query = new URLSearchParams(
      cleanParams({
        ...params,
        categoryId,
      }),
    ).toString();
    return fetchAPI(
      `/api/leagues/${leagueId}/timeseries/category-rank?${query}`,
    );
  },

  async getCategoryTotalTimeSeries(
    leagueId: number,
    categoryId: string,
    params?: { from?: string; to?: string; teamIds?: string; season?: string },
  ) {
    const query = new URLSearchParams(
      cleanParams({
        ...params,
        categoryId,
      }),
    ).toString();
    return fetchAPI(
      `/api/leagues/${leagueId}/timeseries/category-total?${query}`,
    );
  },

  async getProjectedOverallTimeSeries(
    leagueId: number,
    params?: { from?: string; to?: string; teamIds?: string; season?: string },
  ) {
    const query = new URLSearchParams(cleanParams(params || {})).toString();
    return fetchAPI(
      `/api/leagues/${leagueId}/timeseries/projected-overall?${query}`,
    );
  },

  async getLeagueSeasons(leagueId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/seasons`);
  },

  async getLeagueCategories(leagueId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/categories`);
  },

  // Recommendations
  async getWaiverRecommendations(
    leagueId: number,
    teamId: number,
    params?: { snapshotDate?: string; maxRecommendations?: number },
  ) {
    const query = new URLSearchParams(cleanParams(params || {})).toString();
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/waivers/recommendations?${query}`,
    );
  },

  // Teams
  async getTeams(leagueId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/teams`);
  },

  // Snapshots
  async triggerSnapshot(leagueId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/snapshot`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  // Projected standings
  async getProjectedStandings(
    leagueId: number,
    params?: { snapshotDate?: string },
  ) {
    const query = new URLSearchParams(cleanParams(params || {})).toString();
    return fetchAPI(
      `/api/leagues/${leagueId}/standings/projected${query ? "?" + query : ""}`,
    );
  },

  // Standings swing attribution
  async getStandingsSwing(
    leagueId: number,
    teamId: number,
    params?: { snapshotDate?: string },
  ) {
    const query = new URLSearchParams(
      cleanParams({ ...(params || {}), teamId: String(teamId) }),
    ).toString();
    return fetchAPI(`/api/leagues/${leagueId}/standings/swing?${query}`);
  },

  // Free agents
  async getFreeAgents(
    leagueId: number,
    params?: { limit?: number; sortBy?: string; position?: string },
  ) {
    const query = new URLSearchParams(cleanParams(params || {})).toString();
    return fetchAPI(
      `/api/leagues/${leagueId}/free-agents${query ? "?" + query : ""}`,
    );
  },

  // Waiver evaluation
  async evaluateWaiver(
    leagueId: number,
    teamId: number,
    data: { addPlayerId: number; dropPlayerId?: number },
  ) {
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/waivers/evaluate`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  },

  // Trades
  async getTradePartners(leagueId: number, teamId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/trades/partners`);
  },

  async getTradeRosters(
    leagueId: number,
    teamId: number,
    partnerTeamId: number,
  ) {
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/trades/partners/${partnerTeamId}/rosters`,
    );
  },

  async validateTrade(
    leagueId: number,
    teamId: number,
    data: { givePlayers: number[]; receivePlayers: number[] },
  ) {
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/trades/validate`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  },

  async analyzeTradeImpact(
    leagueId: number,
    teamId: number,
    data: { givePlayers: number[]; receivePlayers: number[] },
  ) {
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/trades/impact`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getTradeRecommendations(
    leagueId: number,
    teamId: number,
    params?: { partnerTeamId?: number },
  ) {
    const query = new URLSearchParams(cleanParams(params || {})).toString();
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/trades/recommendations${query ? "?" + query : ""}`,
    );
  },

  // Team overview
  async getTeamOverview(
    leagueId: number,
    teamId: number,
    params?: { snapshotDate?: string },
  ) {
    const query = new URLSearchParams(cleanParams(params || {})).toString();
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/overview${query ? "?" + query : ""}`,
    );
  },

  // Team roster
  async getTeamRoster(leagueId: number, teamId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/roster`);
  },

  // Lineup optimizer
  async getLineupRecommendations(
    leagueId: number,
    teamId: number,
    params?: { snapshotDate?: string },
  ) {
    const query = new URLSearchParams(cleanParams(params || {})).toString();
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/lineup/recommendations${query ? "?" + query : ""}`,
    );
  },

  // Streaming pitchers
  async getStreamingPitchers(
    leagueId: number,
    params?: {
      teamId?: number;
      startDate?: string;
      lookAheadDays?: number;
      limit?: number;
    },
  ) {
    const query = new URLSearchParams(cleanParams(params || {})).toString();
    return fetchAPI(
      `/api/leagues/${leagueId}/streaming-pitchers${query ? "?" + query : ""}`,
    );
  },

  // League auth
  async updateLeagueAuth(
    leagueId: number,
    auth: { SWID?: string; espn_s2?: string },
  ) {
    return fetchAPI(`/api/leagues/${leagueId}/auth`, {
      method: "PATCH",
      body: JSON.stringify(auth),
    });
  },

  // Annotations
  async getAnnotations(
    leagueId: number,
    params?: { from?: string; to?: string; teamIds?: string; season?: string },
  ) {
    const query = new URLSearchParams(cleanParams(params || {})).toString();
    return fetchAPI(
      `/api/leagues/${leagueId}/timeseries/annotations${query ? "?" + query : ""}`,
    );
  },

  // Inflection points
  async getInflectionPoints(
    leagueId: number,
    teamId: number,
    params?: {
      season?: string;
      from?: string;
      to?: string;
      limit?: number;
      categoryId?: string;
    },
  ) {
    const qs = new URLSearchParams(
      cleanParams({ teamId, ...params }),
    ).toString();
    return fetchAPI(
      `/api/leagues/${leagueId}/timeseries/inflection-points?${qs}`,
    );
  },

  // Auth
  async login(email: string, password: string) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error(error.error || "Login failed");
    }

    return res.json();
  },

  async signup(email: string, password: string, displayName?: string) {
    const res = await fetch(`${API_URL}/api/auth/signup`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Signup failed" }));
      throw new Error(error.error || "Signup failed");
    }

    return res.json();
  },

  async logout() {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  },

  async getProfile() {
    return fetchAPI("/api/auth/me");
  },

  // Admin
  async getAdminStats() {
    return fetchAPI("/api/admin/stats");
  },

  async getAdminUsers(page = 1, limit = 50) {
    return fetchAPI(`/api/admin/users?page=${page}&limit=${limit}`);
  },

  async updateUserRole(userId: number, role: "user" | "admin") {
    return fetchAPI(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  async getAdminLeagues() {
    return fetchAPI("/api/admin/leagues");
  },

  // Backfill
  async triggerBackfill(
    leagueId: number,
    data: {
      season: number;
      startWeek?: number;
      endWeek?: number;
      clearExisting?: boolean;
    },
  ) {
    return fetchAPI(`/api/admin/leagues/${leagueId}/backfill`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async clearBackfillData(
    leagueId: number,
    params: { season: number; startWeek?: number; endWeek?: number },
  ) {
    const qs = new URLSearchParams({
      season: String(params.season),
      ...(params.startWeek !== undefined && {
        startWeek: String(params.startWeek),
      }),
      ...(params.endWeek !== undefined && { endWeek: String(params.endWeek) }),
    });
    return fetchAPI(`/api/admin/leagues/${leagueId}/backfill?${qs}`, {
      method: "DELETE",
    });
  },

  async getBackfillJobStatus(jobId: string) {
    return fetchAPI(`/api/admin/backfill-jobs/${jobId}`);
  },

  async getBackfillJobs() {
    return fetchAPI("/api/admin/backfill-jobs");
  },

  // Transaction Impact
  async computeTransactionImpacts(leagueId: number, season: number) {
    return fetchAPI(
      `/api/leagues/${leagueId}/transaction-impacts/compute?season=${season}`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
  },

  async getTransactionImpacts(
    leagueId: number,
    teamId: number,
    params?: { season?: number; sortBy?: string },
  ) {
    const qs = new URLSearchParams();
    if (params?.season) qs.set("season", String(params.season));
    if (params?.sortBy) qs.set("sortBy", params.sortBy);
    const query = qs.toString();
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/transaction-impacts${query ? "?" + query : ""}`,
    );
  },

  async getDraftReport(leagueId: number, teamId: number, season?: number) {
    const qs = season ? `?season=${season}` : "";
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/draft-report${qs}`,
    );
  },

  async getLeagueImpactSummary(leagueId: number, season?: number) {
    const qs = season ? `?season=${season}` : "";
    return fetchAPI(
      `/api/leagues/${leagueId}/transaction-impacts/league-summary${qs}`,
    );
  },

  // Trends
  async getHotColdTrends(
    leagueId: number,
    teamId: number,
    options?: { days?: number },
  ) {
    const days = options?.days || 7;
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/trends/hot-cold?days=${days}`,
    );
  },

  async getLineupEfficiency(
    leagueId: number,
    teamId: number,
    options?: { days?: number },
  ) {
    const days = options?.days || 7;
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/trends/lineup-efficiency?days=${days}`,
    );
  },

  // Player pool sync
  async triggerPlayerPoolSync(season?: number) {
    return fetchAPI("/api/admin/player-pool/sync", {
      method: "POST",
      body: JSON.stringify({ season: season || new Date().getFullYear() }),
    });
  },

  // FAAB tracking
  async getFaabSummary(leagueId: number, teamId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/faab`);
  },

  async getFaabHistory(leagueId: number, teamId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/faab/history`);
  },

  async getFaabSuggestedBid(
    leagueId: number,
    teamId: number,
    playerId: number,
  ) {
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/faab/suggested-bid/${playerId}`,
    );
  },

  // Pitching usage / GS pacing
  async getGsSummary(leagueId: number, teamId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/pitching/gs`);
  },

  async getGsWeekly(leagueId: number, teamId: number, weekStart?: string) {
    const query = weekStart ? `?weekStart=${weekStart}` : "";
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/pitching/gs/weekly${query}`,
    );
  },

  async getGsLeagueOverview(leagueId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/pitching/gs/league`);
  },

  async getStartPlan(leagueId: number, teamId: number) {
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/pitching/start-plan`,
    );
  },

  async getSitStart(leagueId: number, teamId: number) {
    return fetchAPI(
      `/api/leagues/${leagueId}/teams/${teamId}/pitching/sit-start`,
    );
  },

  // Auction value validation
  async validateAuctionValues(params: {
    numTeams: number;
    categories: string; // JSON stringified array
    rosterSlots: string; // JSON stringified object
    budget?: number;
    minBid?: number;
    limit?: number;
    espnSeason: number;
    projectionsRunId?: number;
  }) {
    const queryParams = new URLSearchParams();
    // Add all params to query string
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    });

    const response = await fetch(
      `${API_URL}/api/draft/auction/validate?${queryParams}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error ||
          errorData.details ||
          "Failed to validate auction values",
      );
    }

    return response.json();
  },

  // Change log (Phase 81)
  async getChangeLogHistory(leagueId: number, limit = 50) {
    return fetchAPI(
      `/api/leagues/${leagueId}/standings/change-log?limit=${limit}`,
    );
  },

  getChangeLogSSEUrl(leagueId: number): string {
    return `${API_URL}/api/leagues/${leagueId}/standings/live-log`;
  },

  // Phase 82: manual live refresh trigger
  async triggerLiveRefresh(
    leagueId: number,
  ): Promise<{ polledAt: string; eventCount: number }> {
    return fetchAPI(`/api/leagues/${leagueId}/live-refresh`, {
      method: "POST",
    });
  },

  // Phase 83: standings neighborhood
  async getStandingsNeighborhood(
    leagueId: number,
    teamId: number,
  ): Promise<{
    neighborhood: Array<{
      teamId: number;
      teamName: string;
      overallPoints: number;
      overallRank: number;
      isMyTeam: boolean;
      projectedPoints: number | null;
      projectedRank: number | null;
    }>;
    snapshotDate: string;
  }> {
    return this.get(
      `/api/leagues/${leagueId}/teams/${teamId}/standings/neighborhood`,
    );
  },
};
