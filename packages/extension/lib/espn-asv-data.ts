/**
 * Pre-built ESPN ASV lookup from bundled data sources.
 * Uses max(ESPN draft trend ASV, ESPN pre-draft salary) per player.
 * Eliminates need for DOM scraping to get auction values.
 */
import fangraphsAuctionValues from "../assets/fangraphs-auction-values.json";
import espnPredraftValues from "../assets/espn-predraft-values.json";
import { normalizeName } from "./engine/normalizer";

interface PredraftEntry {
  name: string;
  salary: number;
}

// Build the lookup once at module load time
const asvLookup: Record<string, number> = {};

// Source 1: FG auction values JSON has ESPN_ASV baked in via build-combined-csv
// The .dollars field is FG$, but espnAuctionValue may exist on some entries
// For now, we use pre-draft values as the primary ESPN source

// Source 2: ESPN pre-draft salary values (from Edit Salary Cap Draft List page)
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
