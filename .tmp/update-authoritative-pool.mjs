import { readFileSync, writeFileSync } from 'node:fs';

const filePath = '/Users/jay-work/Code/espn-agent/packages/backend/src/api/recommendations.ts';
const file = readFileSync(filePath, 'utf8');
const oldBlock = `      try {
        let freeAgentPlayerIds: number[] | undefined;

        const snapshotFreeAgents = await db
          .selectFrom("league_free_agent_snapshot")
          .select("player_id")
          .where("league_id", "=", leagueId)
          .where("snapshot_date", "=", date)
          .execute();

        if (snapshotFreeAgents.length === 0) {
          const context = await getLeagueEspnContext(leagueId);
          if (context) {
            try {
              const liveFreeAgents = await espnAdapter.fetchFreeAgents({
                leagueId: context.league.espn_league_id,
                season: context.league.season,
                auth: context.espnAuth,
                limit: 300,
              });
              freeAgentPlayerIds = liveFreeAgents.map((player) => player.playerId);
            } catch (error) {
              request.log.warn(
                { error, leagueId, snapshotDate: date },
                "Failed to fetch live ESPN free agents for waiver fallback",
              );
            }
          }
        }
`;
const newBlock = `      try {
        let freeAgentPlayerIds: number[] | undefined;

        const context = await getLeagueEspnContext(leagueId);
        if (context) {
          try {
            const liveFreeAgents = await espnAdapter.fetchFreeAgents({
              leagueId: context.league.espn_league_id,
              season: context.league.season,
              auth: context.espnAuth,
              limit: 300,
            });
            if (liveFreeAgents.length > 0) {
              freeAgentPlayerIds = liveFreeAgents.map((player) => player.playerId);
            }
          } catch (error) {
            request.log.warn(
              { error, leagueId, snapshotDate: date },
              "Failed to fetch live ESPN free agents for waiver recommendations",
            );
          }
        }

        if (!freeAgentPlayerIds || freeAgentPlayerIds.length === 0) {
          const snapshotFreeAgents = await db
            .selectFrom("league_free_agent_snapshot")
            .select("player_id")
            .where("league_id", "=", leagueId)
            .where("snapshot_date", "=", date)
            .execute();

          if (snapshotFreeAgents.length > 0) {
            freeAgentPlayerIds = snapshotFreeAgents.map((player) => player.player_id);
          }
        }
`;

if (!file.includes(oldBlock)) {
  console.error('Target block not found');
  process.exit(1);
}

writeFileSync(filePath, file.replace(oldBlock, newBlock));
