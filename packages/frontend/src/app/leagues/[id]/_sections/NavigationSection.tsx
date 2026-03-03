"use client";

import Link from "next/link";
import {
  TableIcon,
  TrendingUpIcon,
  PlusIcon,
  ArrowRightLeftIcon,
  BarChart3Icon,
  ClipboardListIcon,
  ActivityIcon,
  DollarSignIcon,
} from "lucide-react";
import { Container } from "@/components/ui/Container";

interface NavigationSectionProps {
  leagueId: string;
}

export function NavigationSection({ leagueId }: NavigationSectionProps) {
  const quickLinks = [
    {
      href: `/leagues/${leagueId}/standings`,
      icon: <TableIcon className="h-4 w-4" />,
      label: "Standings",
    },
    {
      href: `/leagues/${leagueId}/trends`,
      icon: <TrendingUpIcon className="h-4 w-4" />,
      label: "Trends",
    },
    {
      href: `/leagues/${leagueId}/waivers`,
      icon: <PlusIcon className="h-4 w-4" />,
      label: "Waivers",
    },
    {
      href: `/leagues/${leagueId}/trades`,
      icon: <ArrowRightLeftIcon className="h-4 w-4" />,
      label: "Trade Analyzer",
    },
    {
      href: `/leagues/${leagueId}/moves`,
      icon: <BarChart3Icon className="h-4 w-4" />,
      label: "Move Impact",
    },
    {
      href: `/leagues/${leagueId}/lineup`,
      icon: <ClipboardListIcon className="h-4 w-4" />,
      label: "Lineup Optimizer",
    },
    {
      href: `/leagues/${leagueId}/streaming`,
      icon: <ActivityIcon className="h-4 w-4" />,
      label: "Streaming Pitchers",
    },
    {
      href: `/leagues/${leagueId}/draft/rankings`,
      icon: <BarChart3Icon className="h-4 w-4" />,
      label: "Draft Rankings",
    },
    {
      href: `/leagues/${leagueId}/draft/auction`,
      icon: <DollarSignIcon className="h-4 w-4" />,
      label: "Auction Values",
    },
  ];

  return (
    <section className="bg-surface-tertiary py-8">
      <Container size="wide">
        <h2 className="text-body font-medium text-content-secondary uppercase tracking-wider mb-4">
          Quick Access
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-body-sm font-medium text-content hover:bg-accent-light hover:text-content transition-colors"
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
