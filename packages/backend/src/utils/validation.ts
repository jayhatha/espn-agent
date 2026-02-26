import { z } from "zod";

// Request body schemas
export const SignupSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(3).max(50).optional()
});

export const LoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password required")
});

export const ConnectLeagueSchema = z.object({
  espnLeagueId: z.number().int().positive(),
  season: z.number().int().min(2020).max(2030),
  auth: z.object({
    SWID: z.string().optional(),
    espn_s2: z.string().optional()
  }).optional(),
  name: z.string().optional(),
  timezone: z.string().optional(),
  teamEspnId: z.number().int().positive().optional()
});

export const UpdateAuthSchema = z.object({
  SWID: z.string().min(1).optional(),
  espn_s2: z.string().min(1).optional()
}).refine(
  (data) => data.SWID !== undefined || data.espn_s2 !== undefined,
  "At least one of SWID or espn_s2 is required"
);

export const ProposedTradeSchema = z.object({
  playersGiven: z.array(z.number().int().positive()).min(1).max(3),
  playersReceived: z.array(z.number().int().positive()).min(1).max(3)
});

export const WaiverEvaluationSchema = z.object({
  addPlayerId: z.number().int().positive(),
  dropPlayerId: z.number().int().positive(),
  snapshotDate: z.string().optional()
});

// parseInt validation helper
export function parseIntParam(value: string, paramName: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid ${paramName}: must be a valid integer`);
  }
  return parsed;
}

// Type exports for TypeScript inference
export type SignupBody = z.infer<typeof SignupSchema>;
export type LoginBody = z.infer<typeof LoginSchema>;
export type ConnectLeagueBody = z.infer<typeof ConnectLeagueSchema>;
export type UpdateAuthBody = z.infer<typeof UpdateAuthSchema>;
export type ProposedTradeBody = z.infer<typeof ProposedTradeSchema>;
export type WaiverEvaluationBody = z.infer<typeof WaiverEvaluationSchema>;
