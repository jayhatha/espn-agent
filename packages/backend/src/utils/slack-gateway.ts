import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { decryptToken } from "./encryption.js";
import axios, { type AxiosError } from "axios";

/**
 * Slack Gateway - centralized Slack API client
 * Handles message sending, updates, rate limiting, and error handling
 */

export interface SlackMessageOptions {
  channel: string;
  text?: string;
  blocks?: any[];
  thread_ts?: string;
}

export interface SlackMessageResult {
  ok: boolean;
  channel?: string;
  ts?: string;
  error?: string;
}

export class SlackGateway {
  constructor(
    private db: Kysely<Database>,
    private logger?: BaseLogger,
  ) {}

  /**
   * Get decrypted bot token for a Slack workspace
   */
  async getBotToken(teamId: string): Promise<string> {
    const installation = await this.db
      .selectFrom("slack_installation")
      .select("bot_token_encrypted")
      .where("team_id", "=", teamId)
      .where("revoked_at", "is", null)
      .executeTakeFirst();

    if (!installation) {
      throw new Error(`No active Slack installation for team ${teamId}`);
    }

    return decryptToken(installation.bot_token_encrypted);
  }

  /**
   * Post a message to a Slack channel
   * Handles rate limiting and error tracking
   */
  async postMessage(
    teamId: string,
    options: SlackMessageOptions,
  ): Promise<SlackMessageResult> {
    const token = await this.getBotToken(teamId);

    try {
      const response = await axios.post(
        "https://slack.com/api/chat.postMessage",
        {
          channel: options.channel,
          text: options.text,
          blocks: options.blocks,
          thread_ts: options.thread_ts,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (response.data.ok) {
        await this.markInstallationHealthy(teamId);
        this.logger?.info(
          { teamId, channel: options.channel, ts: response.data.ts },
          "Slack message posted",
        );
      } else {
        this.logger?.warn(
          { teamId, error: response.data.error },
          "Slack API returned error",
        );
      }

      return response.data as SlackMessageResult;
    } catch (error) {
      await this.handleSlackError(teamId, error as AxiosError);
      throw error;
    }
  }

  /**
   * Update an existing Slack message
   */
  async updateMessage(
    teamId: string,
    channel: string,
    ts: string,
    options: { text?: string; blocks?: any[] },
  ): Promise<SlackMessageResult> {
    const token = await this.getBotToken(teamId);

    try {
      const response = await axios.post(
        "https://slack.com/api/chat.update",
        {
          channel,
          ts,
          text: options.text,
          blocks: options.blocks,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (response.data.ok) {
        this.logger?.info(
          { teamId, channel, ts },
          "Slack message updated",
        );
      }

      return response.data as SlackMessageResult;
    } catch (error) {
      await this.handleSlackError(teamId, error as AxiosError);
      throw error;
    }
  }

  /**
   * Open a DM channel with a user
   * Returns the channel ID
   */
  async openDmChannel(teamId: string, userId: string): Promise<string> {
    const token = await this.getBotToken(teamId);

    try {
      const response = await axios.post(
        "https://slack.com/api/conversations.open",
        { users: userId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.data.ok) {
        throw new Error(`Failed to open DM: ${response.data.error}`);
      }

      this.logger?.info({ teamId, userId, channelId: response.data.channel.id }, "DM channel opened");

      return response.data.channel.id as string;
    } catch (error) {
      await this.handleSlackError(teamId, error as AxiosError);
      throw error;
    }
  }

  /**
   * Mark installation as healthy after successful API call
   */
  private async markInstallationHealthy(teamId: string): Promise<void> {
    await this.db
      .updateTable("slack_installation")
      .set({ last_ok_at: new Date(), last_error: null })
      .where("team_id", "=", teamId)
      .execute();
  }

  /**
   * Handle Slack API errors
   * - Track errors in database
   * - Mark token as revoked if necessary
   * - Log rate limiting info
   */
  private async handleSlackError(
    teamId: string,
    error: AxiosError,
  ): Promise<void> {
    const errorData = error.response?.data as any;

    this.logger?.error(
      { teamId, error: errorData, status: error.response?.status },
      "Slack API error",
    );

    // Handle token revocation
    if (
      errorData?.error === "token_revoked" ||
      errorData?.error === "account_inactive" ||
      errorData?.error === "invalid_auth"
    ) {
      this.logger?.warn({ teamId }, "Slack token revoked, marking installation as inactive");

      await this.db
        .updateTable("slack_installation")
        .set({
          revoked_at: new Date(),
          last_error: {
            error: errorData?.error || "unknown",
            timestamp: new Date().toISOString(),
          },
        })
        .where("team_id", "=", teamId)
        .execute();
    } else {
      // Track other errors
      await this.db
        .updateTable("slack_installation")
        .set({
          last_error: {
            error: errorData?.error || error.message || "unknown",
            timestamp: new Date().toISOString(),
          },
        })
        .where("team_id", "=", teamId)
        .execute();
    }

    // Handle rate limiting (429)
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers["retry-after"];
      this.logger?.warn(
        { retryAfter, teamId },
        "Slack rate limit hit - implement exponential backoff in caller",
      );
    }
  }
}
