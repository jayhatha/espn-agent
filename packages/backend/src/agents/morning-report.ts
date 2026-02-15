import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { WaiverRecommendationAgent } from "./waiver-recommendation.js";
import { ESPNAdapter } from "../adapters/espn.js";
import { StandingsProjectionAgent } from "./standings-projection.js";

/**
 * Morning Report Agent
 * Generates daily morning reports with:
 * - Current standings and projected finish
 * - Injury alerts (placeholder for now)
 * - Waiver recommendations
 * - Actionable items with approve/reject buttons
 */

export interface MorningReportData {
  leagueSnapshot: {
    snapshotDate: string;
    overallRank: number;
    totalTeams: number;
    projectedRank: number;
    overallPoints: number;
    projectedPoints: number;
  };
  injuries: Array<{
    playerName: string;
    status: string;
    impact: string;
  }>;
  waiverHighlights: Array<{
    playerName: string;
    positions: string[];
    reason: string;
  }>;
  actions: Array<{
    actionId: string;
    type: string;
    description: string;
    expectedImpact: string;
  }>;
}

export class MorningReportAgent {
  private waiverAgent: WaiverRecommendationAgent;

  constructor(
    private db: Kysely<Database>,
    private logger?: Logger,
  ) {
    const espnAdapter = new ESPNAdapter(logger);
    const standingsAgent = new StandingsProjectionAgent(db, logger);
    this.waiverAgent = new WaiverRecommendationAgent(
      db,
      standingsAgent,
      espnAdapter,
      logger,
    );
  }

  /**
   * Generate a morning report for a user/league
   *
   * @param slackUserLinkId - UUID of slack_user_link record
   * @param leagueId - League ID
   * @param reportDate - Report date (ISO format YYYY-MM-DD)
   * @returns Report ID and data for Slack message formatting
   */
  async generateReport(
    slackUserLinkId: string,
    leagueId: number,
    reportDate: string,
  ): Promise<{ reportId: string; data: MorningReportData }> {
    this.logger?.info(
      { slackUserLinkId, leagueId, reportDate },
      "Generating morning report",
    );

    // Get user link to find fantasy team ID
    const userLink = await this.db
      .selectFrom("slack_user_link")
      .selectAll()
      .where("id", "=", slackUserLinkId)
      .executeTakeFirstOrThrow();

    this.logger?.debug(
      { fantasyTeamId: userLink.team_id_fantasy },
      "Found fantasy team for user",
    );

    // Get latest snapshot for this league
    const snapshot = await this.db
      .selectFrom("league_daily_snapshot")
      .selectAll()
      .where("league_id", "=", leagueId)
      .orderBy("snapshot_date", "desc")
      .executeTakeFirst();

    if (!snapshot) {
      throw new Error(`No snapshot found for league ${leagueId}`);
    }

    this.logger?.debug({ snapshotDate: snapshot.snapshot_date }, "Using snapshot");

    // Get current standings
    const overall = await this.db
      .selectFrom("team_daily_overall")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshot.snapshot_date)
      .where("team_id", "=", userLink.team_id_fantasy)
      .executeTakeFirst();

