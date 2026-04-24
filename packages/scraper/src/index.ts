import Fastify from "fastify";
import { scrapeRoutes } from "./routes/scrape.js";
import { closeRedis, getRedis } from "./lib/redis.js";

const PORT = parseInt(process.env.PORT || "3002", 10);
const HOST = process.env.HOST || "0.0.0.0";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty" }
        : undefined,
  },
});

// Health check
app.get("/health", async () => ({ status: "ok", service: "scraper" }));

// Register routes
await app.register(scrapeRoutes);

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down scraper service");
  await app.close();
  await closeRedis();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Connect Redis and start server
try {
  await getRedis().connect();
  app.log.info("Redis connected");
} catch (err) {
  app.log.warn({ err }, "Redis connection failed — running without cache");
}

await app.listen({ port: PORT, host: HOST });
app.log.info(`Scraper service listening on ${HOST}:${PORT}`);
