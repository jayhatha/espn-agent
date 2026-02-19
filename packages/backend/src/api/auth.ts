import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { getDb } from "../db/connection.js";
import { authenticate } from "../middleware/auth.js";

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

    // Check if user exists
    const existing = await getDb()
      .selectFrom("users")
      .select("id")
      .where("email", "=", email)
      .executeTakeFirst();

    if (existing) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await getDb()
      .insertInto("users")
      .values({
        email,
        password_hash: passwordHash,
        display_name: displayName || null,
        oauth_provider: "local",
        role: "user",
      })
      .returning(["id", "email", "role", "display_name", "avatar_url"])
      .executeTakeFirstOrThrow();

    // Generate JWT
    const token = fastify.jwt.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return reply.send({
      token,
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
      .where("email", "=", email)
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

    // Generate JWT
    const token = fastify.jwt.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
      },
    });
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

  // POST /api/auth/logout
  fastify.post(
    "/api/auth/logout",
    {
      onRequest: [authenticate],
    },
    async (request, reply) => {
      // JWT is stateless, so we just return success
      // Frontend will delete the token from localStorage
      return reply.send({ success: true });
    },
  );
}
