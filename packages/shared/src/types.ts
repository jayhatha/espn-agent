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

export interface DraftConfiguration {
  categories: Category[];
  rosterSlots: Record<string, number>;
  totalTeams: number;
  budget: number;
  minBid?: number;
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
  name: string;
  mlb_team: string | null;
  positions: string[];
  bats_throws: string | null;
  created_at: Date;
  // Added by migrations 007, 016, 018
  espn_player_id: number;
  pct_owned: number | null;
  current_season_stats_json: Record<string, number> | null;
  last_synced_at: Date | null;
  espn_asv: number | null;
}

// Team
export interface Team {
  id: number;
  league_id: number;
  espn_team_id: number;
  name: string;
  created_at: Date;
  user_id: number | null;
  faab_spent: number | null;
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
  espn_swid_encrypted: Buffer | string | null;
  espn_s2_encrypted: Buffer | string | null;
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

// Per-player, per-period stats with team association
// Enables tenure-based stats: stats accumulated while on a specific team
export interface PlayerPeriodStats {
  league_id: number;
  snapshot_date: string;
  scoring_period: number;
  player_id: number;
  team_id: number;
  lineup_slot_id: number | null;
  components_json: StatComponents;
}

export interface RosterMove {
  id: number;
  league_id: number;
  team_id: number;
  move_type: string;
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
  category_impacts: Record<string, unknown>;
  is_incomplete: boolean;
  computed_at: Date;
  shapley_impact: number | null;
  ci_low: number | null;
  ci_high: number | null;
  is_uncertain: boolean;
  sgp_category_impacts: Record<string, unknown> | null;
  replacement_level_impact: number | null;
  replacement_level_components: Record<string, number> | null;
}

// Move type for transaction tracking
export type MoveType = "add" | "drop" | "trade_in" | "trade_out" | "draft" | "unknown";

// Draft types
export interface AuctionValue {
  playerId: number;
  playerName: string;
  dollarValue: number;
  position: string;
  [key: string]: unknown;
}

export interface DraftRanking {
  playerId: number;
  playerName: string;
  rank: number;
  dollarValue: number;
  position: string;
  [key: string]: unknown;
}

// FAAB types
export interface FaabSummary {
  remainingBudget: number;
  totalBudget: number;
  spentAmount: number;
  leagueAvgRemaining: number;
  weeksRemaining: number;
  weeklyBurnRate: number;
  projectedRunout: string | null;
  [key: string]: unknown;
}

export interface FaabBidEntry {
  playerId: number;
  playerName: string;
  bidAmount: number;
  won: boolean;
  date: string;
  [key: string]: unknown;
}

export interface FaabSuggestedBid {
  playerId: number;
  playerName: string;
  suggestedBid: number;
  [key: string]: unknown;
}

// GS Pacing types
export type PaceStatus = "on_pace" | "burning_fast" | "too_slow" | "leaving_starts" | "unknown";

export interface GsSeasonSummary {
  gsUsed: number;
  gsCap: number;
  gsRemaining: number;
  paceStatus: PaceStatus;
  projectedTotal: number;
  [key: string]: unknown;
}

export interface GsWeeklySummary {
  weekNumber: number;
  gsUsed: number;
  gsAvailable: number;
  [key: string]: unknown;
}

export interface GsStartPlan {
  recommendations: GsStartRecommendation[];
  [key: string]: unknown;
}

export interface GsStartRecommendation {
  playerId: number;
  playerName: string;
  action: "start" | "sit";
  reason: string;
  [key: string]: unknown;
}

// Trade types
export interface RosterValidationResult {
  isLegal: boolean;
  issues: string[];
}

// External SP rankings (Pitcherlist, Rotoballer)
export interface ExternalRankingEntry {
  playerName: string;
  source: "pitcherlist" | "rotoballer";
  verdict: "start" | "lean_start" | "neutral" | "lean_sit" | "sit";
  tier?: string;
  grade?: number;
  sourceUrl: string;
  articleTitle: string;
  scrapedAt: string;
}
