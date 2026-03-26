import { describe, it, expect, vi } from "vitest";
import {
  ESPNLeagueResponseSchema,
  ESPNRosterEntrySchema,
  assertEspnCriticalShape,
  logUnexpectedFields,
  validateEspnResponse,
} from "../../utils/espn-schemas.js";
import { createMockLogger } from "../../__tests__/test-helpers.js";

// Realistic ESPN-shaped test fixtures
const validRosterEntry = {
  playerId: 4140001,
  lineupSlotId: 3,
  playerPoolEntry: {
    player: {
      fullName: "Shohei Ohtani",
      proTeamId: 17,
      eligibleSlots: [10, 14, 17, 16],
      stats: [],
    },
  },
};

const validScoringItem = {
  statId: 5,
  isReverseItem: false,
};

const buildValidLeagueResponse = (overrides: Record<string, unknown> = {}) => ({
  id: 12345,
  settings: {
    name: "Test League",
    scoringPeriodId: 12,
    scoringSettings: {
      scoringItems: [validScoringItem],
    },
  },
  teams: [
    {
      id: 1,
      name: "Team Alpha",
      roster: {
        entries: [validRosterEntry],
      },
    },
  ],
  ...overrides,
});

// ---------------------------------------------------------------------------
// ESPNLeagueResponseSchema tests
// ---------------------------------------------------------------------------

describe("ESPNLeagueResponseSchema", () => {
  it("accepts valid ESPN-shaped data with roster entries containing playerId, lineupSlotId, and fullName", () => {
    const result = ESPNLeagueResponseSchema.safeParse(buildValidLeagueResponse());
    expect(result.success).toBe(true);
  });

  it("rejects response where teams[0].roster.entries[0] lacks playerId", () => {
    const data = buildValidLeagueResponse({
      teams: [
        {
          id: 1,
          roster: {
            entries: [
              {
                // missing playerId
                lineupSlotId: 3,
                playerPoolEntry: { player: { fullName: "Test Player" } },
              },
            ],
          },
        },
      ],
    });
    const result = ESPNLeagueResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects scoringItems entry missing statId", () => {
    const data = buildValidLeagueResponse({
      settings: {
        name: "Test League",
        scoringPeriodId: 12,
        scoringSettings: {
          scoringItems: [
            {
              // missing statId
              isReverseItem: false,
            },
          ],
        },
      },
    });
    const result = ESPNLeagueResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("accepts valid response with empty teams array", () => {
    const data = buildValidLeagueResponse({ teams: [] });
    const result = ESPNLeagueResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ESPNRosterEntrySchema tests
// ---------------------------------------------------------------------------

describe("ESPNRosterEntrySchema", () => {
  it("accepts valid roster entry with required fields", () => {
    const result = ESPNRosterEntrySchema.safeParse(validRosterEntry);
    expect(result.success).toBe(true);
  });

  it("rejects roster entry missing playerId", () => {
    const { playerId: _, ...noPlayerId } = validRosterEntry;
    const result = ESPNRosterEntrySchema.safeParse(noPlayerId);
    expect(result.success).toBe(false);
  });

  it("accepts roster entry with optional lineupSlotId missing", () => {
    const { lineupSlotId: _, ...noSlot } = validRosterEntry;
    const result = ESPNRosterEntrySchema.safeParse(noSlot);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// assertEspnCriticalShape tests
// ---------------------------------------------------------------------------

describe("assertEspnCriticalShape", () => {
  it("throws Error with message containing 'missing \\'teams\\' array' when data has no teams field", () => {
    const logger = createMockLogger();
    expect(() => assertEspnCriticalShape({ id: 1 }, "test-context", logger)).toThrow(
      /missing 'teams' array/
    );
  });

  it("throws Error when data is null", () => {
    const logger = createMockLogger();
    expect(() => assertEspnCriticalShape(null, "test-context", logger)).toThrow();
  });

  it("throws Error when data is a string", () => {
    const logger = createMockLogger();
    expect(() => assertEspnCriticalShape("not-an-object", "test-context", logger)).toThrow();
  });

  it("does NOT throw when data has teams array (even if empty)", () => {
    const logger = createMockLogger();
    expect(() => assertEspnCriticalShape({ teams: [] }, "test-context", logger)).not.toThrow();
  });

  it("calls logger.error when throwing for missing teams", () => {
    const logger = createMockLogger();
    try {
      assertEspnCriticalShape({ id: 1 }, "test-context", logger);
    } catch {
      // expected
    }
    expect(logger.error).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// logUnexpectedFields tests
// ---------------------------------------------------------------------------

describe("logUnexpectedFields", () => {
  it("calls logger.info with unexpectedFields when data has keys not in knownFields", () => {
    const logger = createMockLogger();
    logUnexpectedFields(
      { id: 1, teams: [], newField: "surprise" },
      ["id", "teams"],
      "test-context",
      logger
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ unexpectedFields: expect.arrayContaining(["newField"]) }),
      expect.any(String)
    );
  });

  it("does NOT call logger.info when all keys are known", () => {
    const logger = createMockLogger();
    logUnexpectedFields({ id: 1, teams: [] }, ["id", "teams"], "test-context", logger);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("handles empty data object without calling logger", () => {
    const logger = createMockLogger();
    logUnexpectedFields({}, ["id", "teams"], "test-context", logger);
    expect(logger.info).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// validateEspnResponse tests
// ---------------------------------------------------------------------------

describe("validateEspnResponse", () => {
  it("returns raw data (does NOT throw) when schema fails — graceful degradation preserved", () => {
    const logger = createMockLogger();
    const badData = { notValid: true }; // fails ESPNLeagueResponseSchema
    let result: unknown;
    expect(() => {
      result = validateEspnResponse(ESPNLeagueResponseSchema, badData, "test-context", logger);
    }).not.toThrow();
    expect(result).toBe(badData);
  });

  it("calls logger.warn on schema mismatch", () => {
    const logger = createMockLogger();
    validateEspnResponse(ESPNLeagueResponseSchema, { bad: true }, "test-context", logger);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("returns parsed data when schema succeeds", () => {
    const logger = createMockLogger();
    const valid = buildValidLeagueResponse();
    const result = validateEspnResponse(ESPNLeagueResponseSchema, valid, "test-context", logger);
    expect(result).toMatchObject({ id: 12345 });
  });
});
