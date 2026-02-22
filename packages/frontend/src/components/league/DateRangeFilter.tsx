"use client";

import { useState } from "react";

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

  return (
    <div>
      <div className="flex flex-row gap-3 items-end">
        {/* From date input */}
        <div>
          <label
            htmlFor="from-date"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            From
          </label>
          <input
            id="from-date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border bg-white text-gray-900"
          />
        </div>

        {/* To date input */}
        <div>
          <label
            htmlFor="to-date"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            To
          </label>
          <input
            id="to-date"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border bg-white text-gray-900"
          />
        </div>

        {/* Apply button */}
        <button
          onClick={handleApply}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm"
        >
          Apply
        </button>

        {/* Clear button */}
        <button
          onClick={handleClear}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 text-sm"
        >
          Clear
        </button>
      </div>

      {/* Error message */}
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
    </div>
  );
}
