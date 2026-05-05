/**
 * Centralised React Query key factories.
 *
 * Rules:
 * - Every key starts with the resource noun so prefix-invalidation works.
 * - Every request parameter that affects the response is part of the key.
 * - Use these factories everywhere; never hand-write query keys in components.
 */

export const queryKeys = {
  // ── League ──────────────────────────────────────────────────────────────
  league: {
    all: (leagueId: string | number) => ["league", leagueId] as const,
    teams: (leagueId: string | number) => ["league-teams", leagueId] as const,
  },

  // ── Team ────────────────────────────────────────────────────────────────
  team: {
    overview: (leagueId: string | number, teamId: number) =>
      ["team-overview", leagueId, teamId] as const,
    roster: (leagueId: string | number, teamId: number, snapshotDate?: string) =>
      ["roster", leagueId, teamId, snapshotDate] as const,
  },

  // ── Standings ────────────────────────────────────────────────────────────
  standings: {
    all: (leagueId: string | number) => ["standings", leagueId] as const,
    projected: (leagueId: string | number) => ["standings-projected", leagueId] as const,
    swing: (leagueId: string | number) => ["standings-swing", leagueId] as const,
  },

  // ── Timeseries ───────────────────────────────────────────────────────────
  timeseries: {
    overall: (leagueId: string | number) => ["timeseries-overall", leagueId] as const,
    projected: (leagueId: string | number) => ["timeseries-projected", leagueId] as const,
    categoryRank: (leagueId: string | number, categoryId?: string) =>
      ["timeseries-category", leagueId, categoryId] as const,
    categoryTotal: (leagueId: string | number) =>
      ["timeseries-category-total", leagueId] as const,
    annotations: (leagueId: string | number) =>
      ["timeseries-annotations", leagueId] as const,
  },

  // ── Waivers ──────────────────────────────────────────────────────────────
  waivers: {
    list: (leagueId: string | number) => ["waivers", leagueId] as const,
    recommendations: (
      leagueId: string | number,
      teamId: number,
      maxRecommendations: number,
    ) => ["waivers-recommendations", leagueId, teamId, maxRecommendations] as const,
  },

  // ── Trades ───────────────────────────────────────────────────────────────
  trades: {
    recommendations: (leagueId: string | number, teamId: number) =>
      ["trades-recommendations", leagueId, teamId] as const,
  },

  // ── Pitching ─────────────────────────────────────────────────────────────
  pitching: {
    sitStart: (leagueId: string | number, teamId?: number) =>
      ["sit-start", leagueId, teamId] as const,
    streamers: (leagueId: string | number) =>
      ["streaming-pitchers", leagueId] as const,
    gsSummary: (leagueId: string | number, teamId?: number) =>
      ["gs-summary", leagueId, teamId] as const,
    gsWeekly: (leagueId: string | number, teamId?: number) =>
      ["gs-weekly", leagueId, teamId] as const,
  },

  // ── FAAB ─────────────────────────────────────────────────────────────────
  faab: {
    summary: (leagueId: string | number) => ["faab-summary", leagueId] as const,
  },

  // ── Dashboard ────────────────────────────────────────────────────────────
  dashboard: {
    topbarProjected: (leagueId: string | number) =>
      ["topbar-projected", leagueId] as const,
  },

  // ── Change Log / Streaming Results ───────────────────────────────────────
  changelog: {
    events: (leagueId: string | number) => ["changelog-events", leagueId] as const,
  },
} as const;
