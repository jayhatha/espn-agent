import type { StatComponents } from "../../../../shared/dist/index.js";

/**
 * Resolve ESPN `valuesByStat` into the stat components required for a rate formula.
 *
 * Single source of truth for ESPN stat ID → component key mapping.
 * IP is derived from OUTS (ESPN stat ID 34) ÷ 3.
 *
 * Returns null for counting stats or unknown formulaIds where component
 * math does not apply.
 *
 * ESPN stat IDs used here:
 *   0 = AB, 1 = H, 8 = TB, 10 = BB, 12 = HBP, 13 = SF
 *   34 = OUTS (÷3 → IP), 37 = HA, 39 = BBA, 45 = ER, 48 = K
 */
export function resolveStatComponents(
  formulaId: string,
  statValues: Record<number, number>,
): StatComponents | null {
  const ip = (statValues[34] ?? 0) / 3;
  switch (formulaId) {
    case "avg":
      return { H: statValues[1] ?? 0, AB: statValues[0] ?? 0 };
    case "obp":
      return {
        H: statValues[1] ?? 0,
        BB: statValues[10] ?? 0,
        HBP: statValues[12] ?? 0,
        AB: statValues[0] ?? 0,
        SF: statValues[13] ?? 0,
      };
    case "slg":
      return { TB: statValues[8] ?? 0, AB: statValues[0] ?? 0 };
    case "ops":
      return {
        H: statValues[1] ?? 0,
        BB: statValues[10] ?? 0,
        HBP: statValues[12] ?? 0,
        AB: statValues[0] ?? 0,
        SF: statValues[13] ?? 0,
        TB: statValues[8] ?? 0,
      };
    case "era":
      return { ER: statValues[45] ?? 0, IP: ip };
    case "whip":
      return { HA: statValues[37] ?? 0, BBA: statValues[39] ?? 0, IP: ip };
    case "k9":
      return { K: statValues[48] ?? 0, IP: ip };
    default:
      return null;
  }
}
