import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const headingVariants = cva("tracking-tight text-content dark:text-shell-text", {
  variants: {
    level: {
      1: "text-h1 font-display",
      2: "text-h2 font-display",
      3: "text-h3 font-semibold",
      4: "text-h4 font-semibold",
    },
  },
  defaultVariants: {
    level: 2,
  },
});

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  level: 1 | 2 | 3 | 4;
  as?: HeadingTag;
}

export function Heading({
  level,
  as,
  className,
  children,
  ...props
}: HeadingProps) {
  const Tag = (as ?? (`h${level}` as HeadingTag)) as React.ElementType;

  return (
    <Tag
      className={cn(headingVariants({ level }), className)}
      {...props}
    >
      {children}
    </Tag>
  );
}
