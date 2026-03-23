import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default:
          "bg-accent-light text-content border-transparent dark:bg-shell-border dark:text-shell-text dark:border-shell-border",
        positive:
          "bg-positive-light text-positive border-positive-border dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
        negative:
          "bg-negative-light text-negative border-negative-border dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
        warning:
          "bg-warning-light text-warning border-warning-border dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
        info:
          "bg-info-light text-info border-info-border dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}
