const fs = require('fs');

function replaceOnce(content, from, to, file) {
  if (!content.includes(from)) {
    throw new Error(`Pattern not found in ${file}`);
  }
  return content.replace(from, to);
}

const recsPath = '/Users/jay-work/Code/espn-agent/packages/backend/src/api/recommendations.ts';
let recs = fs.readFileSync(recsPath, 'utf8');

recs = replaceOnce(
  recs,
  `  const tradeView = new TradeView(db);\n`,
  `  const tradeView = new TradeView(db);\n\n  const getLeagueEspnContext = async (leagueId: number) => {\n    const league = await db\n      .selectFrom(\"league\")\n      .select([\n        \"id\",\n        \"espn_league_id\",\n        \"season\",\n        \"espn_swid_encrypted\",\n        \"espn_s2_encrypted\",\n      ])\n      .where(\"id\", \"=\", leagueId)\n      .executeTakeFirst();\n\n    if (!league) {\n      return null;\n    }\n\n    let espnAuth: ESPNAuthCookies | undefined = getEspnAuthFromEnv();\n    if (!espnAuth && league.espn_swid_encrypted && league.espn_s2_encrypted) {\n      if (hasEncryptionKey()) {\n        try {\n          espnAuth = {\n            SWID: decryptToken(league.espn_swid_encrypted as any),\n            espn_s2: decryptToken(league.espn_s2_encrypted as any),\n          };\n        } catch (error) {\n          app.log.error({ error, leagueId }, \"Failed to decrypt ESPN cookies\");\n        }\n      }\n    }\n\n    return { league, espnAuth };\n  };\n`,
  recsPath,
);

recs = replaceOnce(
  recs,
  `      // Fetch league credentials (encrypted in DB)\n      const league = await db\n        .selectFrom(\"league\")\n        .select([\n          \"id\",\n          \"espn_league_id\",\n          \"season\",\n          \"espn_swid_encrypted\",\n          \"espn_s2_encrypted\",\n        ])\n        .where(\"id\", \"=\", leagueId)\n        .executeTakeFirst();\n\n      if (!league) {\n        return reply.code(404).send({ error: \"League not found\" });\n      }\n\n      // Build auth: env vars first, then encrypted DB fallback\n      let espnAuth: ESPNAuthCookies | undefined = getEspnAuthFromEnv();\n      if (!espnAuth && league.espn_swid_encrypted && league.espn_s2_encrypted) {\n        if (hasEncryptionKey()) {\n          try {\n            espnAuth = {\n              SWID: decryptToken(league.espn_swid_encrypted as any),\n              espn_s2: decryptToken(league.espn_s2_encrypted as any),\n            };\n          } catch (error) {\n            request.log.error(\n              { error },\n              \"Failed to decrypt ESPN cookies for free agents\",\n            );\n          }\n        }\n      }\n`,
  `      const context = await getLeagueEspnContext(leagueId);\n      if (!context) {\n        return reply.code(404).send({ error: \"League not found\" });\n      }\n      const { league, espnAuth } = context;\n`,
  recsPath,
);

recs = replaceOnce(
  recs,
  `      try {\n        const recommendations = await waiverAgent.getRecommendations(\n          leagueId,\n          teamId,\n          date,\n          {\n            maxRecommendations: maxRecommendations\n              ? parseInt(maxRecommendations, 10)\n              : 10,\n          },\n        );\n`,
  `      try {\n        let freeAgentPlayerIds: number[] | undefined;\n\n        const snapshotFreeAgents = await db\n          .selectFrom(\"league_free_agent_snapshot\")\n          .select(\"player_id\")\n          .where(\"league_id\", \"=\", leagueId)\n          .where(\"snapshot_date\", \"=\", date)\n          .execute();\n\n        if (snapshotFreeAgents.length === 0) {\n          const context = await getLeagueEspnContext(leagueId);\n          if (context) {\n            try {\n              const liveFreeAgents = await espnAdapter.fetchFreeAgents({\n                leagueId: context.league.espn_league_id,\n                season: context.league.season,\n                auth: context.espnAuth,\n                limit: 300,\n              });\n              freeAgentPlayerIds = liveFreeAgents.map((player) => player.playerId);\n            } catch (error) {\n              request.log.warn(\n                { error, leagueId, snapshotDate: date },\n                \"Failed to fetch live ESPN free agents for waiver fallback\",\n              );\n            }\n          }\n        }\n\n        const recommendations = await waiverAgent.getRecommendations(\n          leagueId,\n          teamId,\n          date,\n          {\n            maxRecommendations: maxRecommendations\n              ? parseInt(maxRecommendations, 10)\n              : 10,\n            freeAgentPlayerIds,\n          },\n        );\n`,
  recsPath,
);

fs.writeFileSync(recsPath, recs);

const tradePath = '/Users/jay-work/Code/espn-agent/packages/backend/src/agents/trade-recommendation.ts';
let trade = fs.readFileSync(tradePath, 'utf8');

