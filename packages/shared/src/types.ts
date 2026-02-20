// Core type definitions for ESPN Fantasy Baseball Assistant

export type Provider = "espn";

export type ScoringFormat = "roto" | "h2h_category" | "points";

export type CategoryType = "COUNTING" | "RATE" | "POINTS";

export type CategoryDirection = "HIGHER_BETTER" | "LOWER_BETTER";

export type RosterStatus = "active" | "bench" | "il" | "na" | "unknown";

export type TransactionEventType =
  | "add"
  | "drop"
  | "trade"
  | "waiver"
  | "other";

export type ProjectionStaleness = "fresh" | "stale" | "missing";

export type ResolutionMethod =
  | "exact_match"
  | "fuzzy_match"
  | "manual_override";

// Category definition
export interface Category {
  category_id: string;
  name: string;
  stat_key: string;
  type: CategoryType;
  direction: CategoryDirection;
  required_components?: string[];
  formula_id?: string;
}

// League settings
export interface LeagueSettings {
  scoring_format: ScoringFormat;
  categories: Category[];
  roster_slots: Record<string, number>;
  acquisition_rules: {
    waiver_type?: string;
    acquisition_limit?: number;
    trade_deadline?: string;
  };
}

// Component stats for rate calculation
export interface StatComponents {
  // Hitter components
  AB?: number;
  H?: number;
  BB?: number;
  HBP?: number;
  SF?: number;
  TB?: number;
  R?: number;
  HR?: number;
  RBI?: number;
  SB?: number;
  // Pitcher components
  IP?: number;
  ER?: number;
  W?: number;
  SV?: number;
  HLD?: number;
  QS?: number;
  K?: number;
  [key: string]: number | undefined;
}

// Player
export interface Player {
  id: number;
  espn_player_id: number;
  name: string;
  mlb_team: string | null;
  positions: string[];
  bats_throws: string | null;
  created_at: Date;
}

// Team
export interface Team {
  id: number;
  league_id: number;
  espn_team_id: number;
  name: string;
  user_id: number | null;
  created_at: Date;
}

// League
export interface League {
  id: number;
  provider: Provider;
  espn_league_id: number;
  season: number;
  name: string;
  timezone: string;
  espn_swid: string | null;
  espn_s2: string | null;
  espn_swid_encrypted: Buffer | null;
  espn_s2_encrypted: Buffer | null;
  user_team_id: number | null;
  created_at: Date;
}

// Snapshot
export interface LeagueDailySnapshot {
  league_id: number;
  snapshot_date: string; // DATE in ISO format
  created_at: Date;
  settings_version_id: number;
  projections_run_id: number | null;
  is_degraded: boolean;
  degraded_reasons: string[];
}

// Projections run
export interface ProjectionsRun {
  id: number;
  source: string;
  system: string;
  as_of_date: string; // DATE in ISO format
  ingested_at: Date;
  staleness: ProjectionStaleness;
  artifacts_json: Record<string, unknown> | null;
}

// Player projection
export interface PlayerProjection {
  projections_run_id: number;
  player_id: number;
  stat_components_json: StatComponents;
}

// Team category totals
export interface TeamDailyCategoryTotals {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  category_id: string;
  value: number;
  components_json: StatComponents | null;
}

// Team category ranks
export interface TeamDailyCategoryRanks {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  category_id: string;
  rank: number;
  roto_points: number | null;
}

// Team overall standings
export interface TeamDailyOverall {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  overall_points: number;
  overall_rank: number;
}

// Projected standings
export interface TeamDailyProjectedCategory {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  category_id: string;
  projected_value: number;
  projected_rank: number;
  projected_roto_points: number | null;
  projected_components_json: StatComponents | null;
}

export interface TeamDailyProjectedOverall {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  projected_overall_points: number;
  projected_overall_rank: number;
}

// Transaction event
export interface LeagueTransactionEvent {
  id: number;
  league_id: number;
  event_time: Date;
  event_date: string; // DATE in ISO format
  event_type: TransactionEventType;
  team_id: number;
  counterparty_team_id: number | null;
  players_added: number[];
  players_dropped: number[];
  espn_event_id: string | null;
  payload_hash: string;
  raw_event_json: Record<string, unknown>;
}

// Roster snapshot
export interface TeamRosterSnapshot {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  player_id: number;
  roster_status: RosterStatus;
  roster_slot: string | null;
  acquisition_type: string | null;
}

// Raw payload archive
export interface LeagueRawPayload {
  id: number;
  league_id: number;
  fetched_at: Date;
  endpoint: string;
  views: string[];
  scoring_period_id: number | null;
  x_fantasy_filter: Record<string, unknown> | null;
  response_json: Record<string, unknown>;
  schema_fingerprint: string;
}

// Player identity map
export interface PlayerIdentityMap {
  player_id: number;
  fangraphs_key: string | null;
  confidence: number;
  resolution_method: ResolutionMethod;
  updated_at: Date;
}

// Authentication & User types
export interface User {
  id: number;
  email: string;
  role: 'user' | 'admin';
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthResponse {
  user: Omit<User, 'createdAt'>;
}
