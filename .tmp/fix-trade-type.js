const fs = require('fs');
const path = '/Users/jay-work/Code/espn-agent/packages/backend/src/agents/trade-recommendation.ts';
let content = fs.readFileSync(path, 'utf8');
const from = '              likelihood: this.assessTradeLikelihood(impact.fairnessScore, giveAsvVal, receiveAsvVal),\n';
const to = '              likelihood: this.assessTradeLikelihood(impact.fairnessScore, giveAsvVal ?? undefined, receiveAsvVal ?? undefined),\n';
if (!content.includes(from)) throw new Error('pattern not found');
content = content.replace(from, to);
fs.writeFileSync(path, content);
console.log('patched-trade-type');
