import { describe, it, expect } from "vitest";
import {
  parseIntParam,
  SignupSchema,
  LoginSchema,
  ConnectLeagueSchema,
  UpdateAuthSchema,
  ProposedTradeSchema,
  WaiverEvaluationSchema,
} from "../../utils/validation.js";

// ─── parseIntParam ─────────────────────────────────────────────────────────

describe("parseIntParam", () => {
  it("parses a valid integer string", () => {
    expect(parseIntParam("42", "leagueId")).toBe(42);
  });

  it("parses negative integers", () => {
    expect(parseIntParam("-5", "offset")).toBe(-5);
  });

  it("throws for non-numeric strings", () => {
    expect(() => parseIntParam("abc", "id")).toThrowError(/must be a valid integer/);
  });

  it("throws for decimal strings (rejects floats explicitly)", () => {
    expect(() => parseIntParam("3.14", "id")).toThrowError(/must be an integer/);
  });

  it("throws for empty string", () => {
    expect(() => parseIntParam("", "id")).toThrowError(/must be a valid integer/);
  });

  it("includes the paramName in the error message", () => {
    expect(() => parseIntParam("bad", "teamId")).toThrowError(/teamId/);
  });
});

// ─── SignupSchema ──────────────────────────────────────────────────────────

describe("SignupSchema", () => {
  it("accepts valid signup payload", () => {
    const result = SignupSchema.safeParse({
      email: "user@example.com",
      password: "securep4ss",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional displayName", () => {
    const result = SignupSchema.safeParse({
      email: "user@example.com",
      password: "securep4ss",
      displayName: "Jay",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", () => {
    const result = SignupSchema.safeParse({
      email: "not-an-email",
      password: "securep4ss",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = SignupSchema.safeParse({
      email: "user@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects displayName shorter than 3 characters", () => {
    const result = SignupSchema.safeParse({
      email: "user@example.com",
      password: "securep4ss",
      displayName: "ab",
    });
    expect(result.success).toBe(false);
  });
});

// ─── LoginSchema ───────────────────────────────────────────────────────────

describe("LoginSchema", () => {
  it("accepts valid credentials", () => {
    const result = LoginSchema.safeParse({
      email: "user@example.com",
      password: "anypassword",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing password", () => {
    const result = LoginSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password string", () => {
    const result = LoginSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

// ─── ConnectLeagueSchema ───────────────────────────────────────────────────

describe("ConnectLeagueSchema", () => {
  it("accepts minimal valid payload", () => {
    const result = ConnectLeagueSchema.safeParse({
      espnLeagueId: 12345,
      season: 2025,
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-integer espnLeagueId", () => {
    const result = ConnectLeagueSchema.safeParse({
      espnLeagueId: 1.5,
      season: 2025,
    });
    expect(result.success).toBe(false);
  });

  it("rejects season before 2020", () => {
    const result = ConnectLeagueSchema.safeParse({
      espnLeagueId: 12345,
      season: 2019,
    });
    expect(result.success).toBe(false);
  });

  it("rejects season after 2030", () => {
    const result = ConnectLeagueSchema.safeParse({
      espnLeagueId: 12345,
      season: 2031,
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional auth cookies", () => {
    const result = ConnectLeagueSchema.safeParse({
      espnLeagueId: 12345,
      season: 2025,
      auth: { SWID: "{abc}", espn_s2: "xyz" },
    });
    expect(result.success).toBe(true);
  });
});

// ─── UpdateAuthSchema ──────────────────────────────────────────────────────

describe("UpdateAuthSchema", () => {
  it("accepts when only SWID is provided", () => {
    const result = UpdateAuthSchema.safeParse({ SWID: "{abc-def}" });
    expect(result.success).toBe(true);
  });

  it("accepts when only espn_s2 is provided", () => {
    const result = UpdateAuthSchema.safeParse({ espn_s2: "long_token_value" });
    expect(result.success).toBe(true);
  });

  it("rejects when neither SWID nor espn_s2 is provided", () => {
    const result = UpdateAuthSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty string values", () => {
    const result = UpdateAuthSchema.safeParse({ SWID: "" });
    expect(result.success).toBe(false);
  });
});

// ─── ProposedTradeSchema ───────────────────────────────────────────────────

describe("ProposedTradeSchema", () => {
  it("accepts a valid 1-for-1 trade", () => {
    const result = ProposedTradeSchema.safeParse({
      playersGiven: [101],
      playersReceived: [202],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a 3-for-3 trade", () => {
    const result = ProposedTradeSchema.safeParse({
      playersGiven: [1, 2, 3],
      playersReceived: [4, 5, 6],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty playersGiven array", () => {
    const result = ProposedTradeSchema.safeParse({
      playersGiven: [],
      playersReceived: [202],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 3 players on either side", () => {
    const result = ProposedTradeSchema.safeParse({
      playersGiven: [1, 2, 3, 4],
      playersReceived: [5],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive player IDs", () => {
    const result = ProposedTradeSchema.safeParse({
      playersGiven: [0],
      playersReceived: [202],
    });
    expect(result.success).toBe(false);
  });
});

// ─── WaiverEvaluationSchema ────────────────────────────────────────────────

describe("WaiverEvaluationSchema", () => {
  it("accepts valid add/drop IDs", () => {
    const result = WaiverEvaluationSchema.safeParse({
      addPlayerId: 111,
      dropPlayerId: 222,
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional snapshotDate", () => {
    const result = WaiverEvaluationSchema.safeParse({
      addPlayerId: 111,
      dropPlayerId: 222,
      snapshotDate: "2026-05-06",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-positive player IDs", () => {
    const result = WaiverEvaluationSchema.safeParse({
      addPlayerId: -1,
      dropPlayerId: 222,
    });
    expect(result.success).toBe(false);
  });
});