trade = replaceOnce(
  trade,
  `      for (const givePlayer of userRoster) {\n        // Skip players with no trade value — $0 players are untradeable\n        const giveAsv = givePlayer.espn_asv != null ? Number(givePlayer.espn_asv) : 0;\n        if (giveAsv < 1) continue;\n\n        const giveValue = getPlayerValue(givePlayer.player_id);\n\n        for (const receivePlayer of partnerRoster) {\n          const receiveAsv = receivePlayer.espn_asv != null ? Number(receivePlayer.espn_asv) : 0;\n\n          // Skip untradeable receive targets too\n          if (receiveAsv < 1) continue;\n\n          // ASV realism: the other manager must see this as reasonable.\n          // Rule: the cheaper player must be worth at least 80% of the expensive player.\n          // Examples: $18 for $22 = 82% → OK. $10 for $25 = 40% → blocked. $20 for $24 = 83% → OK.\n          const cheaperAsv = Math.min(giveAsv, receiveAsv);\n          const expensiveAsv = Math.max(giveAsv, receiveAsv);\n          if (expensiveAsv > 0 && cheaperAsv / expensiveAsv < 0.80) {\n            continue; // Too lopsided — won't be accepted\n          }\n`,
  `      for (const givePlayer of userRoster) {\n        const giveAsv =\n          givePlayer.espn_asv != null ? Number(givePlayer.espn_asv) : null;\n\n        const giveValue = getPlayerValue(givePlayer.player_id);\n\n        for (const receivePlayer of partnerRoster) {\n          const receiveAsv =\n            receivePlayer.espn_asv != null\n              ? Number(receivePlayer.espn_asv)\n              : null;\n\n          // Treat ASV as optional signal. Only exclude players explicitly marked\n          // as $0 when we actually have ASV data for them.\n          if (giveAsv != null && giveAsv < 1) continue;\n          if (receiveAsv != null && receiveAsv < 1) continue;\n\n          // ASV realism: the other manager must see this as reasonable.\n          // Rule: the cheaper player must be worth at least 80% of the expensive player.\n          // Examples: $18 for $22 = 82% → OK. $10 for $25 = 40% → blocked. $20 for $24 = 83% → OK.\n          if (giveAsv != null && receiveAsv != null) {\n            const cheaperAsv = Math.min(giveAsv, receiveAsv);\n            const expensiveAsv = Math.max(giveAsv, receiveAsv);\n            if (expensiveAsv > 0 && cheaperAsv / expensiveAsv < 0.80) {\n              continue; // Too lopsided — won't be accepted\n            }\n          }\n`,
  tradePath,
);

trade = replaceOnce(
  trade,
  `          // Include if: projection value improves, fills positional need,\n          // OR we're giving up ASV (other side gets the better \"name\" — likely accepted)\n          if (valueDelta > 0 || positionalContext.fillsNeed || giveAsv > receiveAsv) {\n`,
  `          // Include if: projection value improves, fills positional need,\n          // OR we're giving up ASV (other side gets the better \"name\" — likely accepted)\n          if (\n            valueDelta > 0 ||\n            positionalContext.fillsNeed ||\n            (giveAsv != null && receiveAsv != null && giveAsv > receiveAsv)\n          ) {\n`,
  tradePath,
);

trade = replaceOnce(
  trade,
  `          if (impact.deltaOverallPoints > 0.5) {\n            const giveAsvVal = givePlayer.espn_asv != null ? Number(givePlayer.espn_asv) : 1;\n            const receiveAsvVal = receivePlayer.espn_asv != null ? Number(receivePlayer.espn_asv) : 1;\n            const asvNote = giveAsvVal > receiveAsvVal\n              ? \` You overpay on ASV ($\${Math.round(giveAsvVal)} → $\${Math.round(receiveAsvVal)}) but gain roto points.\`\n              : giveAsvVal === receiveAsvVal\n                ? \` Even ASV ($\${Math.round(giveAsvVal)}).\`\n                : \` You get more ASV ($\${Math.round(receiveAsvVal)} vs $\${Math.round(giveAsvVal)}).\`;\n`,
  `          if (impact.deltaOverallPoints > 0.5) {\n            const giveAsvVal =\n              givePlayer.espn_asv != null ? Number(givePlayer.espn_asv) : null;\n            const receiveAsvVal =\n              receivePlayer.espn_asv != null\n                ? Number(receivePlayer.espn_asv)\n                : null;\n            const asvNote =\n              giveAsvVal == null || receiveAsvVal == null\n                ? \"\"\n                : giveAsvVal > receiveAsvVal\n                  ? \` You overpay on ASV ($\${Math.round(giveAsvVal)} → $\${Math.round(receiveAsvVal)}) but gain roto points.\`\n                  : giveAsvVal === receiveAsvVal\n                    ? \` Even ASV ($\${Math.round(giveAsvVal)}).\`\n                    : \` You get more ASV ($\${Math.round(receiveAsvVal)} vs $\${Math.round(giveAsvVal)}).\`;\n`,
  tradePath,
);

fs.writeFileSync(tradePath, trade);
console.log('patched');
