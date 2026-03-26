import OpenAI from "openai";
import type { BaseLogger } from "pino";

/**
 * Structured payload sent by the extension when a narration trigger fires.
 * Contains only summary-level signals — no raw player arrays or projection tables.
 */
export interface NarratorPayload {
  /** Draft phase based on picks remaining: early (0-5 picks), mid (6-15), late (16+) */
  draftPhase: "early" | "mid" | "late";

  /** Active engine alerts, sorted by severity descending */
  alerts: Array<{
    type: string;
    severity: number;
    title: string;
    detail: string;
    position?: string;
    category?: string;
  }>;

  /** Inflation summary from the deterministic engine */
  inflation: {
    percentOverMarket: number;
    confidence: "high" | "low";
  };

  /** Budget pacing summary */
  budgetSummary: {
    remainingBudget: number;
    pacingStatus: "ahead" | "on-track" | "behind";
    budgetPressure: number;
    maxBidRecommendation: number;
  };

  /** Position scarcity summary — only include positions with meaningful scarcity */
  topScarcity: Array<{
    position: string;
    scarcityIndex: number;
    myTeamNeeds: boolean;
    supply: number;
    demand: number;
  }>;

  /** Category gap analysis — positions where the user's team is weak */
  categoryGaps: Array<{
    category: string;
    gapZScore: number;
    categoryRiskScore: number;
  }>;

  /** The player currently being auctioned, null when no auction is live */
  currentAuctionPlayer: {
    playerName: string;
    currentBid?: number;
    positions?: string[];
    espnValue?: number;
    maxBidRecommendation?: number;
  } | null;

  /** Roster optimization signals from Phase 23 engine — null when no nomination or insufficient data */
  optimization: {
    shouldBid: boolean;
    maxBid: number;
    valueSurplus: number;
    simulationEV: number;
    simulationConfidence: "high" | "medium" | "low";
    topTargets: Array<{
      playerName: string;
      position: string;
      sgpValue: number;
      maxBid: number;
      expectedMarketPrice: number;
    }>; // limited to top 3
    opponentPressure: Array<{
      position: string;
      competitionFactor: number;
    }>; // limited to top 3 by competition factor
  } | null;

  /** What triggered this narration request */
  triggerReason:
    | "alert"
    | "budget_pressure"
    | "nomination"
    | "user_request";
}

const MODEL_ID = "gpt-4.1-mini-2025-04-14";

const SYSTEM_PROMPT = `You are a tactical fantasy baseball auction draft advisor embedded in a real-time draft sidebar.
You receive structured draft signals and produce a single, concise tactical comment.

Rules:
- Maximum 120 words total
- Tone: direct, calm, no fluff. Like a sharp coach talking to a prepared player.
- Never re-derive math or invent values — only interpret the signals given to you
- Focus on the most actionable single insight for the current moment
- If a player is currently nominated, lead with bid guidance if relevant
- Use plain language, no jargon for jargon's sake
- If nothing significant is happening, say so briefly
- You are watching a live fantasy baseball auction draft — context matters
- When OPTIMIZATION data is present:
  - Lead with the BID/PASS recommendation if a player is nominated
  - Reference the simulation confidence level (high = strong signal, low = uncertain)
  - Mention top targets only when the user should PASS the current nomination
  - Reference position pressure when it explains why a player costs more than expected`;

/**
 * DraftNarratorAgent calls OpenAI gpt-4.1-mini to generate tactical commentary
 * from structured draft engine signals.
 *
 * Per-request instantiation is required — the constructor throws when OPENAI_API_KEY
 * is missing, which the route catches and converts to a 503 response.
 */
export class DraftNarratorAgent {
  private client: OpenAI;
  private logger?: BaseLogger;

