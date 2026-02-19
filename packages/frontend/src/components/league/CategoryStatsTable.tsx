"use client";

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
  if (ratio <= 0.25) return "text-green-700 bg-green-50";
  if (ratio <= 0.5) return "text-green-600 bg-green-50/50";
  if (ratio <= 0.75) return "text-yellow-700 bg-yellow-50";
  return "text-red-700 bg-red-50";
}

export function CategoryStatsTable({
  categories,
  title,
  totalTeams = 10,
  showProjected = false,
}: CategoryStatsTableProps) {
  if (categories.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No category data available for this snapshot.
      </p>
    );
  }

  return (
    <div>
      {title && (
        <h2 className="text-lg font-medium text-gray-900 mb-4">{title}</h2>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rank
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Roto Pts
              </th>
              {showProjected && (
                <>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Proj. Value
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Proj. Rank
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {categories.map((cat) => (
              <tr key={cat.category_id || cat.name}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                  {cat.name}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                  {formatStatValue(cat.value, cat.type, cat.stat_key)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getRankColor(cat.rank, totalTeams)}`}
                  >
                    #{cat.rank}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                  {Number(cat.roto_points)}
                </td>
                {showProjected && (
                  <>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                      {cat.projected_value != null
                        ? formatStatValue(
                            cat.projected_value,
                            cat.type,
                            cat.stat_key,
                          )
                        : "-"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                      {cat.projected_rank != null ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getRankColor(cat.projected_rank, totalTeams)}`}
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
