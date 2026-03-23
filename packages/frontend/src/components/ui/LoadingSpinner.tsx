"use client";

import { cn } from "@/lib/cn";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  message?: string;
  fullPage?: boolean;
}

const sizeClasses = {
  sm: "h-5 w-5 border-2",
  md: "h-8 w-8 border-2",
  lg: "h-12 w-12 border-b-2",
};

export function LoadingSpinner({
  size = "lg",
  message,
  fullPage = false,
}: LoadingSpinnerProps) {
  const spinner = (
    <div className="text-center">
      <div
        className={cn(
          "animate-spin rounded-full border-accent dark:border-shell-muted mx-auto",
          sizeClasses[size]
        )}
      />
      {message && (
        <p className="mt-4 text-content-secondary dark:text-shell-muted text-body-sm">
          {message}
        </p>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-secondary dark:bg-shell-bg">
        {spinner}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-12">{spinner}</div>
  );
}

export function LoadingSkeleton({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("animate-pulse space-y-4", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-32 bg-neutral-200 dark:bg-shell-border rounded" />
      ))}
    </div>
  );
}
