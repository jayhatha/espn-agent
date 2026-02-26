import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";
import { getDb } from "../db/connection.js";
import { MorningReportAgent } from "../agents/morning-report.js";
import { SlackGateway } from "../utils/slack-gateway.js";
import { isSlackEnabled } from "../utils/feature-flags.js";
import type { MorningReportData } from "../agents/morning-report.js";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const connection = new IORedis(
  process.env.REDIS_URL || "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);

export const morningReportQueue = new Queue("morning-reports", {
  connection: connection as any,
});

// Check if Slack is enabled before starting worker
if (!isSlackEnabled()) {
  logger.warn(
    "Slack disabled - morning report worker inactive. Set FEATURE_SLACK_ENABLED=true to enable.",
  );
} else {
  // Only start worker if Slack is enabled
  startWorker();
}

interface MorningReportJobData {
  slackUserLinkId: string;
  leagueId: number;
  reportDate: string;
}

function startWorker() {
  const worker = new Worker<MorningReportJobData>(
    "morning-reports",
    async (job: Job<MorningReportJobData>) => {
      const { slackUserLinkId, leagueId, reportDate } = job.data;

      logger.info(
        { jobId: job.id, slackUserLinkId, leagueId, reportDate },
        "Processing morning report job",
      );

      const db = getDb();
      const reportAgent = new MorningReportAgent(db, logger);
      const slackGateway = new SlackGateway(db, logger);

      try {
        // Generate report
        const { reportId, data } = await reportAgent.generateReport(
          slackUserLinkId,
          leagueId,
          reportDate,
        );

        logger.info({ reportId, jobId: job.id }, "Report generated");

        // Get notification target
        const target = await db
          .selectFrom("slack_notification_target")
          .selectAll()
          .where("slack_user_link_id", "=", slackUserLinkId)
          .where("league_id", "=", leagueId)
          .where("is_enabled", "=", true)
          .executeTakeFirst();

        if (!target) {
          logger.warn(
            { slackUserLinkId, leagueId },
            "No enabled notification target found",
          );
          return { success: false, reason: "no_target" };
        }

        // Determine channel (channel_id or DM)
        let channelId = target.channel_id;
        if (target.target_type === "dm") {
          const userLink = await db
            .selectFrom("slack_user_link")
            .selectAll()
            .where("id", "=", slackUserLinkId)
            .executeTakeFirstOrThrow();

          channelId = await slackGateway.openDmChannel(
            target.team_id,
            userLink.slack_user_id,
          );
          logger.info(
            { channelId, userId: userLink.slack_user_id },
            "Opened DM channel",
          );
        }

        if (!channelId) {
          logger.error({ target }, "No channel ID available");
          return { success: false, reason: "no_channel" };
        }

        // Build Slack Block Kit message
        const blocks = buildMorningReportBlocks(data, reportId);

        // Send message
        const result = await slackGateway.postMessage(target.team_id, {
          channel: channelId,
          text: `Morning Report - ${reportDate}`,
          blocks,
          thread_ts: target.thread_ts || undefined,
        });

        if (!result.ok) {
          logger.error({ result, jobId: job.id }, "Failed to post Slack message");
          return {
            success: false,
            reason: "slack_api_error",
            error: result.error,
          };
        }

        // Store message reference
        if (result.ts) {
          await db
            .insertInto("slack_message_ref")
            .values({
              team_id: target.team_id,
              channel_id: result.channel!,
              message_ts: result.ts,
              report_id: reportId,
              action_id: null,
              created_at: new Date(),
            })
            .execute();

          logger.info(
            { reportId, messageTs: result.ts },
            "Stored message reference",
          );
        }

        logger.info({ jobId: job.id, reportId }, "Morning report sent successfully");
        return { success: true, reportId, messageTs: result.ts };
      } catch (error) {
        logger.error({ error, jobId: job.id }, "Morning report job failed");
        throw error;
      }
    },
    {
      connection: connection as any,
      concurrency: 5, // Process up to 5 reports concurrently
    },
  );

  // Event listeners
  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Morning report job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, error: err }, "Morning report job failed");
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, closing morning report worker...");
    await worker.close();
    await connection.quit();
    process.exit(0);
  });

  logger.info("Morning report worker started");
}

/**
 * Build Slack Block Kit message blocks for morning report
 */
function buildMorningReportBlocks(
  data: MorningReportData,
  reportId: string,
): any[] {
  const blocks: any[] = [];

  // Header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `🌅 Morning Report - ${data.leagueSnapshot.snapshotDate}`,
    },
  });

  // Current standings
  const rankChange =
    data.leagueSnapshot.overallRank - data.leagueSnapshot.projectedRank;
  const rankEmoji = rankChange > 0 ? "📈" : rankChange < 0 ? "📉" : "➡️";

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        `*Current Standing:* ${data.leagueSnapshot.overallRank} / ${data.leagueSnapshot.totalTeams} ` +
        `(${data.leagueSnapshot.overallPoints.toFixed(1)} pts)\n` +
        `*Projected Finish:* ${rankEmoji} ${data.leagueSnapshot.projectedRank} / ${data.leagueSnapshot.totalTeams} ` +
        `(${data.leagueSnapshot.projectedPoints.toFixed(1)} pts)`,
    },
  });

  blocks.push({ type: "divider" });

  // Injury alerts (if any)
  if (data.injuries.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*🏥 Injury Alerts*\n` +
          data.injuries
            .map((i) => `• *${i.playerName}* (${i.status}): ${i.impact}`)
            .join("\n"),
      },
    });
    blocks.push({ type: "divider" });
  }

  // Waiver highlights
  if (data.waiverHighlights.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*📊 Waiver Highlights*\n` +
          data.waiverHighlights
            .map((w) => `• *${w.playerName}*: ${w.reason}`)
            .join("\n"),
      },
    });
    blocks.push({ type: "divider" });
  }

  // Action items with buttons
  if (data.actions.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*⚡ Recommended Actions*",
      },
    });

    for (const action of data.actions) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${action.description}*\n_Impact: ${action.expectedImpact}_`,
        },
        accessory: {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "✅ Approve" },
              style: "primary",
              action_id: "approve_action",
              value: JSON.stringify({
                action_id: action.actionId,
                report_id: reportId,
              }),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "❌ Reject" },
              action_id: "reject_action",
              value: JSON.stringify({
                action_id: action.actionId,
                report_id: reportId,
              }),
            },
          ],
        },
      });
    }
  }

  // Footer
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Generated by ESPN Fantasy Assistant • Report ID: ${reportId.substring(0, 8)}`,
      },
    ],
  });

  return blocks;
}
