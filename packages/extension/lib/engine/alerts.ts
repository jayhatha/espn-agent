import type {
  InflationSignal,
  EnhancedScarcitySignal,
  CategoryGapSignal,
  BudgetCurveSignal,
  DraftAlert,
} from "./types";

export function generateAlerts(
  inflation: InflationSignal,
  scarcity: EnhancedScarcitySignal[],
  categoryGaps: CategoryGapSignal[],
  budget: BudgetCurveSignal,
): DraftAlert[] {
  const alerts: DraftAlert[] = [];
  const now = Date.now();

  // Inflation alert: severity = (factor - 1) / 0.5 per research
  if (inflation.confidence === "high" && inflation.inflationFactor > 1.0) {
    const severity = Math.min(1.0, (inflation.inflationFactor - 1.0) / 0.5);
    if (severity > 0.65) {
      alerts.push({
        id: "inflation",
        type: "inflation",
        severity,
        title: `Market inflated ${inflation.percentOverMarket}%`,
        detail: `Players costing ${inflation.percentOverMarket}% above projected value. Adjust bids upward.`,
        timestamp: now,
      });
    }
  }

  // Scarcity alerts: severity = scarcityIndex (already 0-1)
  for (const s of scarcity) {
    if (s.scarcityIndex > 0.65) {
      alerts.push({
        id: `scarcity-${s.position}`,
        type: "scarcity",
        severity: s.scarcityIndex,
        title: `${s.position} scarcity critical`,
        detail: `${s.supply} elite left, ${s.demand} teams need. Drop: ${s.tierDropValue.toFixed(0)} VBD.`,
        position: s.position,
        timestamp: now,
      });
    }
  }

  // Category gap alerts: severity from categoryRiskScore (already 0-1)
  for (const g of categoryGaps) {
    if (g.categoryRiskScore > 0.65) {
      alerts.push({
        id: `cat-${g.category}`,
        type: "category_gap",
        severity: g.categoryRiskScore,
        title: `${g.category} deficit`,
        detail: `${Math.abs(g.gapZScore).toFixed(1)} std dev ${g.gapZScore < 0 ? "below" : "above"} league avg`,
        category: g.category,
        timestamp: now,
      });
    }
  }

  // Budget alert: severity = abs(1 - budgetPressure) clamped to 1.0
  const budgetSeverity = Math.min(1.0, Math.abs(1.0 - budget.budgetPressure));
  if (budgetSeverity > 0.65) {
    const direction = budget.budgetPressure > 1.0 ? "over" : "under";
    alerts.push({
      id: "budget",
      type: "budget",
      severity: budgetSeverity,
      title: `Budget ${budget.pacingStatus}`,
      detail: `${Math.round(Math.abs(1 - budget.budgetPressure) * 100)}% ${direction} optimal pace. Avg $${budget.averageRemainingPerPlayer}/player remaining.`,
      timestamp: now,
    });
  }

  // Tier break alerts: from scarcity signals where tier drop is large
  for (const s of scarcity) {
    const tierBreakSeverity = Math.min(1.0, s.tierDropValue / 30.0);
    if (tierBreakSeverity > 0.65 && s.myTeamNeeds) {
      alerts.push({
        id: `tier-break-${s.position}`,
        type: "tier_break",
        severity: tierBreakSeverity,
        title: `${s.position} tier break imminent`,
        detail: `${s.tierDropValue.toFixed(0)} VBD drop to next tier. Act now if you need ${s.position}.`,
        position: s.position,
        timestamp: now,
      });
    }
  }

  // Sort by severity descending
  return alerts.sort((a, b) => b.severity - a.severity);
}
