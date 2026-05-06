/**
 * Canonical player name normalization for cross-source matching.
 *
 * Algorithm:
 * - NFD decomposition strips diacritics (e.g. "Sánchez" → "Sanchez")
 * - Lowercase and remove non-alpha characters for fuzzy key comparison
 *
 * Used by adapters (pitcherlist, advanced-stats) and agents (sit-start-advisor)
 * so matching logic has a single home.
 */
export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}
