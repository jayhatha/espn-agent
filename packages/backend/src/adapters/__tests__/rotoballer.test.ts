import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RotoballerAdapter } from "../rotoballer.js";

/**
 * RotoballerAdapter Tests
 *
 * Tests graceful degradation when Rotoballer content is JS-rendered
 * or network errors occur. Rotoballer is a best-effort source —
 * all failure modes must return empty array, never throw.
 */

describe("RotoballerAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("constructor accepts optional logger without error", () => {
    expect(() => new RotoballerAdapter()).not.toThrow();
    expect(() => new RotoballerAdapter(undefined)).not.toThrow();

    const mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    expect(() => new RotoballerAdapter(mockLogger as any)).not.toThrow();
  });

  it("getRankings returns empty array when fetch throws (network error)", async () => {
    const adapter = new RotoballerAdapter();

    // Spy on the internal axios client to simulate a network error
    // Access private field via index notation
    const client = (adapter as any).cache;
    // Directly override the internal fetch by spying on axios
    // We use a different approach: verify the return type contract
    // If a real network error occurs (e.g., rotoballer unreachable), result must be []
    // We test this by verifying that the method handles errors gracefully

    // Mock the adapter's client to throw
    const axiosModule = await import("axios");
    const mockGet = vi.spyOn(axiosModule.default, "get").mockRejectedValueOnce(
      new Error("Network error: ECONNREFUSED")
    );

    let result: any;
    let threw = false;
    try {
      result = await adapter.getRankings();
    } catch {
      threw = true;
    }

    mockGet.mockRestore();

    // Must never throw to caller
    expect(threw).toBe(false);
    // Must return an array
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it("getRankings returns empty array when HTML contains no pitcher data (JS-rendered)", async () => {
    // Minimal HTML with no table elements — simulates JS-rendered content
    const jsRenderedHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <script src="/_next/static/chunks/main.js"></script>
        <script>window.__NEXT_DATA__ = {}</script>
      </head>
      <body>
        <div id="__NEXT_DATA__"></div>
        <div class="article-link"><a href="/start-sit-pitchers-fantasy-baseball-matchups-for-3-26-3-31-2026/1833281">Start Sit Pitchers</a></div>
        <script>/* ad tracking scripts */</script>
      </body>
      </html>
    `;

    // Mock axios to return JS-rendered HTML for both category and article pages
    const axiosModule = await import("axios");
    const mockGet = vi.spyOn(axiosModule.default, "get")
      .mockResolvedValueOnce({ data: jsRenderedHtml, status: 200 } as any)   // category page
      .mockResolvedValueOnce({ data: jsRenderedHtml, status: 200 } as any);  // article page

    const mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const adapter = new RotoballerAdapter(mockLogger as any);

    let result: any;
    let threw = false;
    try {
      result = await adapter.getRankings();
    } catch {
      threw = true;
    }

    mockGet.mockRestore();

    // Must never throw
    expect(threw).toBe(false);
    // Must return empty array when no pitcher data found
    expect(Array.isArray(result)).toBe(true);
    // The HTML has no table elements, so no pitcher data can be parsed
    expect(result).toEqual([]);
    // Should log a warning about JS-rendered content
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it("getRankings does not throw when fetch returns 404", async () => {
    const axiosModule = await import("axios");
    const axiosError = Object.assign(new Error("Request failed with status code 404"), {
      response: { status: 404 },
    });
    const mockGet = vi.spyOn(axiosModule.default, "get").mockRejectedValueOnce(axiosError);

    const adapter = new RotoballerAdapter();

    let threw = false;
    let result: any;
    try {
      result = await adapter.getRankings();
    } catch {
      threw = true;
    }

    mockGet.mockRestore();

    // The adapter should NEVER throw to the caller
    expect(threw).toBe(false);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it("getRankings returns an array type regardless of outcome", async () => {
    // Even without mocking, the method returns an array (real network call will fail in CI)
    const adapter = new RotoballerAdapter();
    const result = await adapter.getRankings().catch(() => [] as any[]);
    expect(Array.isArray(result)).toBe(true);
  });
});
