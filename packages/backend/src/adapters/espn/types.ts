export interface ESPNAuthCookies {
  SWID?: string;
  espn_s2?: string;
}

export interface ESPNFetchOptions {
  leagueId: number;
  season: number;
  auth?: ESPNAuthCookies;
  views?: string[];
  scoringPeriodId?: number;
  xFantasyFilter?: Record<string, unknown>;
  /** ESPN team ID to include rosterForCurrentScoringPeriod in response */
  rosterForTeamId?: number;
}

export interface ESPNRawResponse {
  data: Record<string, unknown>;
  schemaFingerprint: string;
  fetchedAt: Date;
}

export interface ESPNScoringCategory {
  espnStatId: number;
  statKey: string;
  name: string;
  type: "COUNTING" | "RATE";
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
  formulaId?: string;
  requiredComponents?: string[];
}

export interface ESPNRosterEntry {
  espnPlayerId: number;
  name: string;
  mlbTeam: string;
  positions: string[];
  lineupSlotId: number;
  rosterStatus: "active" | "bench" | "il" | "na" | "unknown";
  rosterSlot: string;
  acquisitionType: string;
  injuryStatus?: string | null;
}

export interface ESPNTeamData {
  id: number;
  name: string;
  abbrev: string;
  statValues: Record<number, number>;
  roster: ESPNRosterEntry[];
  primaryOwner?: string;
  owners?: string[];
  faabSpent?: number;
  espnPoints?: number;
  espnPointsDelta?: number;
}

export interface ESPNFreeAgent {
  playerId: number;
  name: string;
  positions: string[];
  mlbTeam: string;
  pctOwned: number;
  pctStarted: number;
}

export interface ESPNGlobalDraftPlayer {
  playerId: number;
  playerName: string;
  positions: string[];
  mlbTeam: string;
  espnAuctionValue: number;
  rotoAuctionValue: number;
  averageDraftPosition: number;
  averageAuctionValue: number;
  percentOwned: number;
  percentStarted: number;
  rank: number;
  espnProjectedStats?: Record<string, number>;
}

export interface ESPNTransactionItem {
  playerId: number;
  playerName: string;
  fromTeamId: number | null;
  toTeamId: number | null;
  action: "ADD" | "DROP" | "TRADE_IN" | "TRADE_OUT";
}

export interface ESPNTransaction {
  transactionId: string;
  type: "ADD" | "DROP" | "TRADE" | "WAIVER" | "OTHER";
  timestamp: number;
  items: ESPNTransactionItem[];
  bidAmount?: number;
}

export interface ESPNLeagueData {
  settings: {
    name: string;
    scoringFormat: string;
    categories: ESPNScoringCategory[];
    rosterSlots: Record<string, number>;
    acquisitionRules: unknown;
  };
  teams: ESPNTeamData[];
  standings: Array<{
    teamId: number;
    stats: unknown[];
  }>;
  freeAgents?: Array<{
    playerId: number;
    name: string;
    positions: string[];
  }>;
  transactions?: Array<{
    id: string;
    type: string;
    timestamp: number;
  }>;
}
