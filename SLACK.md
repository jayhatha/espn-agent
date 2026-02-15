# SLACK_AGENT_DESIGN.md — Slack App + Morning Report Agent (Implementation Spec)

This document specifies the :contentReference[oaicite:0]{index=0} app + agent subsystem for the ESPN Fantasy Baseball Assistant. It is written as an implementation-ready spec (endpoints, data models, state machines, message payloads, failure modes).

---

## 1) Scope

### 1.1 Goals

1. Deliver a **daily morning report** per user+league:
   - relevant injuries / playing time changes
   - closer/relief role changes and saves/holds context
   - start/sit notes (especially pitchers/relievers)
   - waiver-wire watchlist + action plan leading into the next FAAB run
2. Provide **interactive approvals** in Slack for recommended actions (approve / reject / modify).
3. Record a complete audit trail:
   - what was recommended, why, expected impact
   - what was approved/rejected/modified
   - what was executed (or queued as a “checklist” in safe mode)
4. Be robust against:
   - Slack retries
   - rate limits
   - token revocations
   - timeouts (must `ack` quickly)

### 1.2 Non-goals (v1)

- Fully autonomous execution without user approval.
- Real-time “push on every news item” (we’ll do scheduled report + optionally high-severity alerts later).
- Slack events ingestion for every message in channels (not needed).

---

## 2) Slack App Configuration

### 2.1 Slack features to enable

Enable in Slack app settings:

- **OAuth & Permissions** (install flow) :contentReference[oaicite:1]{index=1}
- **Interactivity & Shortcuts** (button clicks, modals) :contentReference[oaicite:2]{index=2}
- **Incoming Webhooks** (optional; useful if you want a user-selected default channel during install) :contentReference[oaicite:3]{index=3}
- **Slash Commands** (optional but recommended: `/fantasy`) to let users connect quickly
- **Bot User** (for `chat.postMessage`)

### 2.2 OAuth install modes

Support two entry points:

1. **Web app initiated install (recommended)**  
   User clicks “Connect Slack” inside your web app → starts OAuth → stores installation.
2. **Slack initiated connect (optional)**  
   User runs `/fantasy connect` → bot returns a “Link your account” URL to your web app, then completes OAuth.

OAuth mechanics are standard: exchange code for token at the end of flow. :contentReference[oaicite:4]{index=4}

### 2.3 Scopes (minimum + optional)

**Minimum**

- `chat:write` (post messages) (via Web API)
- `commands` (if using slash commands)
- `incoming-webhook` (if you want “install-time channel selection” webhook URL) :contentReference[oaicite:5]{index=5}

**Recommended for DMs**

- `im:write` (open DM channel)
- `chat:write.public` (if posting to channels the app isn’t a member of; prefer inviting the bot instead)

**Nice-to-have**

- `users:read` (resolve display names)
- `channels:read` / `conversations:read` (if you want a channel picker inside your app)

Keep scopes minimal to reduce install friction.

---

## 3) Security & Request Verification

### 3.1 Verify requests from Slack (mandatory)

All requests from Slack to your server (interactions, commands) must be verified using:

- `X-Slack-Signature`
- `X-Slack-Request-Timestamp`
- your app **signing secret** :contentReference[oaicite:6]{index=6}

Important implementation detail: signature verification requires the **raw request body** (unaltered). Ensure your HTTP framework preserves raw bytes before parsing JSON/form bodies. :contentReference[oaicite:7]{index=7}

### 3.2 Replay protection

Reject requests with timestamps older than a small window (commonly 5 minutes). Slack verification guidance discusses timestamp + signature usage. :contentReference[oaicite:8]{index=8}

---

## 4) Data Model (DB tables)

### 4.1 Slack installations (workspace-level)

`slack_installation`

- `id` (uuid)
- `team_id` (string) — Slack workspace id
- `enterprise_id` (nullable)
- `bot_token_encrypted`
- `bot_user_id`
- `installer_slack_user_id`
- `incoming_webhook_url_encrypted` (nullable)
- `incoming_webhook_channel_id` (nullable)
- `incoming_webhook_channel_name` (nullable)
- `scopes` (string)
- `installed_at`
- `revoked_at` (nullable)
- `last_ok_at` (nullable)
- `last_error` (nullable json)

