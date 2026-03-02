"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trophy, BarChart3, RefreshCw, TrendingUp, Zap, Target, Smartphone, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/Container";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FadeIn } from "@/components/motion/FadeIn";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

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
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" message="Loading..." />
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
    <div className="min-h-screen">
      <Container className="py-16 sm:py-20 lg:py-24">
        {/* Hero Section */}
        <FadeIn>
          <div className="text-center mb-16 sm:mb-20">
            <Heading level={1} className="text-display mb-6">
              Fantasy Baseball
              <span className="block mt-1">Command Center</span>
            </Heading>
            <Text size="lg" color="secondary" className="max-w-2xl mx-auto mb-8">
              Get draft assistance, trade advice, waiver wire suggestions, and
              rest-of-season projections powered by FanGraphs data
            </Text>
            <Link
              href="/signup"
              className={buttonVariants({ variant: "primary", size: "lg" })}
            >
              Get Started
              <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
          </div>
        </FadeIn>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-16 sm:mb-20">
          <FadeIn delay={0}>
            <FeatureCard
              title="Leagues"
              description="Connect to your ESPN leagues and view standings"
              href="/signup"
              icon={<Trophy className="w-7 h-7" />}
            />
          </FadeIn>
          <FadeIn delay={100}>
            <FeatureCard
              title="Projections"
              description="Upload FanGraphs projections for accurate forecasts"
              href="/signup"
              icon={<BarChart3 className="w-7 h-7" />}
            />
          </FadeIn>
          <FadeIn delay={200}>
            <FeatureCard
              title="Waivers"
              description="Get recommendations on who to add and drop"
              href="/signup"
              icon={<RefreshCw className="w-7 h-7" />}
            />
          </FadeIn>
          <FadeIn delay={300}>
            <FeatureCard
              title="Trends"
              description="View historical performance and projections"
              href="/signup"
              icon={<TrendingUp className="w-7 h-7" />}
            />
          </FadeIn>
        </div>

        {/* Getting Started Section */}
        <Card className="p-6 sm:p-8 lg:p-10 mb-16 sm:mb-20">
          <Heading level={2} className="mb-6 text-center">
            Getting Started
          </Heading>
          <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5">
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
        </Card>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          <FadeIn delay={0}>
            <FeatureHighlight
              icon={<Zap className="w-8 h-8" />}
              title="Real-time Analysis"
              description="Get instant insights based on current league standings and projections"
            />
          </FadeIn>
          <FadeIn delay={100}>
            <FeatureHighlight
              icon={<Target className="w-8 h-8" />}
              title="Smart Recommendations"
              description="AI-powered suggestions for optimal roster management"
            />
          </FadeIn>
          <FadeIn delay={200}>
            <FeatureHighlight
              icon={<Smartphone className="w-8 h-8" />}
              title="Mobile Friendly"
              description="Access your insights anywhere, anytime on any device"
            />
          </FadeIn>
        </div>
      </Container>
    </div>
  );
}

function FeatureCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="group h-full block">
      <Card className="h-full p-6 sm:p-7 hover:border-neutral-400 transition-colors cursor-pointer">
        <div className="text-content-secondary mb-3 sm:mb-4 group-hover:text-content transition-colors">
          {icon}
        </div>
        <Heading level={3} className="mb-2">
          {title}
        </Heading>
        <Text size="sm" color="secondary" className="leading-relaxed">
          {description}
        </Text>
      </Card>
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
    <div className="flex items-start space-x-4 p-4 sm:p-5 bg-surface-secondary rounded-lg">
      <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-accent text-content-inverse rounded-full flex items-center justify-center text-lg sm:text-xl font-bold">
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <Heading level={4} className="mb-1">
          {title}
        </Heading>
        <Text size="sm" color="secondary" className="leading-relaxed">
          {description}
        </Text>
      </div>
    </div>
  );
}

function FeatureHighlight({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="text-center p-6 sm:p-8">
      <div className="text-content-secondary mb-3 sm:mb-4 flex justify-center">
        {icon}
      </div>
      <Heading level={3} className="mb-2">
        {title}
      </Heading>
      <Text size="sm" color="secondary" className="leading-relaxed">
        {description}
      </Text>
    </Card>
  );
}
