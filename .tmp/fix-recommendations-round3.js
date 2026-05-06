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
  `    if (freeAgents.length < 40) {\n      freeAgents = await this.mergeProjectionFallbackFreeAgents(\n        snapshot.projections_run_id,\n        roster,\n        freeAgents,\n      );\n    }\n`,
  `    freeAgents = await this.mergeProjectionFallbackFreeAgents(\n      snapshot.projections_run_id,\n      roster,\n      freeAgents,\n    );\n`,
  waiverPath,
);
fs.writeFileSync(waiverPath, waiver);

const tradePath = '/Users/jay-work/Code/espn-agent/packages/backend/src/agents/trade-recommendation.ts';
let trade = fs.readFileSync(tradePath, 'utf8');
trade = replaceOnce(
  trade,
  `          // Include if: projection value improves, fills positional need,\n          // OR we're giving up ASV (other side gets the better \"name\" — likely accepted)\n          const hasProjectedSignal = giveValue > 0 || receiveValue > 0;\n          if (\n            valueDelta > 0 ||\n            positionalContext.fillsNeed ||\n            (giveAsv != null && receiveAsv != null && giveAsv > receiveAsv) ||\n            ((giveAsv == null || receiveAsv == null) && hasProjectedSignal)\n          ) {\n`,
  `          // Keep candidate generation resilient when enrichment data is missing.\n          // Detailed impact simulation below will discard non-improving trades.\n          if (true) {\n`,
  tradePath,
);
fs.writeFileSync(tradePath, trade);
console.log('patched-round3');
