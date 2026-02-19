"use client";

import { useState, useCallback } from "react";

export interface StatsTableColumn {
  key: string;
  label: string;
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
  highlightClassName = "bg-blue-50",
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
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className={`bg-gray-50 ${stickyHeader ? "sticky top-0 z-10" : ""}`}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${px} ${py} text-xs font-medium text-gray-500 uppercase tracking-wider ${
                  alignClasses[col.align || "left"]
                } ${col.headerClassName || ""} ${
                  col.sticky ? "sticky left-0 bg-gray-50 z-10" : ""
                } ${sortable && col.sortable !== false ? "cursor-pointer hover:bg-gray-100 select-none" : ""}`}
                onClick={() =>
                  sortable && col.sortable !== false && handleSort(col.key)
                }
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortable && sortKey === col.key && (
                    <span className="text-blue-600">
                      {sortDir === "asc" ? "\u2191" : "\u2193"}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedData.map((row, rowIdx) => {
            const isHighlighted = highlightRow?.(row);
            return (
              <tr
                key={getRowKey(row, rowIdx)}
                className={isHighlighted ? highlightClassName : ""}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`${px} ${py} whitespace-nowrap text-sm ${
                      alignClasses[col.align || "left"]
                    } ${col.className || ""} ${
                      col.sticky ? "sticky left-0 bg-inherit z-10" : ""
                    }`}
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
