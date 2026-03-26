import { z } from "zod";
import type { BaseLogger } from "pino";

// ESPN Roster Entry Schema — replaces z.unknown() in teams.roster.entries
export const ESPNRosterEntrySchema = z.object({
  playerId: z.number(),
  lineupSlotId: z.number().optional(),
  playerPoolEntry: z.object({
    player: z.object({
      fullName: z.string().optional(),
      proTeamId: z.number().optional(),
      eligibleSlots: z.array(z.number()).optional(),
      stats: z.array(z.unknown()).optional(),
    }).passthrough()
  }).passthrough().optional()
}).passthrough();

// ESPN Scoring Item Schema — replaces z.unknown() in scoringSettings.scoringItems
const ESPNScoringItemSchema = z.object({
  statId: z.number(),
  isReverseItem: z.boolean().optional(),
}).passthrough();

// ESPN League Response Schema
export const ESPNLeagueResponseSchema = z.object({
  id: z.number(),
  settings: z.object({
    name: z.string(),
    scoringPeriodId: z.number(),
    scoringSettings: z.object({
      scoringItems: z.array(ESPNScoringItemSchema)
    }).passthrough(),
    rosterSettings: z.object({
      lineupSlotCounts: z.record(z.string(), z.number())
    }).passthrough().optional()
  }).passthrough(),
  teams: z.array(z.object({
    id: z.number(),
    name: z.string().optional(),
    location: z.string().optional(),
    nickname: z.string().optional(),
    abbrev: z.string().optional(),
    valuesByStat: z.record(z.string(), z.number()).optional(),
    roster: z.object({
      entries: z.array(ESPNRosterEntrySchema)
    }).passthrough().optional()
  }).passthrough()),
  schedule: z.array(z.unknown()).optional()
}).passthrough(); // Allow extra fields for forward compatibility

// ESPN Player Response Schema
export const ESPNPlayerResponseSchema = z.object({
  id: z.number(),
  player: z.object({
    fullName: z.string(),
    proTeamId: z.number().optional(),
    eligibleSlots: z.array(z.number()).optional(),
    stats: z.array(z.unknown()).optional()
  }).passthrough()
}).passthrough();

// ESPN Free Agents Response Schema
export const ESPNFreeAgentsResponseSchema = z.object({
  players: z.array(z.object({
    id: z.number(),
    player: z.object({
      fullName: z.string(),
      proTeamId: z.number().optional(),
      eligibleSlots: z.array(z.number()).optional(),
      ownership: z.object({
        percentOwned: z.number().optional(),
        percentStarted: z.number().optional()
      }).passthrough().optional()
    }).passthrough()
  }).passthrough()).optional()
}).passthrough();

// ESPN Transactions Response Schema
export const ESPNTransactionsResponseSchema = z.object({
  transactions: z.array(z.object({
    id: z.union([z.number(), z.string()]),
    type: z.number(),
    proposedDate: z.number().optional(),
    processDate: z.number().optional(),
    acceptedDate: z.number().optional(),
    bidAmount: z.number().optional(),
    items: z.array(z.object({
      playerId: z.number(),
      fromTeamId: z.number().optional(),
      toTeamId: z.number().optional(),
      player: z.object({
        fullName: z.string().optional(),
        lastName: z.string().optional()
      }).passthrough().optional()
    }).passthrough())
  }).passthrough()).optional()
}).passthrough();

// Helper to validate and log schema mismatches
export function validateEspnResponse<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string,
  logger?: BaseLogger
): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    logger?.warn(
      {
        context,
        errors: result.error.errors.slice(0, 5) // Log first 5 errors only
      },
      "ESPN response schema mismatch - possible API change"
    );
    // Return data anyway for graceful degradation
    return data as T;
  }

  return result.data;
}

/**
 * Asserts that the ESPN response contains the critical structure required
 * for normalization. Throws if the response is null, non-object, or missing
 * the `teams` array. This is a hard failure — normalization cannot proceed
 * without these fields.
 */
export function assertEspnCriticalShape(
  data: unknown,
  context: string,
  logger?: BaseLogger
): asserts data is Record<string, unknown> {
  if (typeof data !== "object" || data === null) {
    const msg = `ESPN returned non-object for ${context}`;
    logger?.error({ context, dataType: typeof data }, msg);
    throw new Error(msg);
  }
  const raw = data as Record<string, unknown>;
  if (!Array.isArray(raw.teams)) {
    const msg = `ESPN response missing 'teams' array for ${context}`;
    logger?.error({ context, keys: Object.keys(raw).slice(0, 10) }, msg);
    throw new Error(msg);
  }
}

/**
 * Logs any keys present in `data` that are not in `knownFields` at INFO level.
 * Used to detect ESPN API schema drift without blocking normalization.
 */
export function logUnexpectedFields(
  data: Record<string, unknown>,
  knownFields: string[],
  context: string,
  logger?: BaseLogger
): void {
  const unexpected = Object.keys(data).filter(k => !knownFields.includes(k));
  if (unexpected.length > 0) {
    logger?.info({ context, unexpectedFields: unexpected }, "ESPN response contains new unknown fields");
  }
}
