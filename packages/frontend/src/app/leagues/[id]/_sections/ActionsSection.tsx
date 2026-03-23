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
    <section className="bg-surface-secondary dark:bg-shell-bg py-12">
      <Container size="wide">
        <div className="flex items-baseline justify-between mb-8">
          <Heading level={2}>Recommended Actions</Heading>
          <div className="flex gap-6">
            <Link
              href={`/leagues/${leagueId}/waivers`}
              className="text-body-sm text-content-secondary hover:text-content transition-colors"
            >
              All Waivers &rarr;
            </Link>
            <Link
              href={`/leagues/${leagueId}/trades`}
              className="text-body-sm text-content-secondary hover:text-content transition-colors"
            >
              All Trades &rarr;
            </Link>
          </div>
        </div>
        <ActionItemsList items={actionItems} maxItems={5} />
      </Container>
    </section>
  );
}
