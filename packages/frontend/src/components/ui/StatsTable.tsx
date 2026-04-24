"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/cn";

export interface StatsTableColumn {
  key: string;
  label: React.ReactNode;
  align?: "left" | "right" | "center";
  format?: (value: any, row: Record<string, any>) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  sticky?: boolean;
}

interface StatsTableProps {
  columns: StatsTableColumn[];
  data: Record<string, any>[];
  sortable?: boolean;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  rowKey?: string | ((row: Record<string, any>, index: number) => string);
  highlightRow?: (row: Record<string, any>) => boolean;
  highlightClassName?: string;
  emptyMessage?: string;
  compact?: boolean;
  stickyHeader?: boolean;
}

const alignClasses = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function StatsTable({
  columns,
  data,
  sortable = false,
  defaultSortKey,
  defaultSortDir = "asc",
  rowKey = "id",
  highlightRow,
  highlightClassName = "bg-accent-light dark:bg-shell-accent/20",
  emptyMessage = "No data available",
  compact = false,
  stickyHeader = false,
}: StatsTableProps) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);

  const handleSort = useCallback(
    (key: string) => {
      if (!sortable) return;
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortable, sortKey],
  );

  const sortedData = sortKey
    ? [...data].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const cmp =
          typeof aVal === "number" && typeof bVal === "number"
            ? aVal - bVal
            : String(aVal).localeCompare(String(bVal));
        return sortDir === "asc" ? cmp : -cmp;
      })
    : data;

  const getRowKey = (row: Record<string, any>, index: number): string => {
    if (typeof rowKey === "function") return rowKey(row, index);
    return String(row[rowKey] ?? index);
  };

  const py = compact ? "py-2" : "py-3";
  const px = compact ? "px-3" : "px-4";

  if (data.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-body-sm text-content-secondary dark:text-shell-muted">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto dark:bg-shell-panel dark:border dark:border-shell-border dark:rounded-card">
      <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
        <thead
          className={cn(
            "bg-surface-secondary dark:bg-shell-bg",
            stickyHeader ? "sticky top-0 z-10" : ""
          )}
        >
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  px,
                  py,
                  "text-body-sm font-medium text-content-secondary uppercase tracking-wider",
                  "dark:text-shell-muted",
                  alignClasses[col.align || "left"],
                  col.headerClassName || "",
                  col.sticky
                    ? "sticky left-0 bg-surface-secondary dark:bg-shell-bg z-10"
                    : "",
                  sortable && col.sortable !== false
                    ? "cursor-pointer hover:bg-surface-tertiary dark:hover:bg-shell-panel select-none"
                    : ""
                )}
                aria-sort={
                  sortable && sortKey === col.key
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : sortable && col.sortable !== false
                      ? "none"
                      : undefined
                }
                tabIndex={sortable && col.sortable !== false ? 0 : undefined}
                role={sortable && col.sortable !== false ? "button" : undefined}
                onClick={() =>
                  sortable && col.sortable !== false && handleSort(col.key)
                }
                onKeyDown={
                  sortable && col.sortable !== false
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSort(col.key);
                        }
                      }
                    : undefined
                }
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortable && sortKey === col.key && (
                    <span className="text-accent dark:text-shell-accent">
                      {sortDir === "asc" ? "\u2191" : "\u2193"}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-neutral-100 dark:bg-shell-panel dark:divide-shell-border">
          {sortedData.map((row, rowIdx) => {
            const isHighlighted = highlightRow?.(row);
            return (
              <tr
                key={getRowKey(row, rowIdx)}
                className={cn(
                  "hover:bg-surface-secondary dark:hover:bg-shell-bg transition-colors",
                  isHighlighted ? highlightClassName : ""
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      px,
                      py,
                      "whitespace-nowrap text-body-sm text-content font-mono",
                      "dark:text-shell-text",
                      alignClasses[col.align || "left"],
                      col.className || "",
                      col.sticky
                        ? "sticky left-0 bg-inherit z-10"
                        : ""
                    )}
                  >
                    {col.format
                      ? col.format(row[col.key], row)
                      : (row[col.key] ?? "-")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
