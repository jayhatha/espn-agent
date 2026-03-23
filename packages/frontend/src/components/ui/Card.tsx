import { cn } from "@/lib/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-neutral-200 bg-white shadow-card",
        "dark:border-shell-border dark:bg-shell-panel dark:shadow-none",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function CardHeader({ children, className, ...props }: CardSectionProps) {
  return (
    <div
      className={cn(
        "px-6 py-4 border-b border-neutral-100",
        "dark:border-shell-border",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardContent({ children, className, ...props }: CardSectionProps) {
  return (
    <div className={cn("px-6 py-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className, ...props }: CardSectionProps) {
  return (
    <div
      className={cn(
        "px-6 py-4 border-t border-neutral-100",
        "dark:border-shell-border",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
