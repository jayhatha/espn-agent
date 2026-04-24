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
import { useChartTheme } from "@/lib/useChartTheme";

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
  teamColor,
  label,
  className,
}: CategoryMiniChartProps) {
  const chartTheme = useChartTheme();
  const resolvedTeamColor = teamColor ?? chartTheme.colors[0];
  if (data.length === 0) {
    return (
      <div className={cn("text-center py-4 text-body-sm text-content-tertiary dark:text-shell-muted", className)}>
        No trend data available
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      {label && (
        <h4 className="text-body-sm font-medium text-content dark:text-shell-text mb-1">{label}</h4>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray={chartTheme.grid.strokeDasharray}
            stroke={chartTheme.grid.stroke}
            opacity={0.3}
          />
          <XAxis
            dataKey="date"
            hide
            tick={false}
            axisLine={{ stroke: chartTheme.grid.stroke }}
          />
          <YAxis
            reversed
            domain={[1, "dataMax"]}
            tick={chartTheme.axis.tick}
            axisLine={{ stroke: chartTheme.grid.stroke }}
            tickLine={{ stroke: chartTheme.grid.stroke }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: chartTheme.tooltip.backgroundColor,
              border: `1px solid ${chartTheme.tooltip.borderColor}`,
              borderRadius: `${chartTheme.tooltip.borderRadius}px`,
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
            stroke={resolvedTeamColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
