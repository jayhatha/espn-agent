import { FastifyInstance, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import { getDb } from "../db/connection.js";

const SECURE_COOKIES = process.env.COOKIE_SECURE === "false"
  ? false
  : process.env.NODE_ENV === "production";
const ACCESS_TOKEN_MAX_AGE = 900; // 15 minutes in seconds
const REFRESH_TOKEN_MAX_AGE = 604800; // 7 days in seconds
const REFRESH_TOKEN_HASH_ROUNDS = 10; // Lower rounds for token hashing (not passwords)

/**
 * Set HttpOnly auth cookies on the response.
 */
export function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
): void {
  reply.setCookie("accessToken", accessToken, {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });

  reply.setCookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

/**
 * Clear auth cookies from the response.
 */
export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie("accessToken", {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: "lax",
    path: "/",
  });

  reply.clearCookie("refreshToken", {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: "lax",
    path: "/api/auth",
  });
}

/**
 * Issue an access + refresh token pair and store the refresh token hash in the database.
 * Returns both tokens.
 */
export async function issueTokenPair(
  fastify: FastifyInstance,
  user: { id: number; email: string; role: string },
): Promise<{ accessToken: string; refreshToken: string }> {
  // Generate access token (15 min)
  const accessToken = fastify.jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    { expiresIn: "15m" },
  );

  // Generate refresh token (7 days)
  const refreshToken = fastify.jwt.sign(
    {
      userId: user.id,
      type: "refresh",
    },
    { expiresIn: "7d" },
  );

  // Hash the refresh token for storage
  const tokenHash = await bcrypt.hash(refreshToken, REFRESH_TOKEN_HASH_ROUNDS);

  // Store in database
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE * 1000);
  await getDb()
    .insertInto("refresh_tokens")
    .values({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .execute();

  return { accessToken, refreshToken };
}
