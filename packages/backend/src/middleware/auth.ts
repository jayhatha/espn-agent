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
// AUTH BYPASSED: Single-user mode (v4.0)
// All middleware functions are no-ops. Auth code preserved for future multi-user.
// =============================================================================

// Mock user for single-user mode — routes reference request.user.userId / request.user.role
const MOCK_USER = {
  userId: 1,
  email: "local@localhost",
  role: "admin" as const,
};

// Authenticate middleware — no-op in single-user mode (v4.0)
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  (request as any).user = MOCK_USER;
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

// Require league access (bypassed — single-user tool owns all leagues)
export async function requireLeagueAccess(
  _request: FastifyRequest,
  _reply: FastifyReply,
) {
  // Single-user: user owns all leagues. Extend here if multi-user is added.
}

// Require specific team ownership (bypassed — single-user tool owns all teams)
export async function requireTeamOwnership(
  _request: FastifyRequest,
  _reply: FastifyReply,
) {
  // Single-user: user owns all teams. Extend here if multi-user is added.
}
