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
      const promise1 = adapter.fetchLeague(123, 2026, {});
      await vi.advanceTimersByTimeAsync(0);

      // Second call - should wait 2s
      const promise2 = adapter.fetchLeague(456, 2026, {});

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
      const promise = adapter.fetchLeague(123, 2026, {});

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
      const promise1 = adapter.fetchLeague(123, 2026, {});
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
        cache.set(`key-${i}`, { data: i });
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
      const promise = adapter.fetchLeague(123, 2026, {});

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
      const promise = adapter.fetchLeague(123, 2026, {});

      // Advance timers to allow retry delay (Retry-After: 1s + axios-retry backoff)
      await vi.advanceTimersByTimeAsync(10000);

      const result = await promise;

      expect(result).toBeDefined();
      expect(mockClient).toHaveBeenCalledTimes(2); // Initial + 1 retry
    }, 10000);
  });
});
