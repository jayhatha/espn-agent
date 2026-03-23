"use client";

import Link from "next/link";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/cn";

interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
  variant?: "error" | "warning" | "info";
  backLink?: { href: string; label: string };
  action?: { label: string; href?: string; onClick?: () => void };
}

const variantStyles = {
  error: {
    container:
      "bg-negative-light border border-negative-border dark:bg-red-900/20 dark:border-red-800",
    title: "text-negative dark:text-red-400",
    message: "text-negative dark:text-red-400",
    button:
      "text-negative hover:text-negative border-negative-border hover:bg-negative-light dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/30",
    icon: "text-negative dark:text-red-400",
    actionButton:
      "bg-negative text-white hover:bg-red-700 dark:bg-red-800 dark:hover:bg-red-700",
  },
  warning: {
    container:
      "bg-warning-light border border-warning-border dark:bg-amber-900/20 dark:border-amber-800",
    title: "text-warning dark:text-amber-400",
    message: "text-warning dark:text-amber-400",
    button:
      "text-warning hover:text-warning border-warning-border hover:bg-warning-light dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-900/30",
    icon: "text-warning dark:text-amber-400",
    actionButton:
      "bg-warning text-white hover:bg-amber-600 dark:bg-amber-800 dark:hover:bg-amber-700",
  },
  info: {
    container:
      "bg-info-light border border-info-border dark:bg-blue-900/20 dark:border-blue-800",
    title: "text-info dark:text-blue-400",
    message: "text-info dark:text-blue-400",
    button:
      "text-info hover:text-info border-info-border hover:bg-info-light dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/30",
    icon: "text-info dark:text-blue-400",
    actionButton:
      "bg-accent text-content-inverse hover:bg-accent-hover dark:bg-shell-accent dark:hover:bg-shell-accent/90",
  },
};

const variantIcons = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export function ErrorAlert({
  message,
  onRetry,
  variant = "error",
  backLink,
  action,
}: ErrorAlertProps) {
  const styles = variantStyles[variant];
  const Icon = variantIcons[variant];

  return (
    <div className={cn(styles.container, "rounded-lg p-4")}>
      <div className="flex items-start">
        <Icon
          className={cn("h-5 w-5 mt-0.5 flex-shrink-0", styles.icon)}
        />
        <div className="ml-3 flex-1">
          <h3 className={cn("text-sm font-medium", styles.title)}>
            {variant === "error"
              ? "Error"
              : variant === "warning"
                ? "Warning"
                : "Info"}
          </h3>
          <p className={cn("text-sm mt-1", styles.message)}>{message}</p>
          <div className="mt-3 flex items-center gap-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className={cn(
                  "inline-flex items-center px-3 py-1.5 border text-xs font-medium rounded",
                  styles.button
                )}
              >
                Retry
              </button>
            )}
            {action && action.href && (
              <Link
                href={action.href}
                className={cn(
                  "inline-flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors",
                  styles.actionButton
                )}
              >
                {action.label}
              </Link>
            )}
            {action && !action.href && action.onClick && (
              <button
                onClick={action.onClick}
                className={cn(
                  "inline-flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors",
                  styles.actionButton
                )}
              >
                {action.label}
              </button>
            )}
            {backLink && (
              <Link
                href={backLink.href}
                className="text-sm text-content-secondary hover:text-content dark:text-shell-muted dark:hover:text-shell-text transition-colors"
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
