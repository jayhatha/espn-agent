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
} from "../../../shared/dist/index.js";

/**
 * Database schema definition using Kysely
 * Based on DESIGN_DOC.md §4
 */

export interface Database {
  league: League;
  league_settings_version: LeagueSettingsVersion;
  team: Team;
  player: Player;
  player_identity_map: PlayerIdentityMap;
  league_raw_payload: LeagueRawPayload;
  league_daily_snapshot: LeagueDailySnapshot;
  team_daily_category_totals: TeamDailyCategoryTotals;
  team_daily_category_ranks: TeamDailyCategoryRanks;
  team_daily_overall: TeamDailyOverall;
  team_daily_projected_category: TeamDailyProjectedCategory;
  team_daily_projected_overall: TeamDailyProjectedOverall;
  team_roster_snapshot: TeamRosterSnapshot;
  league_transaction_event: LeagueTransactionEvent;
  projections_run: ProjectionsRun;
  player_projection: PlayerProjection;
  // Slack integration tables
  slack_installation: SlackInstallation;
  slack_user_link: SlackUserLink;
  slack_notification_target: SlackNotificationTarget;
  agent_report: AgentReport;
  agent_action: AgentAction;
  agent_action_decision: AgentActionDecision;
  slack_message_ref: SlackMessageRef;
}

export interface LeagueSettingsVersion {
  id: number;
  league_id: number;
  effective_date: string; // DATE
  settings_json: LeagueSettings;
  created_at: Date;
}

/**
 * Slack integration interfaces
 * Based on SLACK.md §4 data model
 */

export interface SlackInstallation {
  id: string;
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
  id: string;
  action_id: string;
  decided_by_slack_user_link_id: string;
  decision: 'approve' | 'reject' | 'modify';
  override_payload_json: object | null;
  decided_at: Date;
}

export interface SlackMessageRef {
  id: string;
  team_id: string;
  channel_id: string;
  message_ts: string;
  report_id: string | null;
  action_id: string | null;
  created_at: Date;
}
