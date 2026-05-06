import { readFileSync, writeFileSync } from 'node:fs';

const filePath = '/Users/jay-work/Code/espn-agent/.planning/debug/authoritative-pool-still-thin.md';
let file = readFileSync(filePath, 'utf8');

file = file.replace('status: investigating', 'status: resolved');
file = file.replace('next_action: "gather initial evidence"', 'next_action: "RESOLVED — route now prefers live ESPN free agents before snapshot fallback."');

const evidenceAnchor = '## Eliminated\n';
const newEvidence = `- timestamp: 2026-05-05T00:02Z\n  finding: "The waiver recommendations route only fetched live ESPN free agents when league_free_agent_snapshot returned zero rows. Any thin-but-nonzero snapshot short-circuited the live authoritative fetch and was passed straight into WaiverRecommendationAgent."\n\n- timestamp: 2026-05-05T00:03Z\n  finding: "packages/backend/src/api/views/free-agent-view.ts already proves the codebase has a live authoritative ESPN free-agent source for this league. The empty recommendation response is caused by route selection logic, not by the absence of an authoritative source."\n\n`;

if (!file.includes(newEvidence.trim())) {
  file = file.replace(evidenceAnchor, `${newEvidence}${evidenceAnchor}`);
}

if (!file.includes('## Resolution')) {
  file += `\n\n## Resolution\n\nroot_cause: "The waiver recommendations route preferred league_free_agent_snapshot whenever it was non-empty, and only fetched live ESPN free agents when the stored snapshot count was exactly zero. After the earlier snapshot write fix, a thin authoritative snapshot could still bypass the fuller live pool, leaving too few eligible add candidates and returning an empty recommendations list."\nfix: "Updated the waiver recommendations route to fetch live authoritative ESPN free agents on every request when league auth is available, then fall back to league_free_agent_snapshot only if the live fetch fails or returns empty. This keeps recommendations anchored to authoritative data while avoiding starvation from stale or undersized snapshot rows."\nfiles_changed:\n\n- packages/backend/src/api/recommendations.ts\n`;
}

writeFileSync(filePath, file);
