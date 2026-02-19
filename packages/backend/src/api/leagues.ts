import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/connection.js";
import { ESPNAdapter, type ESPNAuthCookies } from "../adapters/espn.js";
import { SnapshotOrchestratorAgent } from "../agents/snapshot-orchestrator.js";
import { encryptToken, decryptToken, hasEncryptionKey } from "../utils/encryption.js";
import { authenticate, requireLeagueAccess } from "../middleware/auth.js";

/**
 * Leagues API Routes
 * Per DESIGN_DOC.md §9
 */

interface ConnectLeagueBody {
  espnLeagueId: number;
  season: number;
  auth?: ESPNAuthCookies;
  name?: string;
  timezone?: string;
}

export async function leaguesRoutes(app: FastifyInstance) {
  const db = getDb();

  // Connect to a league
  app.post(
    "/api/leagues/connect",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: ConnectLeagueBody }>,
      reply: FastifyReply,
    ) => {
      const { espnLeagueId, season, auth, name, timezone } = request.body;

      try {
        // Check if league already exists
        let league = await db
          .selectFrom("league")
          .selectAll()
          .where("espn_league_id", "=", espnLeagueId)
          .where("season", "=", season)
          .executeTakeFirst();

        // If league exists and already has user_team_id, return early
        if (league && league.user_team_id) {
          return { league, isNew: false, userTeamDetected: true };
        }

        // Fetch league data to validate and find user's team
        const espnAdapter = new ESPNAdapter(request.log as any);
        const espnData = await espnAdapter.fetchLeague({
          leagueId: espnLeagueId,
          season,
          auth,
          views: ["mSettings", "mTeam"],
        });

        const normalized = espnAdapter.normalizeLeagueData(espnData.data);

        // Find user's team by matching SWID
        let userTeamEspnId: number | null = null;
        if (auth?.SWID) {
          const userTeam = normalized.teams.find((team) =>
            team.primaryOwner === auth.SWID ||
            (team.owners && team.owners.includes(auth.SWID))
          );
          if (userTeam) {
            userTeamEspnId = userTeam.id;
            request.log.info(
              { espnTeamId: userTeamEspnId, teamName: userTeam.name },
              "Auto-detected user's team"
            );
          } else {
            request.log.warn(
              { swid: auth.SWID },
              "Could not auto-detect user's team from SWID"
            );
          }
        }

        // If league already exists, update it with team detection
        if (league) {
          // Update teams first
          let userTeamDbId: number | null = null;
          for (const teamData of normalized.teams) {
            const team = await db
              .insertInto("team")
              .values({
                league_id: league.id,
                espn_team_id: teamData.id,
                name: teamData.name,
                created_at: new Date(),
              })
              .onConflict((oc) =>
                oc.columns(["league_id", "espn_team_id"]).doUpdateSet({
                  name: teamData.name,
                })
              )
              .returningAll()
              .executeTakeFirstOrThrow();

            if (userTeamEspnId && teamData.id === userTeamEspnId) {
              userTeamDbId = team.id;
            }
          }

          // Update league with user_team_id if detected
          if (userTeamDbId) {
            await db
              .updateTable("league")
              .set({ user_team_id: userTeamDbId })
              .where("id", "=", league.id)
              .execute();

            league = await db
              .selectFrom("league")
              .selectAll()
              .where("id", "=", league.id)
              .executeTakeFirstOrThrow();
          }

          return { league, isNew: false, userTeamDetected: userTeamDbId !== null };
        }

        // Encrypt ESPN cookies if encryption key is configured
        let espnSwidEncrypted: Buffer | null = null;
        let espnS2Encrypted: Buffer | null = null;

        if (auth?.SWID || auth?.espn_s2) {
          try {
            if (hasEncryptionKey()) {
              if (auth?.SWID) {
                espnSwidEncrypted = encryptToken(auth.SWID);
              }
              if (auth?.espn_s2) {
                espnS2Encrypted = encryptToken(auth.espn_s2);
              }
            } else {
              request.log.warn("ENCRYPTION_KEY not configured - storing ESPN cookies in plaintext (dev mode)");
            }
          } catch (error) {
            request.log.error({ error }, "Failed to encrypt ESPN cookies - storing in plaintext");
          }
        }

        // Create league
        league = await db
          .insertInto("league")
          .values({
            provider: "espn",
            espn_league_id: espnLeagueId,
            season,
            name: name || normalized.settings.name,
            timezone: timezone || "America/New_York",
            espn_swid: auth?.SWID || null,
            espn_s2: auth?.espn_s2 || null,
            espn_swid_encrypted: espnSwidEncrypted,
            espn_s2_encrypted: espnS2Encrypted,
            created_at: new Date(),
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        // Create/update teams and find user's team DB ID
        let userTeamDbId: number | null = null;
        for (const teamData of normalized.teams) {
          const team = await db
            .insertInto("team")
            .values({
              league_id: league.id,
              espn_team_id: teamData.id,
              name: teamData.name,
              created_at: new Date(),
            })
            .onConflict((oc) =>
              oc.columns(["league_id", "espn_team_id"]).doUpdateSet({
                name: teamData.name,
              })
            )
            .returningAll()
            .executeTakeFirstOrThrow();

          if (userTeamEspnId && teamData.id === userTeamEspnId) {
            userTeamDbId = team.id;
          }
        }

        // Update league with user_team_id if detected
        if (userTeamDbId) {
          await db
            .updateTable("league")
            .set({ user_team_id: userTeamDbId })
            .where("id", "=", league.id)
            .execute();

          // Refetch league with updated user_team_id
          league = await db
            .selectFrom("league")
            .selectAll()
            .where("id", "=", league.id)
            .executeTakeFirstOrThrow();
        }

        // Trigger initial snapshot for newly connected league
        try {
          request.log.info({ leagueId: league.id }, "Triggering initial snapshot for new league");
          const orchestrator = new SnapshotOrchestratorAgent(db, request.log as any);
          const today = new Date().toISOString().split("T")[0];

          // Run snapshot in background (don't await)
          orchestrator
            .executeSnapshot({
              leagueId: league.id,
              snapshotDate: today,
              espnAuth: auth,
            })
            .then(() => {
              request.log.info({ leagueId: league.id }, "Initial snapshot completed");
            })
            .catch((err) => {
              request.log.error({ error: err, leagueId: league.id }, "Initial snapshot failed");
            });
        } catch (error) {
          // Log but don't fail the connection if snapshot fails
          request.log.error({ error, leagueId: league.id }, "Failed to trigger initial snapshot");
        }

        return { league, isNew: true, userTeamDetected: userTeamDbId !== null };
      } catch (error) {
        request.log.error({ error }, "Failed to connect league");
        const errorMessage =
          error instanceof Error ? error.message : "Failed to connect to league";
        return reply
          .code(500)
          .send({ error: "Failed to connect to league", details: errorMessage });
      }
    },
  );

  // Get league status
  app.get(
    "/api/leagues/:leagueId/status",
    {
      config: {
        rateLimit: {
          max: 100,
          timeWindow: "1 minute",
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { leagueId: string } }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);

      const league = await db
        .selectFrom("league")
        .selectAll()
        .where("id", "=", leagueId)
        .executeTakeFirst();

      if (!league) {
        return reply.code(404).send({ error: "League not found" });
      }

      // Get latest snapshot
      const latestSnapshot = await db
        .selectFrom("league_daily_snapshot")
        .selectAll()
        .where("league_id", "=", leagueId)
        .orderBy("snapshot_date", "desc")
        .executeTakeFirst();

      // Get snapshot count
      const snapshotCount = await db
        .selectFrom("league_daily_snapshot")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("league_id", "=", leagueId)
        .executeTakeFirst();

      return {
        league,
        latestSnapshot,
        snapshotCount: snapshotCount?.count || 0,
      };
    },
  );

  // List leagues
  app.get(
    "/api/leagues",
    {
      config: {
        rateLimit: {
          max: 100,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
    const leagues = await db
      .selectFrom("league")
      .selectAll()
      .orderBy("created_at", "desc")
      .execute();

    return { leagues };
  });

  // Get teams in a league
  app.get(
    "/api/leagues/:leagueId/teams",
    {
      config: {
        rateLimit: {
          max: 100,
          timeWindow: "1 minute",
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { leagueId: string } }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);

      const league = await db
        .selectFrom("league")
        .selectAll()
        .where("id", "=", leagueId)
        .executeTakeFirst();

      if (!league) {
        return reply.code(404).send({ error: "League not found" });
      }

      const teams = await db
        .selectFrom("team")
        .selectAll()
        .where("league_id", "=", leagueId)
        .orderBy("name", "asc")
        .execute();

      return { teams };
    },
  );

  // Update league authentication
  app.patch(
    "/api/leagues/:leagueId/auth",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { leagueId: string };
        Body: { SWID?: string; espn_s2?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const { SWID, espn_s2 } = request.body;

      const league = await db
        .selectFrom("league")
        .selectAll()
        .where("id", "=", leagueId)
        .executeTakeFirst();

      if (!league) {
        return reply.code(404).send({ error: "League not found" });
      }

      try {
        // Encrypt ESPN cookies if encryption key is configured
        let espnSwidEncrypted: Buffer | null = null;
        let espnS2Encrypted: Buffer | null = null;

        if (SWID || espn_s2) {
          try {
            if (hasEncryptionKey()) {
              if (SWID) {
                espnSwidEncrypted = encryptToken(SWID);
              }
              if (espn_s2) {
                espnS2Encrypted = encryptToken(espn_s2);
              }
            } else {
              request.log.warn("ENCRYPTION_KEY not configured - storing ESPN cookies in plaintext (dev mode)");
            }
          } catch (error) {
            request.log.error({ error }, "Failed to encrypt ESPN cookies - storing in plaintext");
          }
        }

        const updatedLeague = await db
          .updateTable("league")
          .set({
            espn_swid: SWID || null,
            espn_s2: espn_s2 || null,
            espn_swid_encrypted: espnSwidEncrypted,
            espn_s2_encrypted: espnS2Encrypted,
          })
          .where("id", "=", leagueId)
          .returningAll()
          .executeTakeFirstOrThrow();

        return { league: updatedLeague };
      } catch (error) {
        request.log.error({ error, leagueId }, "Failed to update auth");
        return reply
          .code(500)
          .send({ error: "Failed to update authentication" });
      }
    },
  );

  // Trigger manual snapshot for a league
  app.post(
    "/api/leagues/:leagueId/snapshot",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 hour",
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { leagueId: string } }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);

      const league = await db
        .selectFrom("league")
        .selectAll()
        .where("id", "=", leagueId)
        .executeTakeFirst();

      if (!league) {
        return reply.code(404).send({ error: "League not found" });
      }

      try {
        // Import SnapshotOrchestratorAgent
        const { SnapshotOrchestratorAgent } = await import(
          "../agents/snapshot-orchestrator.js"
        );
        const orchestrator = new SnapshotOrchestratorAgent(db, request.log as any);

        const today = new Date().toISOString().split("T")[0];

        // Build auth cookies from stored credentials - prefer encrypted, fallback to plaintext
        let auth: ESPNAuthCookies | undefined;

        try {
          if (league.espn_swid_encrypted && league.espn_s2_encrypted && hasEncryptionKey()) {
            // Decrypt from encrypted columns
            auth = {
              SWID: decryptToken(league.espn_swid_encrypted),
              espn_s2: decryptToken(league.espn_s2_encrypted),
            };
          } else if (league.espn_swid && league.espn_s2) {
            // Fallback to plaintext columns
            auth = {
              SWID: league.espn_swid,
              espn_s2: league.espn_s2,
            };
          }
        } catch (error) {
          request.log.error({ error }, "Failed to decrypt ESPN cookies - falling back to plaintext");
          // Fallback to plaintext if decryption fails
          if (league.espn_swid && league.espn_s2) {
            auth = {
              SWID: league.espn_swid,
              espn_s2: league.espn_s2,
            };
          }
        }

        // Manual snapshot triggers execute directly (not via queue)
        // Queue-based deduplication in snapshot-worker.ts covers scheduled snapshots
        await orchestrator.executeSnapshot({
          leagueId,
          snapshotDate: today,
          espnAuth: auth,
          forceFresh: true,
        });

        return {
          success: true,
          message: "Snapshot created successfully",
          snapshotDate: today,
        };
      } catch (error) {
        request.log.error({ error, leagueId }, "Failed to create snapshot");
        return reply
          .code(500)
          .send({ error: "Failed to create snapshot", details: String(error) });
      }
    },
  );

  // Team overview (roster + stats + standings)
  app.get(
    "/api/leagues/:leagueId/teams/:teamId/overview",
    async (
      request: FastifyRequest<{
        Params: { leagueId: string; teamId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);

      // Resolve latest snapshot date
      const latest = await db
        .selectFrom("league_daily_snapshot")
        .select("snapshot_date")
        .where("league_id", "=", leagueId)
        .orderBy("snapshot_date", "desc")
        .executeTakeFirst();

      if (!latest) {
        return reply
          .code(404)
          .send({ error: "No snapshots found for this league" });
      }
      const targetDate = latest.snapshot_date;

      // Validate team belongs to league
      const team = await db
        .selectFrom("team")
        .selectAll()
        .where("id", "=", teamId)
        .where("league_id", "=", leagueId)
        .executeTakeFirst();

      if (!team) {
        return reply
          .code(404)
          .send({ error: "Team not found in this league" });
      }

      // Run parallel queries
      const [rosterRows, totalsRows, ranksRows, overallRow] = await Promise.all(
        [
          db
            .selectFrom("team_roster_snapshot as trs")
            .innerJoin("player as p", "p.id", "trs.player_id")
            .select([
              "trs.player_id",
              "p.name as player_name",
              "p.mlb_team",
              "p.positions",
              "trs.roster_status",
              "trs.roster_slot",
              "trs.acquisition_type",
            ])
            .where("trs.league_id", "=", leagueId)
            .where("trs.snapshot_date", "=", targetDate)
            .where("trs.team_id", "=", teamId)
            .orderBy("trs.roster_slot", "asc")
            .execute(),

          db
            .selectFrom("team_daily_category_totals")
            .selectAll()
            .where("league_id", "=", leagueId)
            .where("snapshot_date", "=", targetDate)
            .where("team_id", "=", teamId)
            .execute(),

          db
            .selectFrom("team_daily_category_ranks")
            .selectAll()
            .where("league_id", "=", leagueId)
            .where("snapshot_date", "=", targetDate)
            .where("team_id", "=", teamId)
            .execute(),

          db
            .selectFrom("team_daily_overall")
            .selectAll()
            .where("league_id", "=", leagueId)
            .where("snapshot_date", "=", targetDate)
            .where("team_id", "=", teamId)
            .executeTakeFirst(),
        ],
      );

      // Total teams count for context
      const totalTeamsResult = await db
        .selectFrom("team_daily_overall")
        .select(db.fn.countAll<number>().as("count"))
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", targetDate)
        .executeTakeFirst();

      // Category metadata from settings
      const snapshot = await db
        .selectFrom("league_daily_snapshot")
        .selectAll()
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", targetDate)
        .executeTakeFirst();

      let categoryMeta: Array<{
        category_id: string;
        name: string;
        stat_key: string;
        type: string;
        direction: string;
      }> = [];

      if (snapshot?.settings_version_id) {
        const settings = await db
          .selectFrom("league_settings_version")
          .selectAll()
          .where("id", "=", snapshot.settings_version_id)
          .executeTakeFirst();

        if (settings) {
          categoryMeta = (settings.settings_json as any).categories || [];
        }
      }

      // Merge totals + ranks
      const ranksMap = new Map(ranksRows.map((r) => [r.category_id, r]));
      const categories = totalsRows.map((t) => {
        const rank = ranksMap.get(t.category_id);
        const meta = categoryMeta.find((m) => m.category_id === t.category_id);
        return {
          category_id: t.category_id,
          name: meta?.name || t.category_id,
          stat_key: meta?.stat_key || t.category_id,
          type: meta?.type || "COUNTING",
          direction: meta?.direction || "HIGHER_BETTER",
          value: t.value,
          rank: rank?.rank ?? 0,
          roto_points: rank?.roto_points ?? 0,
        };
      });

      return {
        snapshotDate: targetDate,
        team: { id: team.id, name: team.name },
        overall: overallRow
          ? {
              overall_points: overallRow.overall_points,
              overall_rank: overallRow.overall_rank,
              total_teams: Number(totalTeamsResult?.count || 0),
            }
          : null,
        categories,
        roster: rosterRows,
      };
    },
  );

}
