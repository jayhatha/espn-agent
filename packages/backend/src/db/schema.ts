import type { Generated } from "kysely";
import type {
  League,
  Team,
  Player,
  LeagueSettings,
  LeagueDailySnapshot,
  TeamDailyCategoryTotals,
  TeamDailyCategoryRanks,
  TeamDailyOverall,
  TeamDailyProjectedCategory,
  TeamDailyProjectedOverall,
  TeamRosterSnapshot,
  LeagueTransactionEvent,
  LeagueRawPayload,
  ProjectionsRun,
  PlayerProjection,
  PlayerIdentityMap,
  PlayerPeriodStats,
  RosterMove,
  TransactionImpact,
} from "../../../shared/dist/index.js";

/**
 * Database schema definition using Kysely
 * Based on DESIGN_DOC.md §4
 */

/** Helper: marks `id` as auto-generated so Kysely treats it as optional on insert */
type WithGeneratedId<T extends { id: unknown }> = Omit<T, "id"> & {
  id: Generated<T["id"]>;
};

export interface StandingsChangeEventRow {
  id: Generated<number>;
  league_id: number;
  team_id: number;
  snapshot_date: string;
  occurred_at: Generated<Date>;
  category_id: string;
  category_name: string;
  prev_roto_pts: number;
  curr_roto_pts: number;
  roto_delta: number;
  passed_team_id: number | null;
  passed_team_name: string | null;
  direction: "gained" | "lost";
  event_source: string; // "live" | "snapshot"
  proximate_cause: {
    playerName: string;
    stat: string;
    value: number;
    description: string;
  } | null;
}

export interface SeasonMetadata {
  league_id: number;
  season: number;
  is_finalized: boolean;
  finalized_at: Date | null;
  snapshot_count: number | null;
  created_at: Generated<Date>;
}

export interface Database {
  league: WithGeneratedId<League>;
  league_settings_version: LeagueSettingsVersion;
  team: WithGeneratedId<Team>;
  player: Player;
  player_identity_map: PlayerIdentityMap;
  league_raw_payload: WithGeneratedId<LeagueRawPayload>;
  league_daily_snapshot: LeagueDailySnapshot;
  league_free_agent_snapshot: LeagueFreeAgentSnapshot;
  team_daily_category_totals: TeamDailyCategoryTotals;
  team_daily_category_ranks: TeamDailyCategoryRanks;
  team_daily_overall: TeamDailyOverall;
  team_daily_projected_category: TeamDailyProjectedCategory;
  team_daily_projected_overall: TeamDailyProjectedOverall;
  team_roster_snapshot: TeamRosterSnapshot;
  league_transaction_event: WithGeneratedId<LeagueTransactionEvent>;
  projections_run: WithGeneratedId<ProjectionsRun>;
  player_projection: PlayerProjection;
  // Transaction Impact Analysis (Roto WPA)
  player_period_stats: PlayerPeriodStats;
  roster_move: WithGeneratedId<RosterMove>;
  transaction_impact: WithGeneratedId<TransactionImpact>;
  // Auth tables
  users: UsersTable;
  refresh_tokens: RefreshTokensTable;
  // Injury tracking
  injury_event: WithGeneratedId<InjuryEvent>;
  // Season finalization (Phase 74)
  season_metadata: SeasonMetadata;
  // Phase 81: Standings change event log
  standings_change_event: StandingsChangeEventRow;
}

export interface LeagueSettingsVersion {
  id: Generated<number>;
  league_id: number;
  effective_date: string; // DATE
  settings_json: LeagueSettings;
  created_at: Date;
}

/**
 * Auth table interfaces
 */

export interface UsersTable {
  id: Generated<number>;
  email: string;
  email_verified: Generated<boolean>;
  password_hash: string | null;
  role: Generated<string>;
  google_id: string | null;
  github_id: string | null;
  oauth_provider: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  last_login_at: Date | null;
}

export interface RefreshTokensTable {
  id: Generated<number>;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  created_at: Generated<Date>;
}

export interface InjuryEvent {
  id: number;
  player_id: number;
  event_date: string; // DATE
  injury_status: string;
  notes: string | null;
  created_at: Date;
}

export interface LeagueFreeAgentSnapshot {
  league_id: number;
  snapshot_date: string; // DATE
  player_id: number;
  ownership_pct: number | null;
  started_pct: number | null;
  created_at: Date;
}
