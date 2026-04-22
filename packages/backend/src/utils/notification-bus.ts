import type { BaseLogger } from "pino";

export interface StandingsChangeEventPayload {
  league_id: number;
  team_id: number;
  snapshot_date: string;
  category_id: string;
  category_name: string;
  prev_roto_pts: number;
  curr_roto_pts: number;
  roto_delta: number;
  passed_team_id: number | null;
  passed_team_name: string | null;
  direction: "gained" | "lost";
  proximate_cause: {
    playerName: string;
    stat: string;
    value: number;
    description: string;
  } | null;
}

export interface NotificationBus {
  emit(event: StandingsChangeEventPayload): Promise<void>;
}

export class NoOpNotificationBus implements NotificationBus {
  async emit(_event: StandingsChangeEventPayload): Promise<void> {
    // intentionally empty
  }
}

export class SlackWebhookNotificationBus implements NotificationBus {
  constructor(
    private readonly webhookUrl: string,
    private readonly logger: BaseLogger,
  ) {}

  async emit(event: StandingsChangeEventPayload): Promise<void> {
    const sign = event.direction === "gained" ? "📈" : "📉";
    const deltaStr = event.roto_delta > 0
      ? `+${event.roto_delta.toFixed(1)}`
      : event.roto_delta.toFixed(1);

    let text = `${sign} *${event.category_name}* ${deltaStr} pts`;
    if (event.passed_team_name) {
      text += event.direction === "gained"
        ? ` — passed *${event.passed_team_name}*`
        : ` — passed by *${event.passed_team_name}*`;
    }
    if (event.proximate_cause) {
      text += `\n> ${event.proximate_cause.description}`;
    }

    try {
      const res = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        this.logger.warn({ status: res.status }, "Slack webhook delivery failed");
      }
    } catch (err) {
      this.logger.warn({ err }, "Slack webhook emit error — continuing");
    }
  }
}

export function createNotificationBus(logger: BaseLogger): NotificationBus {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (webhookUrl) {
    logger.info("NotificationBus: Slack webhook adapter active");
    return new SlackWebhookNotificationBus(webhookUrl, logger);
  }
  return new NoOpNotificationBus();
}
