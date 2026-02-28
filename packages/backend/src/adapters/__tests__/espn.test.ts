import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ESPNAdapter } from "../espn.js";
import { createMockLogger } from "../../__tests__/test-helpers.js";

/**
 * ESPNAdapter Tests
 *
 * Tests rate limiting improvements from Plan 13-05 (DEBT-09)
 */

describe("ESPNAdapter", () => {
  let adapter: ESPNAdapter;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = createMockLogger();
    adapter = new ESPNAdapter(mockLogger);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("rate limiting (DEBT-09)", () => {
    it("should throttle consecutive calls with 2-second delay", async () => {
      // Mock client.get with valid ESPN response structure
      const mockResponse = {
        data: {
          id: 123,
          scoringPeriodId: 1,
          status: { currentMatchupPeriod: 1, finalScoringPeriod: 26 },
          settings: { name: "Test League" },
          teams: [],
          members: []
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any
      };

      const mockClient = vi.spyOn(adapter["client"], "get").mockResolvedValue(mockResponse);

      // First call - no delay
      const promise1 = adapter.fetchLeague({ leagueId: 123, season: 2026 });
      await vi.advanceTimersByTimeAsync(0);

      // Second call - should wait 2s
      const promise2 = adapter.fetchLeague({ leagueId: 456, season: 2026 });

      // Should have called client once (first call)
      expect(mockClient).toHaveBeenCalledTimes(1);

      // Advance 2 seconds to trigger throttle release
      await vi.advanceTimersByTimeAsync(2000);

      // Wait for both promises
      await promise1;
      await promise2;

      // Now second call should have executed
      expect(mockClient).toHaveBeenCalledTimes(2);
    }, 10000);

    it("should handle 429 errors with Retry-After header", async () => {
      const error = {
        response: {
          status: 429,
          headers: { "retry-after": "30" }
        },
        isAxiosError: true
      };

      vi.spyOn(adapter["client"], "get").mockRejectedValue(error);

      // The adapter will retry on 429 via axios-retry, which will eventually fail after retries exhausted
      // With fake timers, we need to advance through all retry attempts
      const promise = adapter.fetchLeague({ leagueId: 123, season: 2026 });

      // Advance through all retry attempts (axios-retry does exponential backoff)
      await vi.advanceTimersByTimeAsync(60000); // Advance enough to exhaust retries

      await expect(promise).rejects.toMatchObject({
        response: { status: 429 }
      });
    }, 10000);

    it("should respect throttle across different fetch methods", async () => {
      const mockLeagueResponse = {
        data: {
          id: 123,
          scoringPeriodId: 1,
          status: { currentMatchupPeriod: 1, finalScoringPeriod: 26 },
          settings: { name: "Test League" },
          teams: [],
          members: []
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any
      };

      const mockFreeAgentsResponse = {
        data: { players: [] },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any
      };

      const mockClient = vi.spyOn(adapter["client"], "get")
        .mockResolvedValueOnce(mockLeagueResponse)
        .mockResolvedValueOnce(mockFreeAgentsResponse);

      // Mix of fetchLeague and fetchFreeAgents
      const promise1 = adapter.fetchLeague({ leagueId: 123, season: 2026 });
      await vi.advanceTimersByTimeAsync(0);

      const promise2 = adapter.fetchFreeAgents({ leagueId: 123, season: 2026 });

      // Only first call should execute immediately
      expect(mockClient).toHaveBeenCalledTimes(1);

      // Advance past throttle
      await vi.advanceTimersByTimeAsync(2000);

      await promise1;
      await promise2;

      expect(mockClient).toHaveBeenCalledTimes(2);
    });
  });

  describe("cache bounds (DEBT-09)", () => {
    it("should use LRU cache with max size of 500", () => {
      // Access private cache to verify it's LRUCache instance with correct config
      const cache = adapter["cache"];

      expect(cache).toBeDefined();
      expect(cache.max).toBe(500); // From Plan 13-05
    });

    it("should evict old entries when max size reached", async () => {
      const cache = adapter["cache"];

      // Fill cache beyond max
      for (let i = 0; i < 600; i++) {
        cache.set(`key-${i}`, { data: i, expiresAt: Date.now() + 3600000 });
      }

      // Size should be at most 500
      expect(cache.size).toBeLessThanOrEqual(500);

      // Oldest entries should be evicted (LRU behavior)
      expect(cache.has("key-0")).toBe(false);
      expect(cache.has("key-99")).toBe(false);

      // Newest entries should still exist
      expect(cache.has("key-599")).toBe(true);
      expect(cache.has("key-550")).toBe(true);
    });

    it("should have TTL configured for cache entries", () => {
      const cache = adapter["cache"];

      // Verify TTL is set (1 hour = 3600000ms from Plan 13-05)
      expect(cache.ttl).toBe(3600000);
    });
  });

  describe("retry configuration", () => {
    it("should retry on network errors", async () => {
      const mockResponse = {
        data: {
          id: 123,
          scoringPeriodId: 1,
          status: { currentMatchupPeriod: 1, finalScoringPeriod: 26 },
          settings: { name: "Test League" },
          teams: [],
          members: []
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any
      };

      const mockClient = vi.spyOn(adapter["client"], "get")
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(mockResponse);

      // Start the fetch
      const promise = adapter.fetchLeague({ leagueId: 123, season: 2026 });

      // Advance timers to allow axios-retry to complete
      await vi.advanceTimersByTimeAsync(10000);

      // Should succeed after retry
      const result = await promise;

      expect(result).toBeDefined();
      expect(mockClient).toHaveBeenCalledTimes(2); // Initial + 1 retry
    }, 10000);

    it("should retry on 429 rate limit errors", async () => {
      const mockResponse = {
        data: {
          id: 123,
          scoringPeriodId: 1,
          status: { currentMatchupPeriod: 1, finalScoringPeriod: 26 },
          settings: { name: "Test League" },
          teams: [],
          members: []
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any
      };

      const mockClient = vi.spyOn(adapter["client"], "get")
        .mockRejectedValueOnce({
          response: {
            status: 429,
            headers: { "retry-after": "1" }
          },
          isAxiosError: true
        })
        .mockResolvedValueOnce(mockResponse);

      // Start the fetch
      const promise = adapter.fetchLeague({ leagueId: 123, season: 2026 });

      // Advance timers to allow retry delay (Retry-After: 1s + axios-retry backoff)
      await vi.advanceTimersByTimeAsync(10000);

      const result = await promise;

      expect(result).toBeDefined();
      expect(mockClient).toHaveBeenCalledTimes(2); // Initial + 1 retry
    }, 10000);
  });

  describe("fetchPreDraftAuctionValues", () => {
    it("should fetch auction values for 100+ players", async () => {
      // This is an integration test - requires real ESPN league
      // Skip in CI if ESPN credentials not available
      const espnLeagueId = parseInt(process.env.TEST_ESPN_LEAGUE_ID || "0");
      const season = 2026;

      if (espnLeagueId === 0) {
        console.log("Skipping fetchPreDraftAuctionValues test - set TEST_ESPN_LEAGUE_ID to run");
        return;
      }

      const adapter = new ESPNAdapter(mockLogger);
      const auth = {
        SWID: process.env.ESPN_SWID || "",
        espn_s2: process.env.ESPN_S2 || "",
      };

      const result = await adapter.fetchPreDraftAuctionValues({
        leagueId: espnLeagueId,
        season,
        auth: auth.SWID && auth.espn_s2 ? auth : undefined,
      });

      // Should return significantly more than 6 players
      expect(result.length).toBeGreaterThan(100);

      // Should have players across multiple positions
      const positions = new Set(result.flatMap(p => p.positions));
      expect(positions.size).toBeGreaterThan(5); // At least 6 different positions

      // Should have variation in auction values (not all the same)
      const values = result.map(p => p.espnAuctionValue);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBeGreaterThan(10); // At least 10 different values

      // Top player should have reasonable auction value
      const topPlayer = result[0]; // Result is sorted by value descending
      expect(topPlayer.espnAuctionValue).toBeGreaterThan(20); // Top player > $20
      expect(topPlayer.espnAuctionValue).toBeLessThan(100); // Top player < $100 (sanity check)
    });

    it("should handle missing auction values gracefully", async () => {
      // Unit test with mocked response containing no auction values
      const mockResponse = {
        status: 200,
        data: {
          players: [
            {
              id: 12345,
              player: {
                fullName: "Test Player",
                eligibleSlots: [0, 1],
                draftRanksByRankType: {
                  STANDARD: {
                    // No auctionValue field
                  },
                },
              },
            },
          ],
        },
      };

      const adapter = new ESPNAdapter(mockLogger);
      // Mock axios to return empty auction values
      vi.spyOn(adapter["client"], "get").mockResolvedValue(mockResponse);

      const result = await adapter.fetchPreDraftAuctionValues({
        leagueId: 123,
        season: 2026,
      });

      // Should return empty array, not throw
      expect(result).toEqual([]);
    });
  });
});
