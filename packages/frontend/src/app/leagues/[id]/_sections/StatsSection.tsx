"use client";

import { Container } from "@/components/ui/Container";
import { Card, CardContent } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { TeamHealthOverview } from "@/components/league/TeamHealthOverview";
import { CategoryMiniChart } from "@/components/league/CategoryMiniChart";

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

interface MiniChartPoint {
  date: string;
  rank: number;
}

interface StatsSectionProps {
  categories: TeamOverviewCategory[];
  totalTeams: number;
  miniChartData: MiniChartPoint[];
}

export function StatsSection({ categories, totalTeams, miniChartData }: StatsSectionProps) {
  return (
    <section className="bg-white py-10">
      <Container size="wide">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8">
            <Heading level={2} className="mb-6">Team Health</Heading>
            <TeamHealthOverview
              categories={categories}
              totalTeams={totalTeams}
            />
          </div>
          <div className="lg:col-span-4">
            <h3 className="text-body font-medium text-content-secondary uppercase tracking-wider mb-4">
              Standings Trend
            </h3>
            <Card>
              <CardContent>
                <CategoryMiniChart data={miniChartData} />
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </section>
  );
}
