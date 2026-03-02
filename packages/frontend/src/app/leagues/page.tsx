"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PlusIcon, FolderOpenIcon, ChevronRightIcon } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/Container";
import { Card, CardContent } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import { buttonVariants } from "@/components/ui/Button";

interface League {
  id: number;
  espn_league_id: number;
  season: number;
  name: string;
  timezone: string;
  created_at: string;
}

export default function LeaguesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["leagues"],
    queryFn: () => api.getLeagues() as Promise<{ leagues: League[] }>,
  });

  if (isLoading) {
    return (
      <Container className="py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-neutral-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-20 bg-neutral-200 rounded"></div>
            <div className="h-20 bg-neutral-200 rounded"></div>
          </div>
        </div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="py-8">
        <div className="bg-negative-light border border-negative-border rounded-lg p-4">
          <h3 className="text-negative font-medium">Error loading leagues</h3>
          <p className="text-body-sm text-content-secondary mt-1">
            {(error as Error).message}
          </p>
        </div>
      </Container>
    );
  }

  const leagues = data?.leagues || [];

  return (
    <Container className="py-6 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 sm:mb-8">
        <div>
          <Heading level={1}>My Leagues</Heading>
          <Text size="sm" color="secondary" className="mt-1">
            Manage your ESPN Fantasy Baseball leagues
          </Text>
        </div>
        <Link
          href="/leagues/connect"
          className={cn(buttonVariants({ variant: "primary", size: "md" }))}
        >
          <PlusIcon className="w-4 h-4 mr-2" />
          Connect League
        </Link>
      </div>

      {leagues.length === 0 ? (
        <Card className="text-center py-12 sm:py-16">
          <CardContent>
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-accent-light rounded-full flex items-center justify-center mx-auto mb-4">
              <FolderOpenIcon className="w-8 h-8 sm:w-10 sm:h-10 text-content" />
            </div>
            <Heading level={3} className="mb-2">
              No leagues connected
            </Heading>
            <Text size="sm" color="secondary" className="mb-6 px-4">
              Get started by connecting your ESPN Fantasy Baseball league.
            </Text>
            <Link
              href="/leagues/connect"
              className={cn(buttonVariants({ variant: "primary", size: "lg" }))}
            >
              <PlusIcon className="w-5 h-5 mr-2" />
              Connect Your First League
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:gap-6">
          {leagues.map((league) => (
            <Link
              key={league.id}
              href={`/leagues/${league.id}`}
              className="block group"
            >
              <Card className="transition-shadow hover:shadow-card-hover">
                <CardContent className="py-4 sm:py-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 pr-4">
                      <Heading
                        level={3}
                        className="mb-2 group-hover:text-content-secondary transition-colors truncate"
                      >
                        {league.name}
                      </Heading>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        <div className="flex items-center">
                          <Text size="sm" color="secondary" as="span" className="mr-1">
                            Season:
                          </Text>
                          <Text size="sm" as="span" className="font-semibold">
                            {league.season}
                          </Text>
                        </div>
                        <div className="flex items-center">
                          <Text size="sm" color="secondary" as="span" className="mr-1">
                            ESPN ID:
                          </Text>
                          <Text size="sm" as="span" className="font-semibold">
                            {league.espn_league_id}
                          </Text>
                        </div>
                        <div className="hidden sm:flex items-center">
                          <Text size="sm" color="secondary" as="span" className="mr-1">
                            Timezone:
                          </Text>
                          <Text size="sm" as="span" className="font-semibold">
                            {league.timezone}
                          </Text>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 self-center">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-accent-light group-hover:bg-accent flex items-center justify-center transition-colors">
                        <ChevronRightIcon className="w-4 h-4 sm:w-5 sm:h-5 text-content group-hover:text-content-inverse transition-colors" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
