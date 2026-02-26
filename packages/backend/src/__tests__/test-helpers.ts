import { vi } from "vitest";

/**
 * Test Helpers
 *
 * Shared utilities for backend tests
 */

export function createMockDb() {
  return {
    selectFrom: vi.fn().mockReturnValue({
      selectAll: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      execute: vi.fn(),
      executeTakeFirst: vi.fn(),
      executeTakeFirstOrThrow: vi.fn()
    }),
    insertInto: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnThis(),
      execute: vi.fn()
    })
  } as any;
}

export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  };
}

export function createMockProjection(overrides = {}) {
  return {
    player_id: 1,
    projections_run_id: 1,
    as_of_date: "2026-02-26",
    stat_components_json: JSON.stringify({
      AB: 500,
      H: 150,
      R: 75,
      HR: 30,
      RBI: 90,
      SB: 15,
      BB: 60,
      HBP: 5,
      SF: 4,
      TB: 280,
      IP: 0,
      ER: 0
    }),
    ...overrides
  };
}
