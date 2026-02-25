import type { DraftRanking, AuctionValue } from "@espn-fantasy/shared";

export interface ValueIndicator {
  value: number; // Delta value (positive = good, negative = bad)
  label: string; // Display text
  color: "red" | "yellow" | "green"; // Per user constraint
  severity: "steal" | "value" | "fair" | "reach" | "overpay";
}

/**
 * Calculate snake draft value based on VBD rank vs ADP
 * User constraint: 10+ ADP positions better = steal, 10+ worse = reach
 */
export function calculateSnakeDraftValue(
  player: DraftRanking,
  vbdRank: number,
  adp: number | null,
): ValueIndicator {
  // If no ADP data, show fair value (yellow)
  if (!adp || !Number.isFinite(adp)) {
    return {
      value: 0,
      label: "No ADP data",
      color: "yellow",
      severity: "fair",
    };
  }

  // Validate VBD rank
  if (!vbdRank || vbdRank === 0 || !Number.isFinite(vbdRank)) {
    return {
      value: 0,
      label: "Unranked",
      color: "yellow",
      severity: "fair",
    };
  }

  // Delta = ADP - VBD rank
  // Positive delta = ADP higher than VBD (player available later = good value)
  // Negative delta = ADP lower than VBD (player drafted earlier = reach)
  const delta = adp - vbdRank;

  // User constraint thresholds: 10+ picks
  if (delta >= 20) {
    return {
      value: delta,
      label: `${delta}-pick steal`,
      color: "green",
      severity: "steal",
    };
  } else if (delta >= 10) {
    return {
      value: delta,
      label: `${delta}-pick value`,
      color: "green",
      severity: "value",
    };
  } else if (delta > -10) {
    return {
      value: delta,
      label: "Fair value",
      color: "yellow",
      severity: "fair",
    };
  } else if (delta > -20) {
    return {
      value: delta,
      label: `${Math.abs(delta)}-pick reach`,
      color: "red",
      severity: "reach",
    };
  } else {
    return {
      value: delta,
      label: `${Math.abs(delta)}-pick overpay`,
      color: "red",
      severity: "overpay",
    };
  }
}

/**
 * Calculate auction value based on VBD dollar value vs actual price
 * User constraint: 15%+ discount = steal, 15%+ overpay = reach
 */
export function calculateAuctionValue(
  player: AuctionValue,
  actualPrice: number | null,
): ValueIndicator {
  // If no actual price (not drafted yet), show projected value
  if (!actualPrice || !Number.isFinite(actualPrice) || actualPrice === 0) {
    return {
      value: 0,
      label: `$${player.dollarValue} projected`,
      color: "yellow",
      severity: "fair",
    };
  }

  const vbdPrice = player.dollarValue;

  // Prevent division by zero
  if (vbdPrice === 0) {
    return {
      value: 0,
      label: "Min bid player",
      color: "yellow",
      severity: "fair",
    };
  }

  // Calculate percentage discount (positive = good value)
  const pctDiscount = ((vbdPrice - actualPrice) / vbdPrice) * 100;

  // User constraint thresholds: 15%+
  if (pctDiscount >= 30) {
    return {
      value: pctDiscount,
      label: `${Math.round(pctDiscount)}% steal`,
      color: "green",
      severity: "steal",
    };
  } else if (pctDiscount >= 15) {
    return {
      value: pctDiscount,
      label: `${Math.round(pctDiscount)}% value`,
      color: "green",
      severity: "value",
    };
  } else if (pctDiscount > -15) {
    return {
      value: pctDiscount,
      label: "Fair value",
      color: "yellow",
      severity: "fair",
    };
  } else if (pctDiscount > -30) {
    return {
      value: pctDiscount,
      label: `${Math.abs(Math.round(pctDiscount))}% reach`,
      color: "red",
      severity: "reach",
    };
  } else {
    return {
      value: pctDiscount,
      label: `${Math.abs(Math.round(pctDiscount))}% overpay`,
      color: "red",
      severity: "overpay",
    };
  }
}

/**
 * Get Tailwind classes for value indicator color
 */
export function getValueColorClasses(color: ValueIndicator["color"]): {
  bg: string;
  text: string;
  border: string;
} {
  switch (color) {
    case "green":
      return {
        bg: "bg-green-100",
        text: "text-green-800",
        border: "border-green-300",
      };
    case "yellow":
      return {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
        border: "border-yellow-300",
      };
    case "red":
      return {
        bg: "bg-red-100",
        text: "text-red-800",
        border: "border-red-300",
      };
  }
}
