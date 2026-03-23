"use client";

import { Container } from "@/components/ui/Container";
import { CategoryStatsTable } from "@/components/league/CategoryStatsTable";

interface TeamOverviewCategory {
  category_id: string;
  name: string;
  stat_key: string;
  type: string;
  direction: string;
  value: number;
  rank: number;
  roto_points: number;
}

interface CategoryTableSectionProps {
  categories: TeamOverviewCategory[];
  totalTeams: number;
}

export function CategoryTableSection({ categories, totalTeams }: CategoryTableSectionProps) {
  return (
    <section className="bg-surface-secondary dark:bg-shell-bg py-10">
      <Container size="wide">
        <div className="overflow-x-auto">
          <CategoryStatsTable
            categories={categories}
            title="Category Stats"
            totalTeams={totalTeams}
          />
        </div>
      </Container>
    </section>
  );
}