### 4.2 Link Slack user ↔ app user

`slack_user_link`

- `id`
- `team_id`
- `slack_user_id`
- `app_user_id`
- `created_at`

### 4.3 Notification targets/preferences

`slack_notification_target`

- `id`
- `app_user_id`
- `league_id`
- `team_id` (Slack workspace id)
- `target_type` = `channel` | `dm`
- `channel_id` (nullable)
- `thread_ts` (nullable; for “always thread” mode)
- `is_enabled`
- `quiet_hours_json` (nullable)
- `created_at`, `updated_at`

### 4.4 Reports + actions + approvals

`agent_report`

- `id`
- `app_user_id`
- `league_id`
- `report_date` (date in user timezone)
- `kind` = `morning`
- `summary_markdown`
- `data_json` (structured payload)
- `created_at`

`agent_action`

- `id` (uuid)
- `report_id`
- `action_type` = `ADD_DROP | WAIVER_CLAIM | SET_LINEUP | TRADE_OFFER`
- `payload_json` (player ids, drop ids, suggested FAAB range, etc.)
- `expected_impact_json` (category deltas, projected points delta)
- `risk_flags_json`
- `evidence_json` (URLs + excerpts)
- `status` = `proposed | approved | rejected | expired | executing | done | failed`
- `expires_at`
- `created_at`, `updated_at`

`agent_action_decision`

- `id`
- `action_id`
- `decided_by_app_user_id`
- `decision` = `approve | reject | modify`
- `override_payload_json` (if modify)
- `decided_at`

### 4.5 Slack message tracking (for updates)

`slack_message_ref`

- `id`
- `team_id`
- `channel_id`
- `message_ts`
- `report_id` (nullable)
- `action_id` (nullable)
- `created_at`

---

## 5) System Components

### 5.1 Slack Gateway (inside API service)

Responsibilities:

- OAuth start/callback
- command handler (optional)
- interactivity handler (block actions, modal submits)
- message sending (chat.postMessage / response_url updates)
- rate-limit handling + retries
- idempotency

### 5.2 Morning Report Agent (worker job)

Responsibilities:

- assemble inputs (league snapshot, projections, events, waiver pool)
- generate report sections + ranked actions
- write `agent_report` + `agent_action`
- send Slack message(s) with action buttons

### 5.3 Execution Worker (feature-flagged)

Responsibilities:

- when action approved:
  - in **safe mode**: create checklist + deep links, post confirmation
  - in **automated mode**: attempt ESPN write, verify, post result

---

## 6) Scheduling & Job Triggers

### 6.1 Schedule

- Morning report: default 07:00 America/Los_Angeles (user-configurable later).
- Implement via Kubernetes CronJob calling internal API endpoint (or enqueueing directly).

### 6.2 Internal trigger endpoints

All require `Authorization: Bearer $INTERNAL_JOB_TOKEN`.

- `POST /internal/jobs/morning-report`  
  Body: `{ "date": "YYYY-MM-DD" }` (optional; default today)
  Behavior:
  - find enabled `slack_notification_target` records
  - enqueue `GenerateMorningReport(app_user_id, league_id, date)`

- `POST /internal/jobs/content-ingest`  
  (Optional; used to refresh the underlying “events” powering the report.)

---

## 7) Slack Message UX

### 7.1 Channel vs DM strategy

Default v1:

- Post morning report to a chosen **channel** (install-time channel via incoming webhook, or user-selected in app).
- Support DM as an option via `im:write`.

Recommended behavior:

- If target_type = channel → post to channel.
- If target_type = dm → open DM channel and post.

### 7.2 Morning report message format

One message with:

1. Header (league, date, quick status)
2. “What changed” bullets
3. Start/sit bullets
4. Waiver watchlist bullets
5. Action plan cards with buttons

