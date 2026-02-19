"use client";

import Link from "next/link";

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
            className="inline-flex items-center text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            <svg
              className="w-4 h-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {backLink.label}
          </Link>
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm sm:text-base text-gray-600">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex-shrink-0 ml-4">{actions}</div>}
      </div>
    </div>
  );
}
