"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Container } from "@/components/ui/Container";

interface NavigationSectionProps {
  leagueId: string;
}

export function NavigationSection({ leagueId }: NavigationSectionProps) {
  const pathname = usePathname();

  const primaryLinks = [
    {
      href: `/leagues/${leagueId}`,
      label: "Overview",
      exact: true,
    },
    {
      href: `/leagues/${leagueId}/standings`,
      label: "Standings",
      exact: false,
    },
    {
      href: `/leagues/${leagueId}/moves`,
      label: "Roster Moves",
      exact: false,
    },
  ];

  const secondaryLinks = [
    {
      href: `/leagues/${leagueId}/waivers`,
      label: "Waivers",
    },
    {
      href: `/leagues/${leagueId}/trades`,
      label: "Trade Analyzer",
    },
    {
      href: `/leagues/${leagueId}/trends`,
      label: "Trends",
    },
    {
      href: `/leagues/${leagueId}/lineup`,
      label: "Lineup Optimizer",
    },
    {
      href: `/leagues/${leagueId}/streaming`,
      label: "Streaming Pitchers",
    },
  ];

  const isActive = (href: string, exact: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <section className="bg-surface-tertiary dark:bg-shell-panel py-6">
      <Container size="wide">
        {/* Primary tier — larger text, horizontal row */}
        <div className="flex items-center gap-1 mb-3">
          {primaryLinks.map((link) => {
            const active = isActive(link.href, link.exact);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "px-4 py-2 rounded-md text-body font-semibold bg-accent text-content-inverse transition-colors"
                    : "px-4 py-2 rounded-md text-body font-semibold text-content hover:bg-accent-light hover:text-content transition-colors"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </div>
        {/* Divider */}
        <div className="border-t border-neutral-200 dark:border-shell-border mb-3" />
        {/* Secondary tier — smaller text, wrapping row */}
        <div className="flex flex-wrap items-center gap-1">
          {secondaryLinks.map((link) => {
            const active = isActive(link.href, false);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "px-3 py-1.5 rounded text-body-sm font-medium bg-accent text-content-inverse transition-colors"
                    : "px-3 py-1.5 rounded text-body-sm text-content-secondary hover:bg-accent-light hover:text-content transition-colors"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
