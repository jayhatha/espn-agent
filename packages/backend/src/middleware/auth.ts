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

// Authenticate middleware
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

// Require admin role
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  await authenticate(request, reply);
  if (request.user.role !== "admin") {
    return reply.code(403).send({ error: "Admin access required" });
  }
}

// Require team ownership in a league (user must have a team in this league)
// Reads leagueId from request.params.id or request.params.leagueId
export async function requireLeagueAccess(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { getDb } = await import("../db/connection.js");
  const db = getDb();

  // Extract league ID from params (supports both :id and :leagueId)
  const params = request.params as { id?: string; leagueId?: string };
  const leagueIdStr = params.id || params.leagueId;
  if (!leagueIdStr) {
    return reply.code(400).send({ error: "League ID required" });
  }
  const leagueId = parseInt(leagueIdStr, 10);

  // Check if user has a team in this league
  const userTeam = await db
    .selectFrom("team")
    .select("id")
    .where("league_id", "=", leagueId)
    .where("user_id", "=", request.user.userId)
    .executeTakeFirst();

  if (!userTeam) {
    return reply.code(403).send({ error: "Not a member of this league" });
  }
}

// Require specific team ownership
// Reads teamId from request.params.teamId
export async function requireTeamOwnership(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { getDb } = await import("../db/connection.js");
  const db = getDb();

  const params = request.params as { teamId: string };
  const teamId = parseInt(params.teamId, 10);

  const team = await db
    .selectFrom("team")
    .select("user_id")
    .where("id", "=", teamId)
    .executeTakeFirst();

  if (!team) {
    return reply.code(404).send({ error: "Team not found" });
  }

  if (team.user_id !== request.user.userId) {
    return reply.code(403).send({ error: "Not your team" });
  }
}
