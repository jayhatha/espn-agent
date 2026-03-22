/**
 * Pre-built ESPN ASV lookup from bundled data sources.
 * Uses max(ESPN draft trend ASV, ESPN pre-draft salary) per player.
 * Eliminates need for DOM scraping to get auction values.
 */
import espnAsvValues from "../assets/espn-asv-values.json";
import espnPredraftValues from "../assets/espn-predraft-values.json";
import { normalizeName } from "./engine/normalizer";

interface AsvEntry {
  name: string;
  asv: number;
}

interface PredraftEntry {
  name: string;
  salary: number;
}

// Build the lookup once at module load time
const asvLookup: Record<string, number> = {};

// Source 1: ESPN draft trend ASV (from combined-draft-values.csv → espn-asv-values.json)
// This is what players actually go for in real drafts
for (const entry of espnAsvValues as AsvEntry[]) {
  const norm = normalizeName(entry.name);
  asvLookup[norm] = Math.max(asvLookup[norm] ?? 0, entry.asv);
}

// Source 2: ESPN pre-draft salary values (from Edit Salary Cap Draft List page)
// Take max of both — pre-draft can be higher for hyped players
for (const entry of espnPredraftValues as PredraftEntry[]) {
  const norm = normalizeName(entry.name);
  asvLookup[norm] = Math.max(asvLookup[norm] ?? 0, entry.salary);
}

/**
 * Get the pre-built ESPN ASV lookup (normalized name → dollar value).
 * Returns the same object every call (module-level singleton).
 */
export function getEspnAsvLookup(): Record<string, number> {
  return asvLookup;
}

export const espnAsvEntryCount = Object.keys(asvLookup).length;
