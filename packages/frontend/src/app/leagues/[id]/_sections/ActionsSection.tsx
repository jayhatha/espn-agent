"use client";

import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Heading } from "@/components/ui/Heading";
import { ActionItemsList, type ActionItem } from "@/components/league/ActionItemsList";

interface ActionsSectionProps {
  actionItems: ActionItem[];
  leagueId: string;
}

export function ActionsSection({ actionItems, leagueId }: ActionsSectionProps) {
  return (
    <section className="bg-surface-secondary dark:bg-shell-bg py-6">
      <Container size="wide">
        <div className="flex items-baseline justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 bg-shell-accent rounded-full" />
            <Heading level={2}>Recommended Actions</Heading>
          </div>
          <div className="flex gap-6">
            <Link
              href={`/leagues/${leagueId}/waivers`}
              className="text-body-sm text-content-secondary hover:text-content dark:text-shell-muted dark:hover:text-shell-text transition-colors"
            >
              All Waivers &rarr;
            </Link>
            <Link
              href={`/leagues/${leagueId}/trades`}
              className="text-body-sm text-content-secondary hover:text-content dark:text-shell-muted dark:hover:text-shell-text transition-colors"
            >
              All Trades &rarr;
            </Link>
          </div>
        </div>
        <ActionItemsList items={actionItems} />
      </Container>
    </section>
  );
}
