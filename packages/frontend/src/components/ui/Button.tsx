import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-content-inverse hover:bg-accent-hover focus-visible:ring-accent dark:bg-shell-accent dark:hover:bg-shell-accent/90 dark:text-white dark:focus-visible:ring-shell-accent",
        secondary:
          "border border-neutral-300 bg-white text-content hover:bg-surface-secondary focus-visible:ring-accent dark:border-shell-border dark:bg-shell-panel dark:text-shell-text dark:hover:bg-shell-bg dark:focus-visible:ring-shell-accent",
        ghost:
          "text-content-secondary hover:bg-accent-light hover:text-content focus-visible:ring-accent dark:text-shell-muted dark:hover:text-shell-text dark:hover:bg-shell-panel dark:focus-visible:ring-shell-accent",
        danger:
          "bg-negative text-white hover:bg-red-700 focus-visible:ring-negative",
      },
      size: {
        sm: "h-8 px-3 text-sm rounded-md",
        md: "h-10 px-4 text-sm rounded-lg",
        lg: "h-12 px-6 text-base rounded-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  variant,
  size,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  );
}
