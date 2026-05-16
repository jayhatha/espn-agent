/**
 * Standalone slot eligibility check.
 * Extracted from TradeRecommendationAgent.canFillSlot() for reuse
 * in the projection allocation pipeline.
 */

/**
 * Slot processing tiers — most constrained first.
 * Used by both the greedy lineup allocator and trade roster validation
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
export const OVERFLOW_SLOT_TYPES = new Set(["UTIL"]);
export const BENCH_SLOT_TYPES = new Set(["BN", "BE", "IL"]);

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
  // UTIL, BN, IL, DH accept any position
  if (
    slotType === "UTIL" ||
    slotType === "BN" ||
    slotType === "IL" ||
    slotType === "DH"
  ) {
    return true;
  }
  // P slot accepts SP or RP
  if (slotType === "P") {
    return playerPositions.some((pos) => pos === "SP" || pos === "RP");
  }
  // MI (middle infield) accepts 2B or SS
  if (slotType === "MI") {
    return playerPositions.some((pos) => pos === "2B" || pos === "SS");
  }
  // CI (corner infield) accepts 1B or 3B
  if (slotType === "CI") {
    return playerPositions.some((pos) => pos === "1B" || pos === "3B");
  }
  // OF slot accepts LF, CF, RF, and generic OF
  if (slotType === "OF") {
    return playerPositions.some(
      (pos) => pos === "OF" || pos === "LF" || pos === "CF" || pos === "RF",
    );
  }
  // Specific slots require exact position match
  return playerPositions.includes(slotType);
}
