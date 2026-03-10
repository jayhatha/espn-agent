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
    container: "bg-negative-light border border-negative-border",
    title: "text-negative",
    message: "text-negative",
    button:
      "text-negative hover:text-negative border-negative-border hover:bg-negative-light",
    icon: "text-negative",
    actionButton:
      "bg-negative text-white hover:bg-red-700",
  },
  warning: {
    container: "bg-warning-light border border-warning-border",
    title: "text-warning",
    message: "text-warning",
    button:
      "text-warning hover:text-warning border-warning-border hover:bg-warning-light",
    icon: "text-warning",
    actionButton:
      "bg-warning text-white hover:bg-amber-600",
  },
  info: {
    container: "bg-info-light border border-info-border",
    title: "text-info",
    message: "text-info",
    button: "text-info hover:text-info border-info-border hover:bg-info-light",
    icon: "text-info",
    actionButton:
      "bg-accent text-content-inverse hover:bg-accent-hover",
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
                className="text-sm text-content-secondary hover:text-content transition-colors"
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
