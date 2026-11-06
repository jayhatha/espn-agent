/**
 * Standalone slot eligibility check.
 * Extracted from TradeRecommendationAgent.canFillSlot() for reuse
 * in the projection allocation pipeline.
 */

/**
 * Slot processing tiers — most constrained first.
 * Used by both lineup allocation and trade roster validation
 * to ensure consistent slot assignment ordering.
 */
export const SPECIFIC_SLOT_TYPES = new Set([
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
  "OF",
  "SP",
  "RP",
]);
export const FLEX_SLOT_TYPES = new Set(["MI", "CI", "P", "DH"]);
export const OVERFLOW_SLOT_TYPES = new Set(["IF", "UTIL"]);
export const BENCH_SLOT_TYPES = new Set(["BN", "BE", "IL"]);

export function canonicalSlotName(slotType: string): string {
  const normalized = slotType.toUpperCase();
  if (normalized === "BE") return "BN";
  if (normalized === "IL10" || normalized === "IL15" || normalized === "IL60") {
    return "IL";
  }
  return normalized;
}

/**
 * Order slot types from most-constrained to least-constrained.
 * Specific → Flex → Overflow → Bench.
 * Filters to only slot types present in the provided set of keys.
 */
export function orderSlotsByConstraint(slotKeys: string[]): string[] {
  const specific = slotKeys.filter((s) => SPECIFIC_SLOT_TYPES.has(s));
  const flex = slotKeys.filter((s) => FLEX_SLOT_TYPES.has(s));
  const overflow = slotKeys.filter((s) => OVERFLOW_SLOT_TYPES.has(s));
  const bench = slotKeys.filter((s) => BENCH_SLOT_TYPES.has(s));
  return [...specific, ...flex, ...overflow, ...bench];
}

export function canFillSlot(
  playerPositions: string[],
  slotType: string,
): boolean {
  const slot = canonicalSlotName(slotType);
  const positions = playerPositions.map((position) => position.toUpperCase());
  const isPitcher = positions.some(
    (position) => position === "SP" || position === "RP" || position === "P",
  );

  if (slot === "BN" || slot === "IL" || slot === "NA") {
    return true;
  }
  if (slot === "UTIL" || slot === "DH") {
    return positions.length > 0 && !isPitcher;
  }
  if (slot === "P") {
    return isPitcher;
  }
  if (slot === "MI") {
    return positions.some((position) => position === "2B" || position === "SS");
  }
  if (slot === "CI") {
    return positions.some((position) => position === "1B" || position === "3B");
  }
  if (slot === "IF") {
    return positions.some(
      (position) =>
        position === "1B" ||
        position === "2B" ||
        position === "3B" ||
        position === "SS",
    );
  }
  if (slot === "OF") {
    return positions.some(
      (position) =>
        position === "OF" ||
        position === "LF" ||
        position === "CF" ||
        position === "RF",
    );
  }
  return positions.includes(slot);
}
