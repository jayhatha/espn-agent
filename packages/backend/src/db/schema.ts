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

export interface SeasonMetadata {
  league_id: number;
  season: number;
  is_finalized: boolean;
  finalized_at: Date | null;
  snapshot_count: number | null;
  created_at: Date;
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
  // Slack integration tables
  slack_installation: SlackInstallation;
  slack_user_link: SlackUserLink;
  slack_notification_target: SlackNotificationTarget;
  agent_report: AgentReport;
  agent_action: AgentAction;
  agent_action_decision: AgentActionDecision;
  slack_message_ref: SlackMessageRef;
  // Injury tracking
  injury_event: WithGeneratedId<InjuryEvent>;
  // Season finalization (Phase 74)
  season_metadata: SeasonMetadata;
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

/**
 * Slack integration interfaces
 * Based on SLACK.md §4 data model
 */

export interface SlackInstallation {
  id: Generated<string>;
  team_id: string;
  enterprise_id: string | null;
  bot_token_encrypted: Buffer;
  bot_user_id: string;
  installer_slack_user_id: string;
  incoming_webhook_url_encrypted: Buffer | null;
  incoming_webhook_channel_id: string | null;
  incoming_webhook_channel_name: string | null;
  scopes: string;
  installed_at: Date;
  revoked_at: Date | null;
  last_ok_at: Date | null;
  last_error: object | null;
}

export interface SlackUserLink {
  id: string;
  team_id: string;
  slack_user_id: string;
  league_id: number;
  team_id_fantasy: number;
  created_at: Date;
}

export interface SlackNotificationTarget {
  id: string;
  slack_user_link_id: string;
  league_id: number;
  team_id: string;
  target_type: 'channel' | 'dm';
  channel_id: string | null;
  thread_ts: string | null;
  is_enabled: boolean;
  quiet_hours_json: object | null;
  created_at: Date;
  updated_at: Date;
}

export interface AgentReport {
  id: string;
  slack_user_link_id: string;
  league_id: number;
  report_date: string; // DATE
  kind: 'morning';
  summary_markdown: string;
  data_json: object;
  created_at: Date;
}

export interface AgentAction {
  id: string;
  report_id: string;
  action_type: 'ADD_DROP' | 'WAIVER_CLAIM' | 'SET_LINEUP' | 'TRADE_OFFER';
  payload_json: object;
  expected_impact_json: object;
  risk_flags_json: object | null;
  evidence_json: object | null;
  status: 'proposed' | 'approved' | 'rejected' | 'expired' | 'executing' | 'done' | 'failed';
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface AgentActionDecision {
  id: Generated<string>;
  action_id: string;
  decided_by_slack_user_link_id: string;
  decision: 'approve' | 'reject' | 'modify';
  override_payload_json: object | null;
  decided_at: Date;
}

export interface SlackMessageRef {
  id: Generated<string>;
  team_id: string;
  channel_id: string;
  message_ts: string;
  report_id: string | null;
  action_id: string | null;
  created_at: Date;
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
