-- Add Slack integration tables
-- Implements SLACK.md §4 data model

-- Enable UUID extension for primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Slack workspace installations (workspace-level OAuth)
CREATE TABLE slack_installation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id TEXT NOT NULL UNIQUE,
  enterprise_id TEXT,
  bot_token_encrypted BYTEA NOT NULL,
  bot_user_id TEXT NOT NULL,
  installer_slack_user_id TEXT NOT NULL,
  incoming_webhook_url_encrypted BYTEA,
  incoming_webhook_channel_id TEXT,
  incoming_webhook_channel_name TEXT,
  scopes TEXT NOT NULL,
  installed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP,
  last_ok_at TIMESTAMP,
  last_error JSONB
);

CREATE INDEX idx_slack_installation_team ON slack_installation(team_id);
CREATE INDEX idx_slack_installation_active ON slack_installation(revoked_at) WHERE revoked_at IS NULL;

-- 2. Link Slack users to fantasy teams
CREATE TABLE slack_user_link (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id TEXT NOT NULL REFERENCES slack_installation(team_id) ON DELETE CASCADE,
  slack_user_id TEXT NOT NULL,
  league_id INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  team_id_fantasy INTEGER NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, slack_user_id, league_id)
);

CREATE INDEX idx_slack_user_link_lookup ON slack_user_link(team_id, slack_user_id);
CREATE INDEX idx_slack_user_link_league ON slack_user_link(league_id);
CREATE INDEX idx_slack_user_link_team ON slack_user_link(team_id_fantasy);

-- 3. Notification delivery configuration
CREATE TABLE slack_notification_target (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slack_user_link_id UUID NOT NULL REFERENCES slack_user_link(id) ON DELETE CASCADE,
  league_id INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES slack_installation(team_id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('channel', 'dm')),
  channel_id TEXT,
  thread_ts TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (slack_user_link_id, league_id)
);

CREATE INDEX idx_notification_target_enabled ON slack_notification_target(is_enabled, league_id) WHERE is_enabled = TRUE;
CREATE INDEX idx_notification_target_team ON slack_notification_target(team_id);

-- 4. Agent reports (morning report tracking)
CREATE TABLE agent_report (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slack_user_link_id UUID NOT NULL REFERENCES slack_user_link(id) ON DELETE CASCADE,
  league_id INTEGER NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('morning')),
  summary_markdown TEXT NOT NULL,
  data_json JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (slack_user_link_id, league_id, report_date, kind)
);

CREATE INDEX idx_agent_report_lookup ON agent_report(league_id, report_date DESC);
CREATE INDEX idx_agent_report_user ON agent_report(slack_user_link_id);

-- 5. Agent actions (waiver recommendations, lineup changes, trades)
CREATE TABLE agent_action (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID NOT NULL REFERENCES agent_report(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('ADD_DROP', 'WAIVER_CLAIM', 'SET_LINEUP', 'TRADE_OFFER')),
  payload_json JSONB NOT NULL,
  expected_impact_json JSONB NOT NULL,
  risk_flags_json JSONB,
  evidence_json JSONB,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected', 'expired', 'executing', 'done', 'failed')),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_action_report ON agent_action(report_id);
CREATE INDEX idx_agent_action_status ON agent_action(status, expires_at);

-- 6. Agent action decisions (approval/rejection tracking)
CREATE TABLE agent_action_decision (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_id UUID NOT NULL REFERENCES agent_action(id) ON DELETE CASCADE,
  decided_by_slack_user_link_id UUID NOT NULL REFERENCES slack_user_link(id),
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'modify')),
  override_payload_json JSONB,
  decided_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_action_decision_action ON agent_action_decision(action_id);
CREATE INDEX idx_agent_action_decision_user ON agent_action_decision(decided_by_slack_user_link_id);

-- 7. Slack message references (for updating messages)
CREATE TABLE slack_message_ref (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id TEXT NOT NULL REFERENCES slack_installation(team_id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  message_ts TEXT NOT NULL,
  report_id UUID REFERENCES agent_report(id) ON DELETE CASCADE,
  action_id UUID REFERENCES agent_action(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, channel_id, message_ts)
);

CREATE INDEX idx_slack_message_ref_report ON slack_message_ref(report_id);
CREATE INDEX idx_slack_message_ref_action ON slack_message_ref(action_id);
CREATE INDEX idx_slack_message_ref_team ON slack_message_ref(team_id);
