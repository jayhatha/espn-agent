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
  if (ratio <= 0.3) return "bg-positive/20 text-positive dark:bg-positive-dark/20 dark:text-positive-dark";
  if (ratio <= 0.5) return "bg-positive/10 text-positive dark:bg-positive-dark/10 dark:text-positive-dark";
  if (ratio <= 0.7) return "bg-warning/10 text-warning dark:bg-warning-dark/10 dark:text-warning-dark";
  return "bg-negative/20 text-negative dark:bg-negative-dark/20 dark:text-negative-dark";
}

export function CategoryStatsTable({
  categories,
  title,
  totalTeams = 10,
  showProjected = false,
}: CategoryStatsTableProps) {
  if (categories.length === 0) {
    return (
      <p className="text-body-sm text-content-secondary dark:text-shell-muted">
        No category data available for this snapshot.
      </p>
    );
  }

  return (
    <div>
      {title && (
        <h2 className="text-h4 font-semibold text-content dark:text-shell-text mb-4">{title}</h2>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
          <thead>
            <tr className="border-b-2 border-neutral-200 dark:border-shell-border">
              <th className="pb-3 pt-1 pr-4 text-caption font-semibold uppercase tracking-widest text-content-secondary dark:text-shell-muted text-left">
                Category
              </th>
              <th className="pb-3 pt-1 pr-4 text-caption font-semibold uppercase tracking-widest text-content-secondary dark:text-shell-muted text-right">
                Value
              </th>
              <th className="pb-3 pt-1 pr-4 text-caption font-semibold uppercase tracking-widest text-content-secondary dark:text-shell-muted text-center">
                Rank
              </th>
              <th className="pb-3 pt-1 pr-4 text-caption font-semibold uppercase tracking-widest text-content-secondary dark:text-shell-muted text-right">
                Roto Pts
              </th>
              {showProjected && (
                <>
                  <th className="pb-3 pt-1 pr-4 text-caption font-semibold uppercase tracking-widest text-content-secondary dark:text-shell-muted text-right">
                    Proj. Value
                  </th>
                  <th className="pb-3 pt-1 pr-4 text-caption font-semibold uppercase tracking-widest text-content-secondary dark:text-shell-muted text-center">
                    Proj. Rank
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
            {categories.map((cat) => (
              <tr key={cat.category_id || cat.name}>
                <td className="py-2.5 pr-4 whitespace-nowrap text-body-sm font-medium text-content dark:text-shell-text">
                  {cat.name}
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-data text-right text-content dark:text-shell-text">
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
                <td className="py-2.5 pr-4 whitespace-nowrap text-data font-semibold text-right text-content dark:text-shell-text">
                  {Number(cat.roto_points)}
                </td>
                {showProjected && (
                  <>
                    <td className="py-2.5 pr-4 whitespace-nowrap text-data text-right text-content-secondary dark:text-shell-muted">
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
