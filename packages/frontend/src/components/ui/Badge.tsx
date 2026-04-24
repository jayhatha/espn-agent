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
          "bg-positive-light text-positive border-positive-border dark:bg-positive-dark-bg/30 dark:text-positive-dark dark:border-positive-dark-border",
        negative:
          "bg-negative-light text-negative border-negative-border dark:bg-negative-dark-bg/30 dark:text-negative-dark dark:border-negative-dark-border",
        warning:
          "bg-warning-light text-warning border-warning-border dark:bg-warning-dark-bg/30 dark:text-warning-dark dark:border-warning-dark-border",
        info:
          "bg-info-light text-info border-info-border dark:bg-info-dark-bg/30 dark:text-info-dark dark:border-info-dark-border",
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
