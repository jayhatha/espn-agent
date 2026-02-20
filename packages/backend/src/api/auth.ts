import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { getDb } from "../db/connection.js";
import { authenticate } from "../middleware/auth.js";
import {
  setAuthCookies,
  clearAuthCookies,
  issueTokenPair,
} from "../utils/auth-cookies.js";

const PASSWORD_HASH_ROUNDS = 13;

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/signup - User registration
  fastify.post("/api/auth/signup", async (request, reply) => {
    const { email, password, displayName } = request.body as {
      email: string;
      password: string;
      displayName?: string;
    };

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return reply.code(400).send({ error: "Invalid email format" });
    }

    // Validate password strength (8+ chars, uppercase, lowercase, number)
    if (password.length < 8) {
      return reply
        .code(400)
        .send({ error: "Password must be at least 8 characters" });
    }
    if (
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      return reply.code(400).send({
        error: "Password must contain uppercase, lowercase, and number",
      });
    }

    // Lowercase email for case-insensitive uniqueness
    const normalizedEmail = email.toLowerCase();

    // Check if user exists
    const existing = await getDb()
      .selectFrom("users")
      .select("id")
      .where("email", "=", normalizedEmail)
      .executeTakeFirst();

    if (existing) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    // Hash password with 13 rounds
    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

    // Create user
    const user = await getDb()
      .insertInto("users")
      .values({
        email: normalizedEmail,
        password_hash: passwordHash,
        display_name: displayName || null,
        oauth_provider: "local",
        role: "user",
      })
      .returning(["id", "email", "role", "display_name", "avatar_url"])
      .executeTakeFirstOrThrow();

    // Issue token pair and set cookies
    const tokens = await issueTokenPair(fastify, {
      id: user.id,
      email: user.email,
      role: user.role,
    });
    setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
      },
    });
  });

  // POST /api/auth/login - User login
  fastify.post("/api/auth/login", async (request, reply) => {
    const { email, password } = request.body as {
      email: string;
      password: string;
    };

    // Lowercase email for lookup
    const normalizedEmail = email.toLowerCase();

    // Find user
    const user = await getDb()
      .selectFrom("users")
      .select([
        "id",
        "email",
        "password_hash",
        "role",
        "display_name",
        "avatar_url",
      ])
      .where("email", "=", normalizedEmail)
      .executeTakeFirst();

    if (!user || !user.password_hash) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    // Update last login
    await getDb()
      .updateTable("users")
      .set({ last_login_at: new Date() })
      .where("id", "=", user.id)
      .execute();

    // Issue token pair and set cookies
    const tokens = await issueTokenPair(fastify, {
      id: user.id,
      email: user.email,
      role: user.role,
    });
    setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
      },
    });
  });

  // POST /api/auth/refresh - Rotate refresh token
  fastify.post("/api/auth/refresh", async (request, reply) => {
    const refreshTokenValue = request.cookies?.refreshToken;

    if (!refreshTokenValue) {
      return reply.code(401).send({ error: "No refresh token" });
    }

    // Verify JWT signature and check type
    let payload: { userId: number; type?: string };
    try {
      payload = fastify.jwt.verify<{ userId: number; type?: string }>(
        refreshTokenValue,
      );
    } catch {
      return reply.code(401).send({ error: "Invalid refresh token" });
    }

    if (payload.type !== "refresh") {
      return reply.code(401).send({ error: "Invalid token type" });
    }

    // Look up valid refresh tokens for this user
    const storedTokens = await getDb()
      .selectFrom("refresh_tokens")
      .selectAll()
      .where("user_id", "=", payload.userId)
      .where("expires_at", ">", new Date())
      .execute();

    // Check if any stored token matches the presented one
    let matchedToken: (typeof storedTokens)[0] | null = null;
    for (const stored of storedTokens) {
      const matches = await bcrypt.compare(
        refreshTokenValue,
        stored.token_hash,
      );
      if (matches) {
        matchedToken = stored;
        break;
      }
    }

    if (!matchedToken) {
      // Potential token reuse attack - delete ALL refresh tokens for this user
      await getDb()
        .deleteFrom("refresh_tokens")
        .where("user_id", "=", payload.userId)
        .execute();
      clearAuthCookies(reply);
      return reply
        .code(401)
        .send({ error: "Invalid refresh token - all sessions revoked" });
    }

    // Delete the old refresh token
    await getDb()
      .deleteFrom("refresh_tokens")
      .where("id", "=", matchedToken.id)
      .execute();

    // Fetch user info for new tokens
    const user = await getDb()
      .selectFrom("users")
      .select(["id", "email", "role"])
      .where("id", "=", payload.userId)
      .executeTakeFirst();

    if (!user) {
      clearAuthCookies(reply);
      return reply.code(401).send({ error: "User not found" });
    }

    // Issue new token pair and set cookies
    const tokens = await issueTokenPair(fastify, {
      id: user.id,
      email: user.email,
      role: user.role,
    });
    setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);

    return reply.send({ success: true });
  });

  // GET /api/auth/me - Get current user
  fastify.get(
    "/api/auth/me",
    {
      onRequest: [authenticate],
    },
    async (request, reply) => {
      const userId = request.user.userId;

      const user = await getDb()
        .selectFrom("users")
        .select([
          "id",
          "email",
          "role",
          "display_name",
          "avatar_url",
          "created_at",
        ])
        .where("id", "=", userId)
        .executeTakeFirst();

      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }

      return reply.send({
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
      });
    },
  );

  // POST /api/auth/logout - Clear auth cookies and delete refresh tokens
  fastify.post("/api/auth/logout", async (request, reply) => {
    // Try to authenticate, but don't fail if token is invalid/missing
    try {
      await request.jwtVerify();
      // Delete ALL refresh tokens for the authenticated user
      await getDb()
        .deleteFrom("refresh_tokens")
        .where("user_id", "=", request.user.userId)
        .execute();
    } catch {
      // No valid token - still clear cookies
    }

    clearAuthCookies(reply);
    return reply.send({ success: true });
  });
}
