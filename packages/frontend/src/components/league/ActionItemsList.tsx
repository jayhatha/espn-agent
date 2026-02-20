"use client";

import Link from "next/link";

export interface ActionItem {
  id: string;
  type: "waiver" | "trade";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  impact: string; // e.g., "+2.5 pts"
  espnLink?: string;
  internalLink?: string;
}

export interface ActionItemsListProps {
  items: ActionItem[];
  maxItems?: number; // default 5
}

export function ActionItemsList({
  items,
  maxItems = 5,
}: ActionItemsListProps) {
  const displayItems = items.slice(0, maxItems);
  const remainingCount = Math.max(0, items.length - maxItems);

  const getPriorityColor = (priority: "high" | "medium" | "low") => {
    switch (priority) {
      case "high":
        return "border-l-4 border-l-red-500 bg-red-50";
      case "medium":
        return "border-l-4 border-l-yellow-500 bg-yellow-50";
      case "low":
        return "border-l-4 border-l-green-500 bg-green-50";
    }
  };

  const getImpactColor = (impact: string) => {
    if (impact.startsWith("+")) {
      return "text-green-600";
    } else if (impact.startsWith("-")) {
      return "text-red-600";
    }
    return "text-gray-500";
  };

  const getTypeBadgeColor = (type: "waiver" | "trade") => {
    return type === "waiver"
      ? "bg-blue-100 text-blue-800"
      : "bg-purple-100 text-purple-800";
  };

  if (items.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <svg
            className="w-12 h-12 text-yellow-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No Recommended Actions
        </h3>
        <p className="text-sm text-gray-600">
          No recommended actions at this time. Your team is performing well!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayItems.map((item) => (
        <div
          key={item.id}
          className={`${getPriorityColor(item.priority)} rounded-lg p-4 border border-gray-200 transition-shadow hover:shadow-md`}
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            {/* Left side: Type badge, title, description, and impact */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${getTypeBadgeColor(item.type)}`}
                >
                  {item.type}
                </span>
                <span
                  className={`text-sm font-semibold ${getImpactColor(item.impact)}`}
                >
                  {item.impact}
                </span>
              </div>
              <h4 className="text-base font-bold text-gray-900 mb-1">
                {item.title}
              </h4>
              <p className="text-sm text-gray-600">{item.description}</p>
            </div>

            {/* Right side: Action buttons */}
            <div className="flex flex-row sm:flex-col gap-2 sm:items-end">
              {item.internalLink && (
                <Link
                  href={item.internalLink}
                  className="px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors text-center whitespace-nowrap"
                >
                  Analyze
                </Link>
              )}
              {item.espnLink && (
                <a
                  href={item.espnLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  ESPN
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              )}
            </div>
          </div>
        </div>
      ))}

      {remainingCount > 0 && (
        <div className="text-center py-2">
          <p className="text-sm text-gray-500">
            and {remainingCount} more recommendation{remainingCount > 1 ? "s" : ""}...
          </p>
        </div>
      )}
    </div>
  );
}
