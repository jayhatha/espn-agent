"use client";

import { useTheme } from "next-themes";
import { CHART_THEME, CHART_THEME_DARK } from "./chart-theme";

export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? CHART_THEME_DARK : CHART_THEME;
}
