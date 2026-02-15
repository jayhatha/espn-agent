"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

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
    queryFn: async () => {
      const response = await fetch("http://localhost:3001/api/leagues");
      if (!response.ok) {
        throw new Error("Failed to fetch leagues");
      }
      return response.json() as Promise<{ leagues: League[] }>;
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error loading leagues</h3>
          <p className="text-red-600 text-sm mt-1">
            {(error as Error).message}
          </p>
        </div>
      </div>
    );
  }

  const leagues = data?.leagues || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            My Leagues
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Manage your ESPN Fantasy Baseball leagues
          </p>
        </div>
        <Link
          href="/leagues/connect"
          className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-colors shadow-md hover:shadow-lg text-sm sm:text-base"
        >
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Connect League
        </Link>
      </div>

      {leagues.length === 0 ? (
        <div className="text-center py-12 sm:py-16 bg-white rounded-xl shadow-lg border border-gray-100">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
            No leagues connected
          </h3>
          <p className="text-sm sm:text-base text-gray-500 mb-6 px-4">
            Get started by connecting your ESPN Fantasy Baseball league.
          </p>
          <Link
            href="/leagues/connect"
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-md hover:shadow-lg transition-all"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            Connect Your First League
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:gap-6">
          {leagues.map((league) => (
            <Link
              key={league.id}
              href={`/leagues/${league.id}`}
              className="block group"
            >
              <div className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-blue-300 group-hover:-translate-y-1">
                <div className="p-4 sm:p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 pr-4">
                      <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors truncate">
                        {league.name}
                      </h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs sm:text-sm text-gray-600">
                        <div className="flex items-center">
                          <span className="font-medium text-gray-500 mr-1">
                            Season:
                          </span>
                          <span className="font-semibold text-gray-900">
                            {league.season}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <span className="font-medium text-gray-500 mr-1">
                            ESPN ID:
                          </span>
                          <span className="font-semibold text-gray-900">
                            {league.espn_league_id}
                          </span>
                        </div>
                        <div className="hidden sm:flex items-center">
                          <span className="font-medium text-gray-500 mr-1">
                            Timezone:
                          </span>
                          <span className="font-semibold text-gray-900">
                            {league.timezone}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 self-center">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-100 group-hover:bg-blue-600 flex items-center justify-center transition-colors">
                        <svg
                          className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 group-hover:text-white transition-colors"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
