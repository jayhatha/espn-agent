"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    // User is logged in -- check if they have leagues
    setRedirecting(true);
    api
      .getLeagues()
      .then((leagues: { id: number }[]) => {
        if (leagues.length === 0) {
          router.push("/onboarding");
        } else {
          router.push(`/leagues/${leagues[0].id}`);
        }
      })
      .catch(() => {
        // If league fetch fails, stay on home page
        setRedirecting(false);
      });
  }, [user, authLoading, router]);

  // Show loading spinner while checking auth or redirecting
  if (authLoading || redirecting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="text-center">
          <svg
            className="animate-spin h-10 w-10 text-blue-600 mx-auto mb-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated users see the landing page
  if (!user) {
    return <LandingPage />;
  }

  return null;
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
        {/* Hero Section */}
        <div className="text-center mb-12 sm:mb-16">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-4 sm:mb-6 leading-tight">
            Fantasy Baseball
            <span className="block text-blue-600 mt-2">Command Center</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-6 sm:mb-8 px-4">
            Get draft assistance, trade advice, waiver wire suggestions, and
            rest-of-season projections powered by FanGraphs data
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl"
          >
            Get Started
            <svg
              className="ml-2 w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Link>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12 sm:mb-16">
          <FeatureCard
            title="Leagues"
            description="Connect to your ESPN leagues and view standings"
            href="/signup"
            icon="&#127942;"
            color="blue"
          />
          <FeatureCard
            title="Projections"
            description="Upload FanGraphs projections for accurate forecasts"
            href="/signup"
            icon="&#128202;"
            color="green"
          />
          <FeatureCard
            title="Waivers"
            description="Get recommendations on who to add and drop"
            href="/signup"
            icon="&#128260;"
            color="purple"
          />
          <FeatureCard
            title="Trends"
            description="View historical performance and projections"
            href="/signup"
            icon="&#128200;"
            color="orange"
          />
        </div>

        {/* Getting Started Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 lg:p-10 border border-gray-100">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 text-center">
            Getting Started
          </h2>
          <div className="max-w-3xl mx-auto">
            <div className="space-y-4 sm:space-y-6">
              <StepCard
                number={1}
                title="Connect Your League"
                description="Link your ESPN Fantasy Baseball league with your credentials"
              />
              <StepCard
                number={2}
                title="Upload Projections"
                description="Add daily FanGraphs Depth Charts RoS projections (batters + pitchers CSV)"
              />
              <StepCard
                number={3}
                title="View Insights"
                description="Check your projected standings and get personalized recommendations"
              />
              <StepCard
                number={4}
                title="Make Moves"
                description="Make informed decisions on waivers, trades, and draft picks"
              />
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-12 sm:mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          <FeatureHighlight
            icon="&#9889;"
            title="Real-time Analysis"
            description="Get instant insights based on current league standings and projections"
          />
          <FeatureHighlight
            icon="&#127919;"
            title="Smart Recommendations"
            description="AI-powered suggestions for optimal roster management"
          />
          <FeatureHighlight
            icon="&#128241;"
            title="Mobile Friendly"
            description="Access your insights anywhere, anytime on any device"
          />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  description,
  href,
  icon,
  color = "blue",
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
  color?: string;
}) {
  const colorClasses = {
    blue: "from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700",
    green:
      "from-green-500 to-green-600 hover:from-green-600 hover:to-green-700",
    purple:
      "from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700",
    orange:
      "from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700",
  };

  return (
    <Link href={href} className="group h-full">
      <div
        className={`h-full p-6 sm:p-8 bg-gradient-to-br ${colorClasses[color as keyof typeof colorClasses]} rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer`}
      >
        <div
          className="text-4xl sm:text-5xl mb-3 sm:mb-4 filter drop-shadow-lg"
          dangerouslySetInnerHTML={{ __html: icon }}
        />
        <h3 className="text-lg sm:text-xl font-bold text-white mb-2">
          {title}
        </h3>
        <p className="text-sm sm:text-base text-white/90 leading-relaxed">
          {description}
        </p>
      </div>
    </Link>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start space-x-4 p-4 sm:p-5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
      <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-lg sm:text-xl font-bold shadow-md">
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
          {title}
        </h3>
        <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

function FeatureHighlight({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center p-6 sm:p-8 bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow">
      <div
        className="text-4xl sm:text-5xl mb-3 sm:mb-4"
        dangerouslySetInnerHTML={{ __html: icon }}
      />
      <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
        {title}
      </h3>
      <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
        {description}
      </p>
    </div>
  );
}
