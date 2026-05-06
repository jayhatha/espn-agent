import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import redis from "@fastify/redis";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import fastifyJwt from "@fastify/jwt";
import fastifyWebsocket from "@fastify/websocket";
import { getDb } from "./db/connection.js";
import { leaguesRoutes } from "./api/leagues.js";
import { projectionsRoutes } from "./api/projections.js";
import { timeSeriesRoutes } from "./api/timeseries.js";
import { recommendationsRoutes } from "./api/recommendations.js";
import { draftRoutes } from "./api/draft.js";
import { draftLiveRoutes } from "./api/draft-live.js";
import { slackRoutes } from "./api/slack.js";
import { internalRoutes } from "./api/internal.js";
import { authRoutes } from "./api/auth.js";
import { setupOAuth } from "./api/auth-oauth.js";
import { lineupRoutes } from "./api/lineup.js";
import { streamingRoutes } from "./api/streaming.js";
import { adminRoutes } from "./api/admin.js";
import { transactionImpactRoutes } from "./api/transaction-impact.js";
import { trendsRoutes } from "./api/trends.js";
import { faabRoutes } from "./api/faab.js";
import { pitchingUsageRoutes } from "./api/pitching-usage.js";
import { authenticate, requireAdmin } from "./middleware/auth.js";
import { getFeatureFlags } from "./utils/feature-flags.js";
import type { FastifyInstance } from "fastify";

const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";

// Fail fast in non-development environments if critical secrets are absent (C2)
if (process.env.NODE_ENV !== "development" && !process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is required outside development mode",
  );
}

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
    origin: (origin, callback) => {
      const allowedOrigins = [
        process.env.FRONTEND_URL || "http://localhost:3000",
        "https://fantasy.espn.com", // Chrome extension
      ];

      // Allow requests with no origin (like curl, Postman)
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else if (
        /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(origin)
      ) {
        // Allow private LAN IP origins for mobile draft companion
        callback(null, true);
      } else if (/^chrome-extension:\/\//.test(origin)) {
        // Allow Chrome extension — restrict to specific ID in production (W1)
        const allowedExtId = process.env.CHROME_EXTENSION_ID;
        if (
          !allowedExtId ||
          process.env.NODE_ENV === "development" ||
          origin === `chrome-extension://${allowedExtId}`
        ) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"), false);
        }
      } else if (/^http:\/\/localhost:\d+$/.test(origin)) {
        // Allow any localhost port — personal local tool, no production deployment risk.
        // Port shifts when e.g. Docker occupies :3000 or Next.js falls back to :3002.
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"), false);
      }
    },
    credentials: true,
  });

  // Register cookie plugin (must be before JWT)
  const cookieSecret =
    process.env.COOKIE_SECRET ??
    process.env.JWT_SECRET ??
    "development-secret";
  await server.register(cookie, { secret: cookieSecret });

  // Register JWT plugin for authentication (reads from accessToken cookie or Authorization header)
  const jwtSecret =
    process.env.JWT_SECRET ?? "development-secret-change-in-production";
  await server.register(fastifyJwt, {
    secret: jwtSecret,
    sign: {
      expiresIn: "15m",
    },
    cookie: {
      cookieName: "accessToken",
      signed: false,
    },
  });

  // Decorate fastify instance with auth methods
  server.decorate("authenticate", authenticate);
  server.decorate("requireAdmin", requireAdmin);

  await server.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max file size
    },
  });

  // Register Redis (optional for caching and rate limiting)
  if (process.env.REDIS_URL) {
    await server.register(redis, {
      url: process.env.REDIS_URL,
      closeClient: true,
    });
    server.log.info("Redis connected - using for rate limiting storage");
  }

  // Register rate limiting plugin (uses Redis if available, otherwise in-memory)
  await server.register(rateLimit, {
    global: false, // Per-route configuration
    redis: process.env.REDIS_URL ? server.redis : undefined,
    nameSpace: "espn-agent-rl:",
    continueExceeding: true,
    skipOnError: false,
  });

  // Register WebSocket plugin (must be before any route that uses { websocket: true })
  await server.register(fastifyWebsocket);

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

  // Auth routes (must be registered before protected routes)
  await server.register(authRoutes);
  if (process.env.GOOGLE_CLIENT_ID && process.env.GITHUB_CLIENT_ID) {
    await server.register(setupOAuth);
    server.log.info("OAuth providers (Google, GitHub) enabled");
  } else {
    server.log.warn(
      "OAuth not configured - set GOOGLE_CLIENT_ID and GITHUB_CLIENT_ID to enable",
    );
  }

  await server.register(leaguesRoutes);
  await server.register(projectionsRoutes);
  await server.register(timeSeriesRoutes);
  await server.register(recommendationsRoutes);
  await server.register(draftRoutes);
  await server.register(draftLiveRoutes);
  await server.register(lineupRoutes);
  await server.register(streamingRoutes);
  await server.register(adminRoutes);
  await server.register(transactionImpactRoutes);
  await server.register(trendsRoutes);
  await server.register(faabRoutes);
  await server.register(pitchingUsageRoutes);

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
