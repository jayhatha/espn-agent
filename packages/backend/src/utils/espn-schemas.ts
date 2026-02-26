import { z } from "zod";

// ESPN League Response Schema
export const ESPNLeagueResponseSchema = z.object({
  id: z.number(),
  settings: z.object({
    name: z.string(),
    scoringPeriodId: z.number(),
    scoringSettings: z.object({
      scoringItems: z.array(z.unknown())
    }).passthrough()
  }).passthrough(),
  teams: z.array(z.object({
    id: z.number(),
    name: z.string().optional(),
    location: z.string().optional(),
    nickname: z.string().optional(),
    abbrev: z.string().optional(),
    roster: z.object({
      entries: z.array(z.unknown())
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
  logger?: any
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