Keep it short. Users can click “Open full report” deep link to web app.

### 7.3 Action cards with approvals

Each action card includes buttons:

- ✅ Approve
- ❌ Reject
- ✏️ Modify (opens modal)

Use Block Kit interactive components. Slack will deliver an interaction payload to your Request URL. :contentReference[oaicite:9]{index=9}

### 7.4 Interaction requirements

- Must `ack` within ~3 seconds (implementation: acknowledge immediately, then enqueue work).
- To update the original message (e.g., mark an action Approved), use `response_url` with `replace_original: true` or post a threaded update. :contentReference[oaicite:10]{index=10}

---

## 8) Block Kit Payload Templates (examples)

### 8.1 Morning report (skeleton)

Use a single message with multiple sections and dividers.

**Block IDs and action IDs must be stable and machine-readable.**  
Include:

- `report_id`
- `action_id`
- `league_id`
  in button `value` as compact JSON or a token referencing DB rows.

Example button `value`:

- `"v":1,"action_id":"...","report_id":"..."` (stringified JSON)

### 8.2 Approve/Reject buttons

Each action row includes two buttons:

- action_id: `approve_action`
- action_id: `reject_action`

### 8.3 Modify modal

When user clicks Modify:

- open a modal asking:
  - FAAB bid (number) if relevant
  - drop candidate selection (if multiple)
  - optional notes

Modal submission triggers `view_submission` interaction payload.

---

## 9) HTTP Endpoints (Public)

### 9.1 OAuth

- `GET /slack/oauth/start`
  - requires authenticated app session
  - builds Slack OAuth URL with state (CSRF token + app_user_id)
- `GET /slack/oauth/callback`
  - validate state
  - exchange code for bot token (OAuth v2) :contentReference[oaicite:11]{index=11}
  - store `slack_installation`
  - optionally store incoming webhook details if enabled :contentReference[oaicite:12]{index=12}
  - redirect to integrations success page

### 9.2 Interactivity

- `POST /slack/interactive`
  - verify signature :contentReference[oaicite:13]{index=13}
  - parse payload (form-encoded; JSON in `payload=` field)
  - `ack` immediately (HTTP 200)
  - enqueue handler based on interaction type:
    - `block_actions` (button click)
    - `view_submission` (modal submit)
  - store dedupe key:
    - `team_id + user_id + action_ts + action_id + message_ts`

### 9.3 Slash commands (optional)

- `POST /slack/commands`
  - verify signature :contentReference[oaicite:14]{index=14}
  - support:
    - `/fantasy connect` → returns link to web app integration page
    - `/fantasy report` → triggers on-demand report run (rate-limited)

---

## 10) Interaction Handling Logic

### 10.1 Approve button flow

Input: Slack `block_actions` payload containing:

- team_id, user.id, channel.id, message.ts
- action.value (contains action_id/report_id)

Steps:

1. `ack` immediately.
2. Verify Slack user is linked (`slack_user_link`) OR require that they authenticate once.
3. Load `agent_action` by `action_id`.
4. Validate:
   - action status is `proposed`
   - not expired
   - user has permission for league
5. Write `agent_action_decision` (approve), set action status `approved`.
6. Enqueue execution:
   - safe mode: create checklist task
   - automated mode: attempt ESPN write
7. Update Slack message UI:
   - Use `response_url` to update the original message so the action card shows “Approved” (disable buttons) :contentReference[oaicite:15]{index=15}
   - Optionally post a thread reply confirming next steps.

### 10.2 Reject flow

Same as approve but:

- status → `rejected`
- update Slack message to reflect rejection

### 10.3 Modify flow

Button click:

- open modal (pre-fill suggested FAAB, drop candidate)
  Modal submit:
- validate fields
- write decision with overrides
- status → `approved`
- enqueue execution with overridden payload

---

## 11) Rate Limits, Retries, Idempotency

### 11.1 Slack Web API rate limits

Slack returns HTTP **429** and a `Retry-After` header. Your sender must respect it. :contentReference[oaicite:16]{index=16}

