import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";
import { getDb } from "../db/connection.js";
import { isSlackEnabled } from "../utils/feature-flags.js";
import axios from "axios";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

// Check if Slack is enabled before starting worker
if (!isSlackEnabled()) {
  logger.warn(
    "Slack integration disabled - approval worker will not start. Set FEATURE_SLACK_ENABLED=true to enable.",
  );
  process.exit(0);
}

const connection = new IORedis(
  process.env.REDIS_URL || "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);

export const slackApprovalQueue = new Queue("slack-approvals", { connection });

interface SlackApprovalJobData {
  actionId: string;
  reportId: string;
  decision: "approve_action" | "reject_action";
  slackTeamId: string;
  slackUserId: string;
  responseUrl: string;
  messageTs: string;
  channelId: string;
}

const worker = new Worker<SlackApprovalJobData>(
  "slack-approvals",
  async (job: Job<SlackApprovalJobData>) => {
    const {
      actionId,
      reportId,
      decision,
      slackTeamId,
      slackUserId,
      responseUrl,
      messageTs,
      channelId,
    } = job.data;

    logger.info(
      { jobId: job.id, actionId, decision, slackUserId },
      "Processing approval job",
    );

    const db = getDb();

    try {
      // Find user link
      const userLink = await db
        .selectFrom("slack_user_link")
        .selectAll()
        .where("team_id", "=", slackTeamId)
        .where("slack_user_id", "=", slackUserId)
        .executeTakeFirst();

      if (!userLink) {
        logger.warn(
          { slackUserId, slackTeamId },
          "User link not found - user may not have connected league",
        );

        await updateSlackMessage(responseUrl, {
          text: "⚠️ Please connect your fantasy league first to use this feature.",
        });

        return { success: false, reason: "user_not_linked" };
      }

      // Load action
      const action = await db
        .selectFrom("agent_action")
        .selectAll()
        .where("id", "=", actionId)
        .executeTakeFirst();

      if (!action) {
        logger.warn({ actionId }, "Action not found");

        await updateSlackMessage(responseUrl, {
          text: "❌ Action not found. It may have been deleted.",
        });

        return { success: false, reason: "action_not_found" };
      }

      // Validate action status
      if (action.status !== "proposed") {
        logger.warn(
          { actionId, status: action.status },
          "Action already processed",
        );

        await updateSlackMessage(responseUrl, {
          text: `ℹ️ This action was already ${action.status}.`,
        });

        return { success: false, reason: "already_processed" };
      }

      // Check expiration
      if (new Date() > new Date(action.expires_at)) {
        logger.warn({ actionId, expiresAt: action.expires_at }, "Action expired");

        await db
          .updateTable("agent_action")
          .set({ status: "expired", updated_at: new Date() })
          .where("id", "=", actionId)
          .execute();

        await updateSlackMessage(responseUrl, {
          text: "⏰ This action has expired. Request a new report to see current recommendations.",
        });

        return { success: false, reason: "expired" };
      }

      // Record decision
      const decisionType = decision === "approve_action" ? "approve" : "reject";
      const newStatus = decision === "approve_action" ? "approved" : "rejected";

      await db
        .insertInto("agent_action_decision")
        .values({
          action_id: actionId,
          decided_by_slack_user_link_id: userLink.id,
          decision: decisionType,
          override_payload_json: null,
          decided_at: new Date(),
        })
        .execute();

      await db
        .updateTable("agent_action")
        .set({ status: newStatus, updated_at: new Date() })
        .where("id", "=", actionId)
        .execute();

      logger.info(
        { actionId, decision: newStatus, userId: userLink.id },
        "Decision recorded",
      );

      // Get action payload for messaging
      const payload = action.payload_json as any;

      // Update Slack message to reflect decision
      const updatedBlocks = buildUpdatedMessageBlocks(
        payload,
        newStatus,
        slackUserId,
      );

      await updateSlackMessage(responseUrl, {
        text: `Action ${newStatus}: ${payload.addPlayerName || "Waiver move"}`,
        blocks: updatedBlocks,
      });

      // If approved, post checklist message (safe mode)
      if (newStatus === "approved") {
        const checklistText = buildChecklistMessage(payload);

        await axios.post(responseUrl, {
          response_type: "in_channel",
          replace_original: false,
          text: checklistText,
        });

        logger.info({ actionId }, "Posted approval checklist");
      }

      logger.info({ jobId: job.id, actionId, decision: newStatus }, "Approval processed");
      return { success: true, actionId, decision: newStatus };
    } catch (error) {
      logger.error({ error, jobId: job.id }, "Approval processing failed");
      throw error;
    }
  },
  {
    connection,
    concurrency: 10, // Process approvals quickly
  },
);

/**
 * Update a Slack message via response_url
 */
async function updateSlackMessage(
  responseUrl: string,
  payload: { text?: string; blocks?: any[] },
): Promise<void> {
  await axios.post(responseUrl, {
    replace_original: true,
    ...payload,
  });
}

/**
 * Build updated message blocks after approval/rejection
 */
function buildUpdatedMessageBlocks(
  payload: any,
  status: string,
  userId: string,
): any[] {
  const statusEmoji = status === "approved" ? "✅" : "❌";
  const statusText = status.toUpperCase();

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${statusEmoji} *${statusText}*\n*${payload.addPlayerName || "Unknown Player"}* ↔️ *${payload.dropPlayerName || "Unknown Player"}*`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Decided by <@${userId}> at <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} {time}|${new Date().toISOString()}>`,
        },
      ],
    },
  ];
}

/**
 * Build checklist message for approved actions (safe mode)
 */
function buildChecklistMessage(payload: any): string {
  return `
🎯 *Action Approved - Next Steps*

To complete this waiver move, visit your ESPN Fantasy Baseball league and:

1. Navigate to the Players page
2. Search for *${payload.addPlayerName || `Player ID ${payload.addPlayerId}`}*
3. Click "Add" and select *${payload.dropPlayerName || `Player ID ${payload.dropPlayerId}`}* to drop
4. Confirm the transaction

🔗 [Open ESPN Fantasy Baseball](https://fantasy.espn.com/baseball/)

_Safe mode is enabled - transactions must be completed manually in ESPN._
  `.trim();
}

// Event listeners
worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Approval job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, error: err }, "Approval job failed");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, closing approval worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

logger.info("Slack approval worker started");