  constructor(logger?: BaseLogger) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable not set — narration service unavailable",
      );
    }
    this.client = new OpenAI({ apiKey });
    this.logger = logger;
  }

  /**
   * Generate a tactical narration string from structured draft signals.
   * Returns a trimmed string under 200 tokens (~120 words).
   */
  async narrate(payload: NarratorPayload): Promise<string> {
    this.logger?.debug(
      { triggerReason: payload.triggerReason },
      "[DraftNarrator] generating narration",
    );

    const userMessage = this.buildUserMessage(payload);

    const completion = await this.client.chat.completions.create({
      model: MODEL_ID,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      max_tokens: 200, // ~120 words at ~1.5 tokens/word with headroom
      temperature: 0.4, // Low: tactical, consistent, not creative
    });

    const text = completion.choices[0]?.message?.content ?? "";
    return text.trim();
  }

  /**
   * Serialize structured payload fields into a labeled text block for the LLM.
   * Only includes sections with meaningful data — skips empty arrays, null values, etc.
   * Alerts limited to top 3 by severity. Scarcity filtered to scarcityIndex > 0.65.
   * Category gaps filtered to categoryRiskScore > 0.65.
   */
  private buildUserMessage(payload: NarratorPayload): string {
    const parts: string[] = [];

    parts.push(`DRAFT PHASE: ${payload.draftPhase}`);
    parts.push(`TRIGGER: ${payload.triggerReason}`);

    if (payload.currentAuctionPlayer) {
      const p = payload.currentAuctionPlayer;
      const positions =
        p.positions && p.positions.length > 0
          ? ` (${p.positions.join("/")})`
          : "";
      const bidInfo = p.currentBid !== undefined ? ` | Current bid: $${p.currentBid}` : "";
      const espnInfo =
        p.espnValue !== undefined ? ` | ESPN value: $${p.espnValue}` : "";
      const maxBidInfo =
        p.maxBidRecommendation !== undefined
          ? ` | Your max: $${p.maxBidRecommendation}`
          : "";
      parts.push(`NOMINATED: ${p.playerName}${positions}${bidInfo}${espnInfo}${maxBidInfo}`);
    }

    if (payload.alerts.length > 0) {
      parts.push("ACTIVE ALERTS:");
      for (const a of payload.alerts.slice(0, 3)) {
        const posInfo = a.position ? ` pos=${a.position}` : "";
        const catInfo = a.category ? ` cat=${a.category}` : "";
        parts.push(
          `  - [${a.type.toUpperCase()} sev=${a.severity.toFixed(2)}${posInfo}${catInfo}] ${a.title}: ${a.detail}`,
        );
      }
    }

    const inflationSign = payload.inflation.percentOverMarket > 0 ? "+" : "";
    parts.push(
      `INFLATION: ${inflationSign}${Math.round(payload.inflation.percentOverMarket)}% (confidence: ${payload.inflation.confidence})`,
    );

    parts.push(
      `BUDGET: $${payload.budgetSummary.remainingBudget} remaining | Pacing: ${payload.budgetSummary.pacingStatus} | Max bid: $${payload.budgetSummary.maxBidRecommendation}`,
    );

    const highScarcity = payload.topScarcity.filter(
      (s) => s.scarcityIndex > 0.65,
    );
    if (highScarcity.length > 0) {
      const scarcityStr = highScarcity
        .map(
          (s) =>
            `${s.position} ${Math.round(s.scarcityIndex * 100)}%${s.myTeamNeeds ? " (YOU NEED)" : ""}`,
        )
        .join(", ");
      parts.push(`SCARCITY: ${scarcityStr}`);
    }

    const highRiskCats = payload.categoryGaps.filter(
      (c) => c.categoryRiskScore > 0.65,
    );
    if (highRiskCats.length > 0) {
      const catStr = highRiskCats
        .map(
          (c) =>
            `${c.category} (risk ${Math.round(c.categoryRiskScore * 100)}%, z=${c.gapZScore.toFixed(1)})`,
        )
        .join(", ");
      parts.push(`CAT GAPS: ${catStr}`);
    }

    if (payload.optimization !== null) {
      const opt = payload.optimization;
      const bidStatus = opt.shouldBid
        ? `BID $${opt.maxBid} (surplus: +$${opt.valueSurplus})`
        : `PASS (surplus: $${opt.valueSurplus})`;
      parts.push("OPTIMIZATION:");
      parts.push(`  Bid recommendation: ${bidStatus}`);
      parts.push(`  Simulation EV: ${opt.simulationEV.toFixed(1)} (confidence: ${opt.simulationConfidence})`);
      if (opt.topTargets.length > 0) {
        const targetsStr = opt.topTargets
          .map((t) => `${t.playerName} ${t.position} (SGP ${t.sgpValue.toFixed(1)}, max $${t.maxBid}, mkt $${t.expectedMarketPrice})`)
          .join(", ");
        parts.push(`  Top targets: ${targetsStr}`);
      }
      if (opt.opponentPressure.length > 0) {
        const pressureStr = opt.opponentPressure
          .map((p) => `${p.position} ${p.competitionFactor.toFixed(2)}`)
          .join(", ");
        parts.push(`  Position pressure: ${pressureStr}`);
      }
    }

    return parts.join("\n");
  }
}
