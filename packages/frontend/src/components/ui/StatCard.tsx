"use client";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "neutral";
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
}

const trendColors = {
  up: "text-green-600",
  down: "text-red-600",
  neutral: "text-gray-500",
};

const trendArrows = {
  up: (
    <svg
      className="h-4 w-4 text-green-500"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 10l7-7m0 0l7 7m-7-7v18"
      />
    </svg>
  ),
  down: (
    <svg
      className="h-4 w-4 text-red-500"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 14l-7 7m0 0l-7-7m7 7V3"
      />
    </svg>
  ),
  neutral: null,
};

export function StatCard({
  label,
  value,
  trend,
  subtitle,
  icon,
  className = "",
}: StatCardProps) {
  return (
    <div className={`bg-white shadow rounded-lg p-6 ${className}`}>
      <div className="flex items-center">
        {icon && <div className="flex-shrink-0">{icon}</div>}
        <div className={icon ? "ml-4" : ""}>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <div className="flex items-center mt-1">
            <p
              className={`text-2xl font-semibold ${trend ? trendColors[trend] : "text-gray-900"}`}
            >
              {value}
            </p>
            {trend && trendArrows[trend] && (
              <span className="ml-2">{trendArrows[trend]}</span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