    // Count total teams
    const totalTeamsResult = await this.db
      .selectFrom("team_daily_overall")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshot.snapshot_date)
      .executeTakeFirst();

    const totalTeams = Number(totalTeamsResult?.count || 0);

    // Get projected standings
    const projected = await this.db
      .selectFrom("team_daily_projected_overall")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshot.snapshot_date)
      .where("team_id", "=", userLink.team_id_fantasy)
      .executeTakeFirst();

    this.logger?.debug(
      {
        currentRank: overall?.overall_rank,
        projectedRank: projected?.projected_overall_rank,
      },
      "Fetched standings",
    );

    // Get waiver recommendations (top 5)
    let waiverRecs;
    try {
      waiverRecs = await this.waiverAgent.getRecommendations(
        leagueId,
        userLink.team_id_fantasy,
        snapshot.snapshot_date,
        { maxRecommendations: 5 },
      );
      this.logger?.info(
        { recommendationCount: waiverRecs.length },
        "Generated waiver recommendations",
      );
    } catch (error) {
      this.logger?.warn(
        { error },
        "Failed to generate waiver recommendations - using empty list",
      );
      waiverRecs = [];
    }

    // TODO: Fetch injuries from injury_event table when content ingestion is implemented
    // For now, return empty array
    const injuries: Array<{ playerName: string; status: string; impact: string }> = [];

    // Assemble report data
    const reportData: MorningReportData = {
      leagueSnapshot: {
        snapshotDate: snapshot.snapshot_date,
        overallRank: overall?.overall_rank || 0,
        totalTeams,
        projectedRank: projected?.projected_overall_rank || 0,
        overallPoints: overall?.overall_points || 0,
        projectedPoints: projected?.projected_overall_points || 0,
      },
      injuries,
      waiverHighlights: waiverRecs.slice(0, 3).map((rec) => ({
        playerName: rec.addPlayerName,
        positions: [], // TODO: Add positions from player table
        reason: rec.explanation,
      })),
      actions: [], // Will be populated after creating action records
    };

    const summaryMarkdown = this.buildSummaryMarkdown(reportData);

    // Write report to database
    const reportId = crypto.randomUUID();
    await this.db
      .insertInto("agent_report")
      .values({
        id: reportId,
        slack_user_link_id: slackUserLinkId,
        league_id: leagueId,
        report_date: reportDate,
        kind: "morning",
        summary_markdown: summaryMarkdown,
        data_json: reportData as any,
        created_at: new Date(),
      })
      .execute();

    this.logger?.info({ reportId }, "Created agent_report record");

    // Create action records for waiver recommendations
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Actions expire in 24 hours

    for (const rec of waiverRecs) {
      const actionId = crypto.randomUUID();

      await this.db
        .insertInto("agent_action")
        .values({
          id: actionId,
          report_id: reportId,
          action_type: "ADD_DROP",
          payload_json: {
            addPlayerId: rec.addPlayerId,
            addPlayerName: rec.addPlayerName,
            dropPlayerId: rec.dropPlayerId,
            dropPlayerName: rec.dropPlayerName,
          } as any,
          expected_impact_json: {
            deltaPoints: rec.deltaOverallPoints,
            categoryImpacts: rec.categoryImpacts,
          } as any,
          risk_flags_json: null,
          evidence_json: null,
          status: "proposed",
          expires_at: expiresAt,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();

      reportData.actions.push({
        actionId,
        type: "ADD_DROP",
        description: `Add ${rec.addPlayerName}, Drop ${rec.dropPlayerName}`,
        expectedImpact: `${rec.deltaOverallPoints > 0 ? "+" : ""}${rec.deltaOverallPoints.toFixed(1)} pts`,
      });

      this.logger?.debug({ actionId, reportId }, "Created agent_action record");
    }

    this.logger?.info(
      { reportId, actionCount: reportData.actions.length },
      "Morning report generation complete",
    );

    return { reportId, data: reportData };
  }

  /**
   * Build markdown summary for the report
   */
  private buildSummaryMarkdown(data: MorningReportData): string {
    const { leagueSnapshot, injuries, waiverHighlights, actions } = data;

    let markdown = `# Morning Report - ${leagueSnapshot.snapshotDate}\n\n`;

    markdown += `**Current Standing:** ${leagueSnapshot.overallRank} / ${leagueSnapshot.totalTeams} (${leagueSnapshot.overallPoints.toFixed(1)} pts)\n`;
    markdown += `**Projected Finish:** ${leagueSnapshot.projectedRank} / ${leagueSnapshot.totalTeams} (${leagueSnapshot.projectedPoints.toFixed(1)} pts)\n\n`;

    if (injuries.length > 0) {
      markdown += `## Injury Alerts\n`;
      markdown += injuries
        .map((i) => `- **${i.playerName}** (${i.status}): ${i.impact}`)
        .join("\n");
      markdown += "\n\n";
    }

    if (waiverHighlights.length > 0) {
      markdown += `## Waiver Highlights\n`;
      markdown += waiverHighlights
        .map((w) => `- **${w.playerName}**: ${w.reason}`)
        .join("\n");
      markdown += "\n\n";
    }

    if (actions.length > 0) {
      markdown += `## Recommended Actions\n`;
      markdown += actions
        .map((a) => `- ${a.description} (${a.expectedImpact})`)
        .join("\n");
    }

    return markdown.trim();
  }
}
