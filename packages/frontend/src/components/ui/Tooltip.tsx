"use client";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  return (
    <span className="relative group/tooltip inline-flex">
      <span className="underline decoration-dotted decoration-content-tertiary dark:decoration-shell-muted cursor-help">
        {children}
      </span>
      <span
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5
          hidden group-hover/tooltip:block
          bg-content text-content-inverse text-caption px-3 py-1.5 rounded-md
          dark:bg-shell-bg dark:text-shell-text dark:border dark:border-shell-border
          whitespace-normal max-w-[240px] w-max z-50 pointer-events-none shadow-card
          text-center leading-snug"
        role="tooltip"
      >
        {content}
      </span>
    </span>
  );
}
