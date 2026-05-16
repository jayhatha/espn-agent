import { FastifyRequest, FastifyReply } from "fastify";

// JWT payload interface - extending @fastify/jwt types
declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: {
      userId: number;
      email: string;
      role: "user" | "admin";
    };
  }
}

// =============================================================================
// AUTH MODE
// Set SINGLE_USER_MODE=true in .env to bypass JWT authentication.
// When SINGLE_USER_MODE is not set, the real JWT path runs and unauthenticated
// requests receive 401. This flag makes the bypass explicit and auditable.
// =============================================================================

// Mock user injected when SINGLE_USER_MODE=true
const MOCK_USER = {
  userId: 1,
  email: "local@localhost",
  role: "admin" as const,
};

// Authenticate middleware — injects MOCK_USER when SINGLE_USER_MODE=true,
// otherwise validates JWT and returns 401 on failure.
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (process.env.SINGLE_USER_MODE === "true") {
    (request as any).user = MOCK_USER;
    return;
  }
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

// Require admin role
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (process.env.NODE_ENV !== "development") {
    const user = (request as any).user;
    if (!user || user.role !== "admin") {
      return reply.code(403).send({ error: "Admin access required" });
    }
  }
}

// Require league access — no-op in single-user mode; extend for multi-user.
export async function requireLeagueAccess(
  _request: FastifyRequest,
  _reply: FastifyReply,
) {
  // SINGLE_USER_MODE: user owns all leagues. Implement ownership check here when
  // SINGLE_USER_MODE is removed and multi-user mode is enabled.
}

// Require specific team ownership — no-op in single-user mode; extend for multi-user.
export async function requireTeamOwnership(
  _request: FastifyRequest,
  _reply: FastifyReply,
) {
  // SINGLE_USER_MODE: user owns all teams. Implement ownership check here when
  // SINGLE_USER_MODE is removed and multi-user mode is enabled.
}
