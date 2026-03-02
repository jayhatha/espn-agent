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
        "mx-auto px-4 sm:px-6 lg:px-8",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
