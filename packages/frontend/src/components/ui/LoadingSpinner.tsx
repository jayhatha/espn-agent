"use client";

import { cn } from "@/lib/cn";
import { useState, useEffect } from "react";

// Fantasy baseball-specific loading messages — nerdy, specific, fun.
// These rotate every few seconds during longer loads.
const LOADING_QUIPS = [
  "Pulling today's box scores...",
  "Checking the waiver wire...",
  "Projecting rest-of-season stats...",
  "Scanning for buy-low candidates...",
  "Calculating category gaps...",
  "Comparing roster constructions...",
  "Aggregating pitcher workloads...",
  "Running trade simulations...",
  "Checking your league's pulse...",
  "Evaluating schedule density...",
  "Mapping category trajectories...",
  "Scouting the free agent pool...",
  "Reviewing recent transactions...",
];

function useRotatingMessage(messages: string[], intervalMs = 3000) {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * messages.length)
  );
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % messages.length);
        setVisible(true);
      }, 200);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [messages.length, intervalMs]);

  return { message: messages[index], visible };
}

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  message?: string;
  fullPage?: boolean;
  quips?: boolean;
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
  quips = false,
}: LoadingSpinnerProps) {
  const rotating = useRotatingMessage(LOADING_QUIPS);
  const displayMessage = quips ? rotating.message : message;
  const isVisible = quips ? rotating.visible : true;

  const spinner = (
    <div className="text-center">
      <div
        className={cn(
          "animate-spin rounded-full border-accent dark:border-shell-muted mx-auto",
          sizeClasses[size]
        )}
      />
      {displayMessage && (
        <p
          className={cn(
            "mt-4 text-content-secondary dark:text-shell-muted text-body-sm transition-opacity duration-200",
            isVisible ? "opacity-100" : "opacity-0"
          )}
        >
          {displayMessage}
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
        <div
          key={i}
          className="h-32 bg-neutral-200 dark:bg-shell-border rounded"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}
