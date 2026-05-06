const fs = require('fs');

function replaceOnce(content, from, to, file) {
  if (!content.includes(from)) {
    throw new Error(`Pattern not found in ${file}`);
  }
  return content.replace(from, to);
}

const waiverPath = '/Users/jay-work/Code/espn-agent/packages/backend/src/agents/waiver-recommendation.ts';
let waiver = fs.readFileSync(waiverPath, 'utf8');

waiver = replaceOnce(
  waiver,
  `    if (!snapshot || !snapshot.projections_run_id) {\n      this.logger?.warn(\n        { leagueId, snapshotDate },\n        \"No snapshot or projections run found\",\n      );\n      return [];\n    }\n\n    const settings = await this.db\n`,
  `    if (!snapshot || !snapshot.projections_run_id) {\n      this.logger?.warn(\n        { leagueId, snapshotDate },\n        \"No snapshot or projections run found\",\n      );\n      return [];\n    }\n\n    if (freeAgents.length < 40) {\n      freeAgents = await this.mergeProjectionFallbackFreeAgents(\n        snapshot.projections_run_id,\n        roster,\n        freeAgents,\n      );\n    }\n\n    const settings = await this.db\n`,
  waiverPath,
);

waiver = replaceOnce(
  waiver,
  `  /**\n   * Simulate a swap using pre-fetched data (no DB queries).\n   * All invariant data is fetched once in getRecommendations and passed in.\n   */\n  private simulateSwapFromCache(\n`,
  `  private async mergeProjectionFallbackFreeAgents(\n    projectionsRunId: number,\n    roster: Array<{ player_id: number }>,\n    freeAgents: number[],\n  ): Promise<number[]> {\n    const rosteredSet = new Set(roster.map((player) => player.player_id));\n    const topProjections = await this.db\n      .selectFrom(\"player_projection\")\n      .select([\"player_id\", \"stat_components_json\"])\n      .where(\"projections_run_id\", \"=\", projectionsRunId)\n      .execute();\n\n    const scoredPlayers = topProjections\n      .filter((player) => !rosteredSet.has(player.player_id))\n      .map((player) => {\n        const stats = player.stat_components_json as StatComponents;\n        const score =\n          (stats.HR || 0) +\n          (stats.RBI || 0) +\n          (stats.R || 0) +\n          (stats.SB || 0) +\n          (stats.W || 0) +\n          (stats.SV || 0) +\n          (stats.K || 0) * 0.1 +\n          (stats.HLD || 0);\n        return { playerId: player.player_id, score };\n      })\n      .sort((a, b) => b.score - a.score)\n      .slice(0, 50);\n\n    const merged = new Set(freeAgents);\n    for (const player of scoredPlayers) {\n      merged.add(player.playerId);\n    }\n\n    return Array.from(merged);\n  }\n\n  /**\n   * Simulate a swap using pre-fetched data (no DB queries).\n   * All invariant data is fetched once in getRecommendations and passed in.\n   */\n  private simulateSwapFromCache(\n`,
  waiverPath,
);

fs.writeFileSync(waiverPath, waiver);

const tradePath = '/Users/jay-work/Code/espn-agent/packages/backend/src/agents/trade-recommendation.ts';
let trade = fs.readFileSync(tradePath, 'utf8');

trade = replaceOnce(
  trade,
  `          // Include if: projection value improves, fills positional need,\n          // OR we're giving up ASV (other side gets the better \"name\" — likely accepted)\n          if (\n            valueDelta > 0 ||\n            positionalContext.fillsNeed ||\n            (giveAsv != null && receiveAsv != null && giveAsv > receiveAsv)\n          ) {\n`,
  `          // Include if: projection value improves, fills positional need,\n          // OR we're giving up ASV (other side gets the better \"name\" — likely accepted)\n          const hasProjectedSignal = giveValue > 0 || receiveValue > 0;\n          if (\n            valueDelta > 0 ||\n            positionalContext.fillsNeed ||\n            (giveAsv != null && receiveAsv != null && giveAsv > receiveAsv) ||\n            ((giveAsv == null || receiveAsv == null) && hasProjectedSignal)\n          ) {\n`,
  tradePath,
);

fs.writeFileSync(tradePath, trade);
console.log('patched-round2');
