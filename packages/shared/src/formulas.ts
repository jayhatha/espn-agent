import type { StatComponents } from "./types.js";

/**
 * Component-based formulas for rate statistics
 * Per DESIGN_DOC.md §5.3
 */

export function calculateAVG(components: StatComponents): number {
  const { AB = 0, H = 0 } = components;
  if (AB === 0) return 0;
  return H / AB;
}

export function calculateOBP(components: StatComponents): number {
  const { AB = 0, H = 0, BB = 0, HBP = 0, SF = 0 } = components;
  const denominator = AB + BB + HBP + SF;
  if (denominator === 0) return 0;
  return (H + BB + HBP) / denominator;
}

export function calculateSLG(components: StatComponents): number {
  const { AB = 0, TB = 0 } = components;
  if (AB === 0) return 0;
  return TB / AB;
}

export function calculateOPS(components: StatComponents): number {
  return calculateOBP(components) + calculateSLG(components);
}

export function calculateERA(components: StatComponents): number {
  const { IP = 0, ER = 0 } = components;
  if (IP === 0) return 0;
  return (9 * ER) / IP;
}

export function calculateWHIP(components: StatComponents): number {
  const { IP = 0, H = 0, BB = 0 } = components;
  if (IP === 0) return 0;
  return (H + BB) / IP;
}

export function calculateK9(components: StatComponents): number {
  const { IP = 0, K = 0 } = components;
  if (IP === 0) return 0;
  return (9 * K) / IP;
}

/**
 * Combine current-to-date and projected components
 */
export function combineComponents(
  current: StatComponents,
  projected: StatComponents,
): StatComponents {
  const result: StatComponents = {};
  const allKeys = new Set([...Object.keys(current), ...Object.keys(projected)]);

  for (const key of allKeys) {
    result[key] = (current[key] ?? 0) + (projected[key] ?? 0);
  }

  return result;
}

/**
 * Calculate final rate stat from combined components
 */
export function calculateFinalRate(
  formulaId: string,
  currentComponents: StatComponents,
  projectedComponents: StatComponents,
): number {
  const combined = combineComponents(currentComponents, projectedComponents);

  switch (formulaId) {
    case "avg":
      return calculateAVG(combined);
    case "obp":
      return calculateOBP(combined);
    case "slg":
      return calculateSLG(combined);
    case "ops":
      return calculateOPS(combined);
    case "era":
      return calculateERA(combined);
    case "whip":
      return calculateWHIP(combined);
    case "k9":
      return calculateK9(combined);
    default:
      throw new Error(`Unknown formula: ${formulaId}`);
  }
}

/**
 * Get required components for a formula
 */
export function getRequiredComponents(formulaId: string): string[] {
  switch (formulaId) {
    case "avg":
      return ["AB", "H"];
    case "obp":
      return ["AB", "H", "BB", "HBP", "SF"];
    case "slg":
      return ["AB", "TB"];
    case "ops":
      return ["AB", "H", "BB", "HBP", "SF", "TB"];
    case "era":
      return ["IP", "ER"];
    case "whip":
      return ["IP", "H", "BB"];
    case "k9":
      return ["IP", "K"];
    default:
      return [];
  }
}
