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

// Draft configuration for generic draft endpoints
export interface DraftConfiguration {
  categories: Category[];
  rosterSlots: Record<string, number>;
  totalTeams: number;
  budget?: number;      // Auction only (default: 260)
  minBid?: number;      // Auction only (default: 1)
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
  id: number; // ESPN player ID (primary key)
  name: string;
  mlb_team: string | null;
  positions: string[];
  bats_throws: string | null;
  created_at?: Date; // Has DEFAULT NOW() in database
  pct_owned?: number | null; // Player pool sync columns
  current_season_stats_json?: Record<string, number> | null;
  last_synced_at?: Date | null;
  injury_status?: string | null; // 'IL', 'DTD', 'OUT', 'HEALTHY', or NULL
  injury_updated_at?: Date | null;
  espn_asv?: number | null; // ESPN Average Season Value (auction dollar value)
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
  role: "user" | "admin";
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
  user: Omit<User, "createdAt">;
}

// Draft and auction types
export interface DraftRanking {
  playerId: number;
  playerName: string;
  positions: string[];
  primaryPosition: string;
  vbdScore: number;
  sgpTotal: number;
  categorySGPs: Record<string, number>;
  projectedStats: StatComponents;
  tier: number; // Players grouped into value tiers
  adp?: number; // Average draft position for comparison
  tierName?: string;       // External tier name (e.g., "STUD", "Elite")
  externalRank?: number;   // External ranking number
  rankSource?: string;     // Source of external rank ("PL" = PitcherList, "CM" = CloserMonkey)
  espnAuctionValue?: number; // ESPN pre-draft auction dollar value
}

export interface AuctionValue {
  playerId: number;
  playerName: string;
  positions: string[];
  primaryPosition: string;
  dollarValue: number;
  vbdScore: number;
  sgpTotal: number;
  projectedStats?: StatComponents;
  inflationAdjustedValue?: number;
}

export interface DraftContext {
  totalTeams: number;
  rosterSlots: Record<string, number>;
  categories: Category[];
  budget?: number; // For auction (default 260)
  minBid?: number; // For auction (default 1)
}

// Transaction Impact Analysis (Roto WPA) types

export type MoveType = "draft" | "add" | "drop" | "trade_in" | "trade_out";

export interface PlayerPeriodStats {
  league_id: number;
  snapshot_date: string;
  scoring_period: number;
  player_id: number;
  team_id: number;
  lineup_slot_id: number | null;
  components_json: Record<string, number>;
}

export interface RosterMove {
  id: number;
  league_id: number;
  team_id: number;
  move_type: MoveType;
  player_id: number;
  effective_date: string;
  paired_move_id: number | null;
}

export interface TransactionImpact {
  id: number;
  league_id: number;
  team_id: number;
  move_type: string;
  player_gained_id: number | null;
  player_lost_id: number | null;
  effective_date: string;
  gained_components: Record<string, number> | null;
  lost_components: Record<string, number> | null;
  impact_roto_points: number;
  category_impacts: Array<{
    categoryId: string;
    actualValue: number;
    counterfactualValue: number;
    deltaRotoPoints: number;
  }>;
  is_incomplete: boolean;
  computed_at: Date;
  shapley_impact: number | null;
  ci_low: number | null;
  ci_high: number | null;
  is_uncertain: boolean;
  sgp_category_impacts: Array<{
    categoryId: string;
    sgpDelta: number;
    rawDelta: number;
    sgpFactor: number;
  }> | null;
  replacement_level_components: Record<string, number> | null;
  replacement_level_impact: number | null;
}

// Trade validation types
export interface RosterValidationResult {
  isLegal: boolean;
  issues: string[];
}

export interface TradeValidationRequest {
  givePlayers: number[];
  receivePlayers: number[];
}

export interface TradeValidationResponse {
  isLegal: boolean;
  issues: string[];
  giveCount: number;
  receiveCount: number;
}

// FAAB Tracking types

export interface FaabSummary {
  teamId: number;
  faabTotal: number;
  faabSpent: number;
  faabRemaining: number;
  leagueAvgRemaining: number;
  spendRate: number; // $ per week
  projectedRunoutWeek: number | null;
  weeksRemaining: number;
  weeksElapsed: number;
  willRunOut: boolean;
}

export interface FaabBidEntry {
  date: string;
  playerName: string;
  playerId: number;
  bidAmount: number;
  outcome: "won" | "lost";
  roi: number | null; // projected value / bid amount
}

export interface FaabSuggestedBid {
  playerId: number;
  playerName: string;
  suggestedBid: number;
  faabRemaining: number;
  rationale: string;
}

// GS Pacing types

export type PaceStatus = "on_track" | "burning_fast" | "too_slow";

export interface GsSeasonSummary {
  gsUsed: number;
  gsCap: number;
  gsRemaining: number;
  projectedFinal: number;
  pacePerWeek: number;
  targetPacePerWeek: number;
  paceStatus: PaceStatus;
  weeksElapsed: number;
  weeksRemaining: number;
}

export interface GsWeeklySummary {
  weekStart: string;
  weekEnd: string;
  startsUsed: number;
  startsRemaining: number;
  targetPerWeek: number;
  pitcherStarts: Array<{
    playerName: string;
    playerId: number;
    dates: string[];
  }>;
}

export type StartAction = "start" | "sit" | "stream";

export interface GsStartRecommendation {
  playerId: number;
  playerName: string;
  action: StartAction;
  reason: string;
  projectedK: number | null;
  projectedIP: number | null;
  kPerGs: number | null;
}

export interface GsStartPlan {
  paceStatus: PaceStatus;
  recommendations: GsStartRecommendation[];
  alert: string | null;
}

// Chrome Extension Draft Assistant Types

export interface DraftPick {
  playerId: number;
  playerName: string;
  teamId: string;
  teamName: string;
  pickNumber: number;
  timestamp: number;
  cost?: number; // Auction only
  positions: string[];
  adp?: number; // Average draft position for context
}

export interface DraftedPlayer {
  playerId: number;
  playerName: string;
  positions: string[];
  pickNumber: number;
  cost?: number; // Auction only
  projectedStats: StatComponents;
}
