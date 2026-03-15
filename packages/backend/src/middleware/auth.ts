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
const MOCK_USER = { userId: 1, email: "local@localhost", role: "admin" as const };

// Authenticate middleware (bypassed — injects mock user)
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  // Populate request.user so downstream handlers don't crash
  (request as any).user = MOCK_USER;
}

// Require admin role (bypassed)
export async function requireAdmin(
  _request: FastifyRequest,
  _reply: FastifyReply,
) {
  // No-op: auth bypassed for single-user mode
}

// Require league access (bypassed)
export async function requireLeagueAccess(
  _request: FastifyRequest,
  _reply: FastifyReply,
) {
  // No-op: auth bypassed for single-user mode
}

// Require specific team ownership (bypassed)
export async function requireTeamOwnership(
  _request: FastifyRequest,
  _reply: FastifyReply,
) {
  // No-op: auth bypassed for single-user mode
}
