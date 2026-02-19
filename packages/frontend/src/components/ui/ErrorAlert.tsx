"use client";

import Link from "next/link";

interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
  variant?: "error" | "warning" | "info";
  backLink?: { href: string; label: string };
}

const variantStyles = {
  error: {
    container: "bg-red-50 border border-red-200",
    title: "text-red-800",
    message: "text-red-600",
    button: "text-red-600 hover:text-red-700 border-red-300 hover:bg-red-100",
    icon: "text-red-400",
  },
  warning: {
    container: "bg-yellow-50 border border-yellow-200",
    title: "text-yellow-800",
    message: "text-yellow-700",
    button:
      "text-yellow-600 hover:text-yellow-700 border-yellow-300 hover:bg-yellow-100",
    icon: "text-yellow-400",
  },
  info: {
    container: "bg-blue-50 border border-blue-200",
    title: "text-blue-800",
    message: "text-blue-700",
    button:
      "text-blue-600 hover:text-blue-700 border-blue-300 hover:bg-blue-100",
    icon: "text-blue-400",
  },
};

export function ErrorAlert({
  message,
  onRetry,
  variant = "error",
  backLink,
}: ErrorAlertProps) {
  const styles = variantStyles[variant];

  return (
    <div className={`${styles.container} rounded-lg p-4`}>
      <div className="flex items-start">
        <svg
          className={`h-5 w-5 ${styles.icon} mt-0.5 flex-shrink-0`}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          {variant === "error" ? (
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          ) : variant === "warning" ? (
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          ) : (
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          )}
        </svg>
        <div className="ml-3 flex-1">
          <h3 className={`text-sm font-medium ${styles.title}`}>
            {variant === "error"
              ? "Error"
              : variant === "warning"
                ? "Warning"
                : "Info"}
          </h3>
          <p className={`text-sm mt-1 ${styles.message}`}>{message}</p>
          <div className="mt-3 flex items-center gap-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className={`inline-flex items-center px-3 py-1.5 border text-xs font-medium rounded ${styles.button}`}
              >
                Retry
              </button>
            )}
            {backLink && (
              <Link
                href={backLink.href}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {backLink.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
