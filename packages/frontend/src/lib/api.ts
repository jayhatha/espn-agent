const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Mutex for refresh token rotation - prevents multiple concurrent refresh calls
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // Attempt silent refresh before giving up
    const refreshed = await tryRefresh();
    if (refreshed) {
      // Retry original request with fresh tokens
      const retryRes = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (retryRes.ok) {
        return retryRes.json();
      }
    }

    // Refresh failed or retry failed - redirect to login (unless already on an auth page)
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/signup' && path !== '/') {
        window.location.href = '/login';
      }
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
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
    return fetchAPI('/api/leagues');
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
    return fetchAPI('/api/leagues/connect', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Projections
  async uploadProjections(data: {
    battersCsv?: string;
    pitchersCsv?: string;
    asOfDate: string;
  }) {
    return fetchAPI('/api/projections/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getProjections(limit = 20) {
    return fetchAPI(`/api/projections?limit=${limit}`);
  },

  // Time series
  async getOverallTimeSeries(
    leagueId: number,
    params?: { from?: string; to?: string; teamIds?: string; season?: string },
  ) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI(`/api/leagues/${leagueId}/timeseries/overall?${query}`);
  },

  async getCategoryRankTimeSeries(
    leagueId: number,
    categoryId: string,
    params?: { from?: string; to?: string; teamIds?: string; season?: string },
  ) {
    const query = new URLSearchParams({
      ...params,
      categoryId,
    } as any).toString();
    return fetchAPI(`/api/leagues/${leagueId}/timeseries/category-rank?${query}`);
  },

  async getProjectedOverallTimeSeries(
    leagueId: number,
    params?: { from?: string; to?: string; teamIds?: string; season?: string },
  ) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI(`/api/leagues/${leagueId}/timeseries/projected-overall?${query}`);
  },

  async getLeagueSeasons(leagueId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/seasons`);
  },

  // Recommendations
  async getWaiverRecommendations(
    leagueId: number,
    teamId: number,
    params?: { snapshotDate?: string; maxRecommendations?: number },
  ) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/waivers/recommendations?${query}`);
  },

  // Teams
  async getTeams(leagueId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/teams`);
  },

  // Snapshots
  async triggerSnapshot(leagueId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/snapshot`, {
      method: 'POST',
    });
  },

  // Projected standings
  async getProjectedStandings(leagueId: number, params?: { snapshotDate?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI(`/api/leagues/${leagueId}/standings/projected${query ? '?' + query : ''}`);
  },

  // Free agents
  async getFreeAgents(leagueId: number, params?: { limit?: number; sortBy?: string; position?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI(`/api/leagues/${leagueId}/free-agents${query ? '?' + query : ''}`);
  },

  // Waiver evaluation
  async evaluateWaiver(leagueId: number, teamId: number, data: { addPlayerId: number; dropPlayerId?: number }) {
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/waivers/evaluate`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Trades
  async getTradePartners(leagueId: number, teamId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/trades/partners`);
  },

  async getTradeRosters(leagueId: number, teamId: number, partnerTeamId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/trades/partners/${partnerTeamId}/rosters`);
  },

  async validateTrade(leagueId: number, teamId: number, data: { givePlayers: number[]; receivePlayers: number[] }) {
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/trades/validate`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async analyzeTradeImpact(leagueId: number, teamId: number, data: { givePlayers: number[]; receivePlayers: number[] }) {
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/trades/impact`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getTradeRecommendations(leagueId: number, teamId: number, params?: { partnerTeamId?: number }) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/trades/recommendations${query ? '?' + query : ''}`);
  },

  // Team overview
  async getTeamOverview(leagueId: number, teamId: number, params?: { snapshotDate?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/overview${query ? '?' + query : ''}`);
  },

  // Team roster
  async getTeamRoster(leagueId: number, teamId: number) {
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/roster`);
  },

  // Lineup optimizer
  async getLineupRecommendations(leagueId: number, teamId: number, params?: { snapshotDate?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/lineup/recommendations${query ? '?' + query : ''}`);
  },

  // Streaming pitchers
  async getStreamingPitchers(leagueId: number, params?: { teamId?: number; startDate?: string; lookAheadDays?: number; limit?: number }) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI(`/api/leagues/${leagueId}/streaming-pitchers${query ? '?' + query : ''}`);
  },

  // League auth
  async updateLeagueAuth(leagueId: number, auth: { SWID?: string; espn_s2?: string }) {
    return fetchAPI(`/api/leagues/${leagueId}/auth`, {
      method: 'PATCH',
      body: JSON.stringify(auth),
    });
  },

  // Annotations
  async getAnnotations(leagueId: number, params?: { from?: string; to?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return fetchAPI(`/api/leagues/${leagueId}/timeseries/annotations${query ? '?' + query : ''}`);
  },

  // Auth
  async login(email: string, password: string) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(error.error || 'Login failed');
    }

    return res.json();
  },

  async signup(email: string, password: string, displayName?: string) {
    const res = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Signup failed' }));
      throw new Error(error.error || 'Signup failed');
    }

    return res.json();
  },

  async logout() {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  },

  async getProfile() {
    return fetchAPI('/api/auth/me');
  },

  // Admin
  async getAdminStats() {
    return fetchAPI('/api/admin/stats');
  },

  async getAdminUsers(page = 1, limit = 50) {
    return fetchAPI(`/api/admin/users?page=${page}&limit=${limit}`);
  },

  async updateUserRole(userId: number, role: 'user' | 'admin') {
    return fetchAPI(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  async getAdminLeagues() {
    return fetchAPI('/api/admin/leagues');
  },

  // Backfill
  async triggerBackfill(leagueId: number, data: { season: number; startWeek?: number; endWeek?: number }) {
    return fetchAPI(`/api/admin/leagues/${leagueId}/backfill`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getBackfillJobStatus(jobId: string) {
    return fetchAPI(`/api/admin/backfill-jobs/${jobId}`);
  },

  async getBackfillJobs() {
    return fetchAPI('/api/admin/backfill-jobs');
  },
};
