"use client";

import { cn } from "@/lib/cn";

interface CategoryData {
  category_id?: string;
  name: string;
  stat_key?: string;
  type?: string;
  value: number;
  rank: number;
  roto_points: number;
  projected_value?: number;
  projected_rank?: number;
  projected_roto_points?: number | null;
}

interface CategoryStatsTableProps {
  categories: CategoryData[];
  title?: string;
  totalTeams?: number;
  showProjected?: boolean;
}

function formatStatValue(
  value: number | string,
  type?: string,
  statKey?: string,
): string {
  const num = Number(value);
  if (!isFinite(num)) return "-";
  if (
    type === "RATE" ||
    (statKey &&
      ["AVG", "OBP", "SLG", "OPS", "ERA", "WHIP"].includes(statKey))
  ) {
    return num.toFixed(3);
  }
  return Math.round(num).toString();
}

function getRankColor(rank: number, total: number): string {
  const ratio = rank / total;
  if (ratio <= 0.25) return "text-positive bg-positive-light";
  if (ratio <= 0.5) return "text-positive bg-positive-light/50";
  if (ratio <= 0.75) return "text-warning bg-warning-light";
  return "text-negative bg-negative-light";
}

export function CategoryStatsTable({
  categories,
  title,
  totalTeams = 10,
  showProjected = false,
}: CategoryStatsTableProps) {
  if (categories.length === 0) {
    return (
      <p className="text-body-sm text-content-secondary">
        No category data available for this snapshot.
      </p>
    );
  }

  return (
    <div>
      {title && (
        <h2 className="text-h4 font-semibold text-content mb-4">{title}</h2>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead>
            <tr className="border-b-2 border-neutral-200">
              <th className="pb-3 pt-1 pr-4 text-caption font-semibold uppercase tracking-widest text-content-secondary text-left">
                Category
              </th>
              <th className="pb-3 pt-1 pr-4 text-caption font-semibold uppercase tracking-widest text-content-secondary text-right">
                Value
              </th>
              <th className="pb-3 pt-1 pr-4 text-caption font-semibold uppercase tracking-widest text-content-secondary text-center">
                Rank
              </th>
              <th className="pb-3 pt-1 pr-4 text-caption font-semibold uppercase tracking-widest text-content-secondary text-right">
                Roto Pts
              </th>
              {showProjected && (
                <>
                  <th className="pb-3 pt-1 pr-4 text-caption font-semibold uppercase tracking-widest text-content-secondary text-right">
                    Proj. Value
                  </th>
                  <th className="pb-3 pt-1 pr-4 text-caption font-semibold uppercase tracking-widest text-content-secondary text-center">
                    Proj. Rank
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {categories.map((cat) => (
              <tr key={cat.category_id || cat.name}>
                <td className="py-2.5 pr-4 whitespace-nowrap text-body-sm font-medium text-content">
                  {cat.name}
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-data text-right text-content">
                  {formatStatValue(cat.value, cat.type, cat.stat_key)}
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-body-sm text-center">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                      getRankColor(cat.rank, totalTeams)
                    )}
                  >
                    #{cat.rank}
                  </span>
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-data font-semibold text-right text-content">
                  {Number(cat.roto_points)}
                </td>
                {showProjected && (
                  <>
                    <td className="py-2.5 pr-4 whitespace-nowrap text-data text-right text-content-secondary">
                      {cat.projected_value != null
                        ? formatStatValue(
                            cat.projected_value,
                            cat.type,
                            cat.stat_key,
                          )
                        : "-"}
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap text-body-sm text-center">
                      {cat.projected_rank != null ? (
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                            getRankColor(cat.projected_rank, totalTeams)
                          )}
                        >
                          #{cat.projected_rank}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { formatStatValue, getRankColor };
