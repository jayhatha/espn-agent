"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

interface DateRangeFilterProps {
  onRangeChange: (from: string | undefined, to: string | undefined) => void;
  initialFrom?: string;
  initialTo?: string;
}

export function DateRangeFilter({
  onRangeChange,
  initialFrom,
  initialTo,
}: DateRangeFilterProps) {
  const [fromDate, setFromDate] = useState(initialFrom || "");
  const [toDate, setToDate] = useState(initialTo || "");
  const [error, setError] = useState("");

  const handleApply = () => {
    // Validate date range
    if (fromDate && toDate && fromDate > toDate) {
      setError("From date must be before To date");
      return;
    }

    setError("");
    onRangeChange(fromDate || undefined, toDate || undefined);
  };

  const handleClear = () => {
    setFromDate("");
    setToDate("");
    setError("");
    onRangeChange(undefined, undefined);
  };

  const inputClass = cn(
    "block rounded-lg border border-neutral-300 bg-white text-content",
    "dark:bg-shell-bg dark:border-shell-border dark:text-shell-text",
    "text-body-sm px-3 py-2",
    "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
    "dark:focus:ring-shell-accent",
    "transition-colors"
  );

  return (
    <div>
      <div className="flex flex-row gap-3 items-end">
        {/* From date input */}
        <div>
          <label
            htmlFor="from-date"
            className="block text-body-sm font-medium text-content-secondary dark:text-shell-muted mb-1"
          >
            From
          </label>
          <input
            id="from-date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* To date input */}
        <div>
          <label
            htmlFor="to-date"
            className="block text-body-sm font-medium text-content-secondary dark:text-shell-muted mb-1"
          >
            To
          </label>
          <input
            id="to-date"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Apply button */}
        <Button
          variant="primary"
          size="sm"
          onClick={handleApply}
        >
          Apply
        </Button>

        {/* Clear button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleClear}
        >
          Clear
        </Button>
      </div>

      {/* Error message */}
      {error && <div role="alert" className="mt-2 text-body-sm text-negative">{error}</div>}
    </div>
  );
}
