import * as React from "react";
import { cn } from "@/lib/cn";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-body-sm text-content placeholder:text-content-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          "dark:bg-shell-bg dark:border-shell-border dark:text-shell-text dark:placeholder:text-shell-muted dark:focus-visible:ring-shell-accent dark:focus-visible:ring-offset-shell-panel",
          className
        )}
        {...props}
      />
    );
  }
);
