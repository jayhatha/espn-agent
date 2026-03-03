"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/cn";
import { CHART_THEME } from "@/lib/chart-theme";

interface CategoryMiniChartProps {
  data: Array<{ date: string; rank: number }>;
  height?: number;
  teamColor?: string;
  label?: string;
  className?: string;
}

export function CategoryMiniChart({
  data,
  height = 120,
  teamColor = CHART_THEME.colors[0],
  label,
  className,
}: CategoryMiniChartProps) {
  if (data.length === 0) {
    return (
      <div className={cn("text-center py-4 text-body-sm text-content-tertiary", className)}>
        No trend data available
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      {label && (
        <h4 className="text-body-sm font-medium text-content mb-1">{label}</h4>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray={CHART_THEME.grid.strokeDasharray}
            stroke={CHART_THEME.grid.stroke}
            opacity={0.3}
          />
          <XAxis
            dataKey="date"
            hide
            tick={false}
            axisLine={{ stroke: CHART_THEME.grid.stroke }}
          />
          <YAxis
            reversed
            domain={[1, "dataMax"]}
            tick={CHART_THEME.axis.tick}
            axisLine={{ stroke: CHART_THEME.grid.stroke }}
            tickLine={{ stroke: CHART_THEME.grid.stroke }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: CHART_THEME.tooltip.backgroundColor,
              border: `1px solid ${CHART_THEME.tooltip.borderColor}`,
              borderRadius: `${CHART_THEME.tooltip.borderRadius}px`,
              padding: "8px 12px",
            }}
            labelFormatter={(date) =>
              new Date(date).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            }
            formatter={(value: any) => [`Rank ${value}`, ""]}
          />
          <Line
            type="monotone"
            dataKey="rank"
            stroke={teamColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
