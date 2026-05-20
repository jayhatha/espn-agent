"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, BarChart3, RefreshCw, ArrowLeftRight } from "lucide-react";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/Container";
import { buttonVariants } from "@/components/ui/Button";
import { FadeIn } from "@/components/motion/FadeIn";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// =============================================================================
// AUTH BYPASSED: Single-user mode (v4.0)
// Home page auto-redirects to first league. No login gate.
// =============================================================================

export default function HomePage() {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(true);

  useEffect(() => {
    api
      .getLeagues()
      .then((data: { leagues: { id: number }[] }) => {
        if (!data.leagues || data.leagues.length === 0) {
          router.push("/onboarding");
        } else {
          router.push(`/leagues/${data.leagues[0].id}`);
        }
      })
      .catch(() => {
        // If league fetch fails, show landing page
        setRedirecting(false);
      });
  }, [router]);

  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" quips />
      </div>
    );
  }

  return <LandingPage />;
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-surface dark:bg-shell-bg">
      <Container className="py-20 sm:py-28 lg:py-36">
        <div className="max-w-content-wide mx-auto">
          {/* Hero — asymmetric, left-aligned */}
          <FadeIn>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-24 sm:mb-32">
              {/* Left: headline + CTA */}
              <div>
                <p className="text-caption uppercase tracking-widest text-accent dark:text-shell-accent font-semibold mb-4">
                  Fantasy Baseball Command Center
                </p>
                <h1 className="text-h1 font-extrabold tracking-tight text-content dark:text-shell-text mb-6 leading-tight">
                  Win your league
                  <br />
                  <span className="text-content-secondary dark:text-shell-muted font-normal">
                    with data on your side.
                  </span>
                </h1>
                <p className="text-body-lg text-content-secondary dark:text-shell-muted mb-8 max-w-md">
                  FanGraphs projections + ESPN live data. Projected standings,
                  waiver impact scores, and trade analysis — updated daily.
                </p>
                <Link
                  href="/onboarding"
                  className={buttonVariants({ variant: "primary", size: "lg" })}
                >
                  Connect your league
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </div>

              {/* Right: feature list, not a card grid */}
              <div className="space-y-px border border-neutral-200 dark:border-shell-border rounded-xl overflow-hidden">
                {[
                  {
                    icon: <BarChart3 className="w-5 h-5" />,
                    title: "Projected standings",
                    detail: "Category-level roto math, not vibes",
                  },
                  {
                    icon: <RefreshCw className="w-5 h-5" />,
                    title: "Waiver wire scoring",
                    detail:
                      "Delta-ranked by what moves the needle for your team",
                  },
                  {
                    icon: <ArrowLeftRight className="w-5 h-5" />,
                    title: "Trade impact analysis",
                    detail: "Swap projections, see how your rank changes",
                  },
                  {
                    icon: (
                      <span className="font-mono text-sm font-bold">CSV</span>
                    ),
                    title: "FanGraphs RoS upload",
                    detail: "Bring your own projections, update any time",
                  },
                ].map((f) => (
                  <div
                    key={f.title}
                    className="flex items-center gap-4 px-5 py-4 bg-white dark:bg-shell-panel"
                  >
                    <span className="text-accent dark:text-shell-accent flex-shrink-0 w-6 flex justify-center">
                      {f.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-semibold text-content dark:text-shell-text">
                        {f.title}
                      </p>
                      <p className="text-caption text-content-secondary dark:text-shell-muted">
                        {f.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>

          {/* Setup — horizontal numbered steps, not cards in a column */}
          <FadeIn delay={100}>
            <div className="border-t border-neutral-200 dark:border-shell-border pt-12">
              <p className="text-caption uppercase tracking-widest text-content-tertiary dark:text-shell-muted mb-8">
                Getting started
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  {
                    n: "01",
                    title: "Connect your ESPN league",
                    detail: "Paste your league ID and ESPN credentials",
                  },
                  {
                    n: "02",
                    title: "Upload FanGraphs projections",
                    detail: "Batters + pitchers CSV from Depth Charts",
                  },
                  {
                    n: "03",
                    title: "Check projected standings",
                    detail:
                      "See category-level rank projections for every team",
                  },
                  {
                    n: "04",
                    title: "Make better moves",
                    detail:
                      "Waivers, trades, and streaming — scored for your team",
                  },
                ].map((s) => (
                  <div key={s.n}>
                    <p className="text-display font-extrabold text-neutral-100 dark:text-shell-border leading-none mb-3 font-mono select-none">
                      {s.n}
                    </p>
                    <p className="text-body-sm font-semibold text-content dark:text-shell-text mb-1">
                      {s.title}
                    </p>
                    <p className="text-caption text-content-secondary dark:text-shell-muted">
                      {s.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </Container>
    </div>
  );
}
