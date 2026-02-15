import Fastify from "fastify";
import cors from "@fastify/cors";
import redis from "@fastify/redis";
import multipart from "@fastify/multipart";
import { getDb } from "./db/connection.js";
import { leaguesRoutes } from "./api/leagues.js";
import { projectionsRoutes } from "./api/projections.js";
import { timeSeriesRoutes } from "./api/timeseries.js";
import { recommendationsRoutes } from "./api/recommendations.js";
import { slackRoutes } from "./api/slack.js";
import { internalRoutes } from "./api/internal.js";
import { getFeatureFlags } from "./utils/feature-flags.js";
import type { FastifyInstance } from "fastify";

const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      transport:
        process.env.NODE_ENV === "development"
          ? {
              target: "pino-pretty",
              options: {
                translateTime: "HH:MM:ss Z",
                ignore: "pid,hostname",
              },
            }
          : undefined,
    },
  });

  // Register plugins
  await server.register(cors, {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
  });

  await server.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max file size
    },
  });

  if (process.env.REDIS_URL) {
    await server.register(redis, {
      url: process.env.REDIS_URL,
      closeClient: true,
    });
  }

  // Add raw body parser for Slack signature verification
  // Slack sends form-encoded payloads that need raw body for HMAC
  server.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (req, body: string, done) => {
      (req as any).rawBody = body;
      // Parse form data
      const parsed: any = {};
      body.split("&").forEach((pair) => {
        const [key, value] = pair.split("=");
        parsed[decodeURIComponent(key)] = decodeURIComponent(value || "");
      });
      done(null, parsed);
    },
  );

  // Health check
  server.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // API routes
  server.get("/api", async () => {
    return {
      name: "ESPN Fantasy Baseball Assistant API",
      version: "0.1.0",
      features: getFeatureFlags(),
    };
  });

  await server.register(leaguesRoutes);
  await server.register(projectionsRoutes);
  await server.register(timeSeriesRoutes);
  await server.register(recommendationsRoutes);

  // Feature-flagged routes
  const flags = getFeatureFlags();
  if (flags.slackEnabled) {
    server.log.info("Slack integration enabled - registering Slack routes");
    await server.register(slackRoutes);
  } else {
    server.log.info(
      "Slack integration disabled - set FEATURE_SLACK_ENABLED=true to enable",
    );
  }

  await server.register(internalRoutes);

  // Graceful shutdown
  const closeGracefully = async (signal: string) => {
    server.log.info(`Received ${signal}, closing gracefully...`);
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => closeGracefully("SIGINT"));
  process.on("SIGTERM", () => closeGracefully("SIGTERM"));

  return server;
}

async function start() {
  try {
    // Initialize database connection
    getDb();

    const server = await buildServer();
    await server.listen({ port: PORT, host: HOST });
    server.log.info(`Server listening on ${HOST}:${PORT}`);
  } catch (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
}

start();
