interface ProjectionDriver {
  playerName: string;
  delta: number;
}

interface CategoryAttribution {
  category_id: string;
  categoryName: string;
  prevProjectedValue: number;
  currProjectedValue: number;
  prevRotoPoints: number;
  currRotoPoints: number;
  rotoDelta: number;
  bucket: "actual_performance" | "projection_change" | "competitor_movement" | "mixed";
  topDriverPlayer?: string;
  projectionDrivers?: ProjectionDriver[];
  topCompetitorMoved?: string;
}

export interface SwingAttributionResult {
  snapshotDate: string;
  previousSnapshotDate: string | null;
  attribution_available: boolean;
  teamId: number;
  teamName: string;
  totalDelta: number;
  buckets: {
    actual_performance: number;
    projection_change: number;
    competitor_movement: number;
  } | null;
  categoryBreakdown: CategoryAttribution[];
}

interface SwingAttributionPanelProps {
  data: SwingAttributionResult;
  previousSnapshotDate: string | null;
}

function formatDelta(val: number): string {
  return (val > 0 ? "+" : "") + val.toFixed(1);
}

function bucketLabel(bucket: CategoryAttribution["bucket"]): string {
  switch (bucket) {
    case "actual_performance": return "Performance";
    case "projection_change": return "Proj. Update";
    case "competitor_movement": return "Competitor";
    case "mixed": return "Mixed";
  }
}

function deltaColorClass(val: number): string {
  if (val > 0) return "text-positive";
  if (val < 0) return "text-negative";
  return "text-content-tertiary dark:text-shell-muted";
}

function BucketRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded dark:bg-shell-bg bg-surface-secondary">
      <span className="text-body-sm text-content-secondary dark:text-shell-muted">{label}</span>
      <span className={`font-mono text-data font-medium ${deltaColorClass(value)}`}>
        {formatDelta(value)} pts
      </span>
    </div>
  );
}

export function SwingAttributionPanel({
  data,
  previousSnapshotDate,
}: SwingAttributionPanelProps) {
  const prevDateLabel = previousSnapshotDate
    ? new Date(previousSnapshotDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  // Filter and sort category breakdown: only rows where |rotoDelta| > 0, sorted by abs desc, max 8
  const breakdownRows = data.categoryBreakdown
    .filter((cat) => Math.abs(cat.rotoDelta) > 0)
    .sort((a, b) => Math.abs(b.rotoDelta) - Math.abs(a.rotoDelta))
    .slice(0, 8);

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="font-medium text-body-sm text-content dark:text-shell-text">
          What Changed?
        </span>
        {data.totalDelta === 0 ? (
          <span className="text-body-sm text-content-tertiary dark:text-shell-muted">
            No significant change
          </span>
        ) : (
          <span className={`text-body-sm font-medium ${deltaColorClass(data.totalDelta)}`}>
            {formatDelta(data.totalDelta)} pts
            {prevDateLabel && (
              <span className="ml-1 font-normal text-content-tertiary dark:text-shell-muted">
                since {prevDateLabel}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Three bucket bars */}
      {data.buckets !== null && (
        <div className="space-y-1.5">
          <BucketRow label="Actual Performance" value={data.buckets.actual_performance} />
          <BucketRow label="Projection Change" value={data.buckets.projection_change} />
          <BucketRow label="Competitor Movement" value={data.buckets.competitor_movement} />
        </div>
      )}

      {/* Category breakdown table */}
      {breakdownRows.length > 0 && (
        <div>
          <div className="mb-1.5 text-caption font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
            By Category
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-shell-border">
                  <th className="py-1.5 px-2 text-left text-caption font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                    Category
                  </th>
                  <th className="py-1.5 px-2 text-right text-caption font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                    Delta
                  </th>
                  <th className="py-1.5 px-2 text-left text-caption font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider">
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
                {breakdownRows.map((cat) => (
                  <tr key={cat.category_id} className="hover:bg-surface-secondary dark:hover:bg-shell-bg transition-colors">
                    <td className="py-2 px-2 text-body-sm text-content dark:text-shell-text">
                      {cat.categoryName}
                    </td>
                    <td className={`py-2 px-2 text-right font-mono text-data font-medium ${deltaColorClass(cat.rotoDelta)}`}>
                      {formatDelta(cat.rotoDelta)}
                    </td>
                    <td className="py-2 px-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-caption font-medium dark:bg-shell-bg bg-surface-secondary text-content-secondary dark:text-shell-muted">
                            {bucketLabel(cat.bucket)}
                          </span>
                          {cat.bucket === "competitor_movement" && cat.topCompetitorMoved && (
                            <span className="text-caption text-content-tertiary dark:text-shell-muted truncate max-w-[120px]">
                              {cat.topCompetitorMoved}
                            </span>
                          )}
                        </div>
                        {cat.projectionDrivers && cat.projectionDrivers.length > 0 && (
                          <div className="flex flex-col gap-0.5 pl-0.5">
                            {cat.projectionDrivers.map((d) => (
                              <span key={d.playerName} className="text-caption text-content-tertiary dark:text-shell-muted">
                                <span className="truncate">{d.playerName}</span>
                                {" "}
                                <span className={`font-mono ${d.delta > 0 ? "text-positive" : "text-negative"}`}>
                                  {d.delta > 0 ? "+" : ""}{d.delta}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default SwingAttributionPanel;
