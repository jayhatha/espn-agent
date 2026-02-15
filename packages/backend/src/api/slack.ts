import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/connection.js";
import { slackVerifyPreHandler } from "../utils/slack-verify.js";
import { encryptToken } from "../utils/encryption.js";
import axios from "axios";
import crypto from "crypto";

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export async function slackRoutes(app: FastifyInstance) {
  const db = getDb();

  /**
   * GET /slack/oauth/start
   * Initiate Slack OAuth flow
   * Returns authorization URL for user to visit
   */
  app.get("/slack/oauth/start", async (request, reply) => {
    if (!SLACK_CLIENT_ID || !SLACK_REDIRECT_URI) {
      return reply.code(500).send({
        error: "Slack OAuth not configured",
        details: "SLACK_CLIENT_ID and SLACK_REDIRECT_URI required",
      });
    }

    // Generate CSRF state token
    const state = crypto.randomBytes(32).toString("hex");

    // TODO: Store state in Redis with expiration (5 minutes)
    // For now, we'll just return it and validate on callback

    const scopes = ["chat:write", "im:write", "commands"].join(",");
    const authUrl =
      `https://slack.com/oauth/v2/authorize?` +
      `client_id=${SLACK_CLIENT_ID}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `redirect_uri=${encodeURIComponent(SLACK_REDIRECT_URI)}&` +
      `state=${state}`;

    request.log.info({ state }, "Starting Slack OAuth flow");

    return { authUrl, state };
  });

  /**
   * GET /slack/oauth/callback
   * Handle Slack OAuth callback
   * Exchanges code for access token and stores installation
   */
  app.get(
    "/slack/oauth/callback",
    async (
      request: FastifyRequest<{
        Querystring: { code?: string; state?: string; error?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { code, state, error } = request.query;

      if (error) {
        request.log.warn({ error }, "OAuth callback error from Slack");
        return reply.redirect(
          `${FRONTEND_URL}/integrations/slack/error?reason=${error}`,
        );
      }

      if (!code || !state) {
        request.log.warn("Missing code or state in OAuth callback");
        return reply.redirect(
          `${FRONTEND_URL}/integrations/slack/error?reason=missing_params`,
        );
      }

      // TODO: Validate state token against Redis storage

      if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET || !SLACK_REDIRECT_URI) {
        request.log.error("Slack OAuth credentials not configured");
        return reply.redirect(
          `${FRONTEND_URL}/integrations/slack/error?reason=server_config`,
        );
      }

      try {
        // Exchange code for access token
        const response = await axios.post(
          "https://slack.com/api/oauth.v2.access",
          new URLSearchParams({
            client_id: SLACK_CLIENT_ID,
            client_secret: SLACK_CLIENT_SECRET,
            code,
            redirect_uri: SLACK_REDIRECT_URI,
          }),
          {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          },
        );

        if (!response.data.ok) {
          request.log.error(
            { error: response.data.error },
            "Slack OAuth token exchange failed",
          );
          return reply.redirect(
            `${FRONTEND_URL}/integrations/slack/error?reason=${response.data.error}`,
          );
        }

        const {
          team,
          authed_user,
          access_token,
          bot_user_id,
          incoming_webhook,
          scope,
        } = response.data;

        request.log.info(
          { teamId: team.id, teamName: team.name, userId: authed_user.id },
          "Slack OAuth successful",
        );

        // Encrypt tokens
        const botTokenEncrypted = encryptToken(access_token);
        const webhookUrlEncrypted = incoming_webhook?.url
          ? encryptToken(incoming_webhook.url)
          : null;

        // Upsert installation
        await db
          .insertInto("slack_installation")
          .values({
            team_id: team.id,
            enterprise_id: null,
            bot_token_encrypted: botTokenEncrypted,
            bot_user_id,
            installer_slack_user_id: authed_user.id,
            incoming_webhook_url_encrypted: webhookUrlEncrypted,
            incoming_webhook_channel_id: incoming_webhook?.channel_id || null,
            incoming_webhook_channel_name: incoming_webhook?.channel || null,
            scopes: scope,
            installed_at: new Date(),
            revoked_at: null,
            last_ok_at: new Date(),
            last_error: null,
          })
          .onConflict((oc) =>
            oc.column("team_id").doUpdateSet({
              bot_token_encrypted: botTokenEncrypted,
              bot_user_id,
              installer_slack_user_id: authed_user.id,
              incoming_webhook_url_encrypted: webhookUrlEncrypted,
              incoming_webhook_channel_id:
                incoming_webhook?.channel_id || null,
              incoming_webhook_channel_name: incoming_webhook?.channel || null,
              scopes: scope,
              revoked_at: null,
              last_ok_at: new Date(),
              last_error: null,
            }),
          )
          .execute();

        request.log.info(
          { teamId: team.id },
          "Slack installation stored in database",
        );

        // Redirect to frontend success page
        return reply.redirect(
          `${FRONTEND_URL}/integrations/slack/success?team=${encodeURIComponent(team.name)}`,
        );
      } catch (error) {
        request.log.error({ error }, "OAuth callback processing failed");
        return reply.redirect(
          `${FRONTEND_URL}/integrations/slack/error?reason=server_error`,
        );
      }
    },
  );

  /**
   * POST /slack/interactive
   * Handle Slack interactive component interactions (buttons, modals, etc.)
   * Verifies request signature and enqueues work
   */
  app.post(
    "/slack/interactive",
    {
      preHandler: slackVerifyPreHandler,
    },
    async (request, reply) => {
      // Slack sends form-encoded payload
      const payload = JSON.parse((request.body as any).payload);

      const { type, team, user } = payload;

      request.log.info(
        { type, teamId: team?.id, userId: user?.id },
        "Slack interaction received",
      );

      // Acknowledge immediately (must respond within 3 seconds)
      reply.code(200).send();

      // Handle different interaction types
      if (type === "block_actions") {
        // Button clicks
        const { actions, response_url, message, channel } = payload;
        const action = actions[0];

        try {
          const actionValue = JSON.parse(action.value);

          request.log.info(
            {
              actionId: action.action_id,
              blockId: action.block_id,
              actionValue,
            },
            "Block action received",
          );

          // Enqueue approval worker job
          const { slackApprovalQueue } = await import(
            "../workers/slack-approval-worker.js"
          );

          await slackApprovalQueue.add("handle-approval", {
            actionId: actionValue.action_id,
            reportId: actionValue.report_id,
            decision: action.action_id, // "approve_action" or "reject_action"
            slackTeamId: team.id,
            slackUserId: user.id,
            responseUrl: response_url,
            messageTs: message.ts,
            channelId: channel.id,
          });

          request.log.info(
            { actionId: actionValue.action_id },
            "Approval job enqueued",
          );
        } catch (error) {
          request.log.error({ error, action }, "Failed to process block action");
        }
      } else if (type === "view_submission") {
        // Modal submissions
        request.log.info(
          "View submission received - handler not yet implemented",
        );
      }
    },
  );

  /**
   * POST /slack/commands
   * Handle Slack slash commands
   * Optional endpoint for /fantasy command
   */
  app.post(
    "/slack/commands",
    {
      preHandler: slackVerifyPreHandler,
    },
    async (request, reply) => {
      const { command, text, user_id, team_id } = request.body as any;

      request.log.info(
        { command, text, userId: user_id, teamId: team_id },
        "Slack command received",
      );

      if (command === "/fantasy") {
        if (text === "connect") {
          return reply.send({
            text: `Connect your fantasy league at: ${FRONTEND_URL}/integrations/slack`,
          });
        } else if (text === "report") {
          // Trigger on-demand report (rate-limited)
          return reply.send({
            text: "Generating your morning report... (not yet implemented)",
          });
        } else {
          return reply.send({
            text: "Available commands:\n• `/fantasy connect` - Link your league\n• `/fantasy report` - Generate report now",
          });
        }
      }

      return reply.send({ text: "Unknown command" });
    },
  );
}
