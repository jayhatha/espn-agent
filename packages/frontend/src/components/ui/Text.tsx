import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const textVariants = cva("", {
  variants: {
    size: {
      lg: "text-body-lg",
      base: "text-body",
      sm: "text-body-sm",
      caption: "text-caption",
      data: "text-data",
    },
    color: {
      default: "text-content dark:text-shell-text",
      secondary: "text-content-secondary dark:text-shell-muted",
      tertiary: "text-content-tertiary dark:text-shell-muted",
    },
  },
  defaultVariants: {
    size: "base",
    color: "default",
  },
});

type TextVariants = VariantProps<typeof textVariants>;
type TextTag = "p" | "span" | "div";

interface TextProps extends Omit<React.HTMLAttributes<HTMLElement>, "color"> {
  as?: TextTag;
  size?: TextVariants["size"];
  color?: TextVariants["color"];
}

export function Text({
  as: Tag = "p",
  size,
  color,
  className,
  children,
  ...props
}: TextProps) {
  return (
    <Tag
      className={cn(textVariants({ size, color }), className)}
      {...(props as React.HTMLAttributes<HTMLElement>)}
    >
      {children}
    </Tag>
  );
}
