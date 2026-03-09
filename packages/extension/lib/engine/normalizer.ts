/**
 * Canonical player name normalizer for the entire extension.
 * Uses NFKD decomposition + strip all non-alphanumeric for maximal fuzzy matching.
 * This is the ONLY normalization function -- do not create local alternatives.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
