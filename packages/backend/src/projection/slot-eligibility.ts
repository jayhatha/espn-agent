/**
 * Standalone slot eligibility check.
 * Extracted from TradeRecommendationAgent.canFillSlot() for reuse
 * in the projection allocation pipeline.
 */
export function canFillSlot(playerPositions: string[], slotType: string): boolean {
  // UTIL, BN, IL, DH accept any position
  if (slotType === "UTIL" || slotType === "BN" || slotType === "IL" || slotType === "DH") {
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
    return playerPositions.some((pos) => pos === "OF" || pos === "LF" || pos === "CF" || pos === "RF");
  }
  // Specific slots require exact position match
  return playerPositions.includes(slotType);
}
