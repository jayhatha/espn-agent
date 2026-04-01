// Recharts theme aligned with design tokens
// Use CHART_THEME for light mode, CHART_THEME_DARK for dark mode

export const CHART_THEME = {
  colors: [
    "#111827", // content (primary series)
    "#6b7280", // content-tertiary
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
    tick: { fill: "#6b7280", fontSize: 12 },  // content-tertiary
    label: { fill: "#374151", fontSize: 12 }, // neutral-700
  },
  tooltip: {
    backgroundColor: "#ffffff",  // surface
    borderColor: "#e5e7eb",      // neutral-200
    borderRadius: 8,
  },
};

export const CHART_THEME_DARK = {
  colors: [
    "#E2E8F0", // shell-text (primary series)
    "#94A3B8", // shell-muted
    "#F59E0B", // amber (replaces #1D2128 shell-border — was invisible on dark backgrounds)
    "#34d399", // positive-dark
    "#f87171", // negative-dark
    "#60a5fa", // info-dark
  ],
  grid: {
    stroke: "#1D2128",       // shell-border
    strokeDasharray: "3 3",
  },
  axis: {
    tick: { fill: "#94A3B8", fontSize: 12 },  // shell-muted
    label: { fill: "#E2E8F0", fontSize: 12 }, // shell-text
  },
  tooltip: {
    backgroundColor: "#111318",  // shell-panel
    borderColor: "#1D2128",      // shell-border
    borderRadius: 8,
  },
};
