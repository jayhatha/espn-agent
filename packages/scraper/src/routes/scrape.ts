import type { FastifyInstance } from "fastify";
import { scrapePitcherlist } from "../scrapers/pitcherlist.js";
import { scrapeRotoballer } from "../scrapers/rotoballer.js";
import { scrapeFangraphs } from "../scrapers/fangraphs.js";

export async function scrapeRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /scrape/pitcherlist
   * Scrape latest Pitcherlist SP streamer rankings.
   * Query: ?force=true to bypass cache.
   */
  app.post<{ Querystring: { force?: string } }>(
    "/scrape/pitcherlist",
    async (request, reply) => {
      const force = request.query.force === "true";
      const entries = await scrapePitcherlist(request.log, force);
      return reply.send({
        source: "pitcherlist",
        count: entries.length,
        entries,
        scrapedAt: new Date().toISOString(),
      });
    },
  );

  /**
   * POST /scrape/rotoballer
   * Scrape latest Rotoballer start/sit rankings (uses headless browser).
   * Query: ?force=true to bypass cache.
   */
  app.post<{ Querystring: { force?: string } }>(
    "/scrape/rotoballer",
    async (request, reply) => {
      const force = request.query.force === "true";
      const entries = await scrapeRotoballer(request.log, force);
      return reply.send({
        source: "rotoballer",
        count: entries.length,
        entries,
        scrapedAt: new Date().toISOString(),
      });
    },
  );

  /**
   * POST /scrape/fangraphs
   * Scrape latest FanGraphs SP Chart (daily start/sit by league size).
   * Query: ?force=true to bypass cache.
   */
  app.post<{ Querystring: { force?: string } }>(
    "/scrape/fangraphs",
    async (request, reply) => {
      const force = request.query.force === "true";
      const entries = await scrapeFangraphs(request.log, force);
      return reply.send({
        source: "fangraphs",
        count: entries.length,
        entries,
        scrapedAt: new Date().toISOString(),
      });
    },
  );

  /**
   * POST /scrape/all
   * Scrape all sources in parallel. Returns combined results.
   * Query: ?force=true to bypass cache.
   */
  app.post<{ Querystring: { force?: string } }>(
    "/scrape/all",
    async (request, reply) => {
      const force = request.query.force === "true";
      const [pitcherlist, rotoballer, fangraphs] = await Promise.all([
        scrapePitcherlist(request.log, force),
        scrapeRotoballer(request.log, force),
        scrapeFangraphs(request.log, force),
      ]);

      return reply.send({
        sources: {
          pitcherlist: { count: pitcherlist.length, entries: pitcherlist },
          rotoballer: { count: rotoballer.length, entries: rotoballer },
          fangraphs: { count: fangraphs.length, entries: fangraphs },
        },
        totalEntries:
          pitcherlist.length + rotoballer.length + fangraphs.length,
        scrapedAt: new Date().toISOString(),
      });
    },
  );

  /**
   * GET /scrape/status
   * Check cache status for all sources without triggering a scrape.
   */
  app.get("/scrape/status", async (_request, reply) => {
    const { getCached } = await import("../lib/redis.js");
    const [pl, rb, fg] = await Promise.all([
      getCached("scraper:pitcherlist:latest"),
      getCached("scraper:rotoballer:latest"),
      getCached("scraper:fangraphs:latest"),
    ]);

    return reply.send({
      pitcherlist: {
        cached: pl !== null,
        entryCount: Array.isArray(pl) ? pl.length : 0,
      },
      rotoballer: {
        cached: rb !== null,
        entryCount: Array.isArray(rb) ? rb.length : 0,
      },
      fangraphs: {
        cached: fg !== null,
        entryCount: Array.isArray(fg) ? fg.length : 0,
      },
    });
  });
}
