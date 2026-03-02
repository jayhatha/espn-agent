// Recharts theme aligned with design tokens
// Use CHART_THEME.colors for series colors, grid, axis, and tooltip styling

export const CHART_THEME = {
  colors: [
    "#111827", // neutral-900 (primary series)
    "#6b7280", // neutral-500
    "#d1d5db", // neutral-300
    "#059669", // positive
    "#dc2626", // negative
    "#2563eb", // info
  ],
  grid: {
    stroke: "#e5e7eb",       // neutral-200
    strokeDasharray: "3 3",
  },
  axis: {
    tick: { fill: "#6b7280", fontSize: 12 },  // neutral-500
    label: { fill: "#374151", fontSize: 12 }, // neutral-700
  },
  tooltip: {
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
    borderRadius: 8,
  },
};
