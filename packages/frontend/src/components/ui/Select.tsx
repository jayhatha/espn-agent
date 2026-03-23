import * as React from "react";
import { cn } from "@/lib/cn";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "flex h-10 w-full appearance-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-sm text-content placeholder:text-content-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          "dark:bg-shell-bg dark:border-shell-border dark:text-shell-text dark:focus-visible:ring-shell-accent dark:focus-visible:ring-offset-shell-panel",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
