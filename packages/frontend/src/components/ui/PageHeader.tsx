"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  backLink?: { href: string; label: string };
}

export function PageHeader({
  title,
  subtitle,
  actions,
  backLink,
}: PageHeaderProps) {
  return (
    <div className="mb-6">
      {backLink && (
        <div className="mb-4">
          <Link
            href={backLink.href}
            className={cn(
              "inline-flex items-center text-sm font-medium transition-colors",
              "text-content-secondary hover:text-content",
              "dark:text-shell-muted dark:hover:text-shell-text"
            )}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {backLink.label}
          </Link>
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <Heading level={1}>{title}</Heading>
          {subtitle && (
            <Text size="sm" color="secondary" className="mt-2">
              {subtitle}
            </Text>
          )}
        </div>
        {actions && <div className="flex-shrink-0 ml-4">{actions}</div>}
      </div>
    </div>
  );
}
