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

interface CategoryMiniChartProps {
  data: Array<{ date: string; rank: number }>;
  height?: number;
  teamColor?: string;
  label?: string;
}

export function CategoryMiniChart({
  data,
  height = 120,
  teamColor = "#3b82f6",
  label,
}: CategoryMiniChartProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-gray-500">
        No trend data available
      </div>
    );
  }

  return (
    <div>
      {label && (
        <h4 className="text-sm font-medium text-gray-700 mb-1">{label}</h4>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="date"
            hide
            tick={false}
            axisLine={{ stroke: "#e5e7eb" }}
          />
          <YAxis
            reversed
            domain={[1, "dataMax"]}
            tick={{ fontSize: 11 }}
            axisLine={{ stroke: "#e5e7eb" }}
            tickLine={{ stroke: "#e5e7eb" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
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
