"use client";

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
        className={`animate-spin rounded-full border-blue-600 mx-auto ${sizeClasses[size]}`}
      />
      {message && <p className="mt-4 text-gray-600 text-sm">{message}</p>}
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
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
    <div className={`animate-pulse space-y-4 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-32 bg-gray-200 rounded" />
      ))}
    </div>
  );
}
