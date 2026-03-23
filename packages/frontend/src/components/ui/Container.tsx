import { cn } from "@/lib/cn";

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  size?: "default" | "narrow" | "wide";
}

export function Container({
  children,
  className,
  size = "default",
  ...props
}: ContainerProps) {
  const sizeClasses = {
    default: "max-w-content",
    narrow: "max-w-content-narrow",
    wide: "max-w-content-wide",
  };

  return (
    <div
      className={cn(
        // Layout: max-width + 16px horizontal padding (SHELL-07: p-4 base padding)
        "mx-auto px-4 sm:px-6 lg:px-8",
        // Dark mode: inherit text color from shell body (dark:text-shell-text set on body)
        "dark:text-inherit",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