Implementation:

- Create a per-workspace message send queue.
- On 429:
  - pause queue for `Retry-After` seconds
  - retry with exponential backoff + jitter
- Ensure `chat.postMessage` throughput limits: roughly ~1 msg/sec per channel baseline. :contentReference[oaicite:17]{index=17}

### 11.2 Slack retry behavior on your endpoints

Slack may retry if it doesn’t receive a timely 200.
Therefore:

- Always `ack` immediately.
- Make interaction handlers idempotent via dedupe keys:
  - ignore repeats if a decision already exists for `(action_id, slack_user_id, decision_type)`.

### 11.3 Exactly-once semantics (practical)

You won’t get true exactly-once; you will get “at-least-once delivery.”
Your DB constraints + dedupe keys must make operations safe to repeat.

---

## 12) Error Handling & User Messaging

### 12.1 Common errors

- Token revoked / app removed from workspace:
  - mark `slack_installation.revoked_at`
  - disable notification targets
  - show “Reconnect Slack” banner in web app
- Channel no longer exists / bot removed from channel:
  - fall back to DM if enabled
  - otherwise mark target disabled and notify user in-app
- Approval expired:
  - update message: “Expired; regenerate report”
- Execution failure:
  - post thread reply with:
    - what failed
    - manual steps
    - link to web app action detail page

### 12.2 Message update rules

- Prefer updating original message blocks via `response_url` on interaction, using `replace_original: true` when appropriate. :contentReference[oaicite:18]{index=18}
- For long logs, use a thread reply instead of editing the main report.

---

## 13) Content Inputs for the Morning Report (what the agent reads)

The report agent consumes:

- League daily snapshot (standings, rosters, transactions)
- RoS projections from published Depth Charts run
- Extracted events from the content ingest pipeline using:
  - :contentReference[oaicite:19]{index=19} (bullpen roles)
  - :contentReference[oaicite:20]{index=20} (starts/sits, relievers, streamers)
  - :contentReference[oaicite:21]{index=21} fantasy feed (RotoGraphs)
  - :contentReference[oaicite:22]{index=22} (waiver wire lists)
  - :contentReference[oaicite:23]{index=23} (injury news)

Agent output must include evidence URLs + short excerpts for each actionable item.

---

## 14) Implementation Checklist

### 14.1 Slack app setup

- Create Slack app
- Enable OAuth + set redirect URL
- Enable interactivity + set Request URL: `https://<api-host>/slack/interactive` :contentReference[oaicite:24]{index=24}
- Enable incoming webhooks (optional) :contentReference[oaicite:25]{index=25}
- Set slash command endpoint (optional)

### 14.2 Backend endpoints

- OAuth start/callback
- Interactivity handler (verify signature)
- Slash commands handler (optional)
- Internal job triggers (K8s CronJobs)
- Message sending utilities with rate-limit handling

### 14.3 DB migrations

- slack_installation
- slack_user_link
- slack_notification_target
- agent_report / agent_action / agent_action_decision
- slack_message_ref

### 14.4 Worker jobs

- GenerateMorningReport
- HandleSlackApproval
- ExecuteApprovedAction (safe mode first)

---

## 15) Open Questions (decide before coding)

1. Delivery: default to a channel, DM, or both?
2. Should the morning report be one message or:
   - one summary + one “actions” message?
3. “Safe mode” approvals: after approval, do you want:
   - a checklist + ESPN deep links (recommended v1)
   - or attempt automation immediately behind a feature flag?

---

## 16) Citations (Slack platform behavior references)

- Request verification via signing secret and signature headers. :contentReference[oaicite:26]{index=26}
- Interactive messages and interaction payloads + response_url usage. :contentReference[oaicite:27]{index=27}
- OAuth install flow. :contentReference[oaicite:28]{index=28}
- Incoming webhooks setup. :contentReference[oaicite:29]{index=29}
- Web API rate limits (429 + Retry-After). :contentReference[oaicite:30]{index=30}
