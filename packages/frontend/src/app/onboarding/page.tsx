"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/Container";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

interface League {
  id: number;
  name: string;
  espn_league_id: number;
  season: number;
}

interface Team {
  id: number;
  espn_team_id: number;
  name: string;
  abbreviation: string;
}

interface WizardContext {
  league: League | null;
  selectedTeamId: number | null;
  selectedTeamName: string | null;
}

const STEPS = ["Welcome", "Connect League", "Select Team", "Complete"];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [wizardContext, setWizardContext] = useState<WizardContext>({
    league: null,
    selectedTeamId: null,
    selectedTeamName: null,
  });

  return (
    <div className="min-h-screen py-8 sm:py-12">
      <Container>
        <div className="max-w-2xl mx-auto">
          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              {STEPS.map((step, index) => (
                <div key={step} className="flex items-center">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                      index < currentStep
                        ? "bg-accent text-content-inverse dark:bg-shell-accent dark:text-white"
                        : index === currentStep
                          ? "bg-accent text-content-inverse ring-4 ring-accent/20 dark:bg-shell-accent dark:text-white dark:ring-shell-accent/20"
                          : "bg-neutral-200 dark:bg-shell-border text-content-secondary dark:text-shell-muted"
                    )}
                  >
                    {index < currentStep ? (
                      <CheckIcon className="w-4 h-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={cn(
                        "hidden sm:block w-12 md:w-20 h-0.5 mx-1 transition-colors",
                        index < currentStep ? "bg-accent dark:bg-shell-accent" : "bg-neutral-200 dark:bg-shell-border"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              {STEPS.map((step, index) => (
                <Text
                  key={step}
                  size="caption"
                  className={cn(
                    index === currentStep
                      ? "text-content font-medium"
                      : "text-content-tertiary"
                  )}
                >
                  {step}
                </Text>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <Card>
            <CardContent className="p-6 sm:p-8">
              {currentStep === 0 && (
                <WelcomeStep onNext={() => setCurrentStep(1)} />
              )}
              {currentStep === 1 && (
                <ConnectLeagueStep
                  onNext={(league: League) => {
                    setWizardContext((prev) => ({ ...prev, league }));
                    setCurrentStep(2);
                  }}
                />
              )}
              {currentStep === 2 && wizardContext.league && (
                <SelectTeamStep
                  league={wizardContext.league}
                  onNext={(teamId: number, teamName: string) => {
                    setWizardContext((prev) => ({
                      ...prev,
                      selectedTeamId: teamId,
                      selectedTeamName: teamName,
                    }));
                    setCurrentStep(3);
                  }}
                />
              )}
              {currentStep === 3 && wizardContext.league && (
                <CompleteStep
                  leagueName={wizardContext.league.name}
                  teamName={wizardContext.selectedTeamName || "your team"}
                  leagueId={wizardContext.league.id}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </Container>
    </div>
  );
}

// Step 0: Welcome
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="text-5xl mb-4">&#9918;</div>
      <Heading level={2} className="mb-3">
        Welcome to Fantasy Baseball Command Center
      </Heading>
      <Text color="secondary" className="mb-8 max-w-lg mx-auto">
        Get AI-powered recommendations for waivers, trades, and projected
        standings
      </Text>

      <div className="text-left max-w-md mx-auto mb-8 space-y-4">
        <BulletPoint text="Connect your ESPN league" />
        <BulletPoint text="See projected final standings" />
        <BulletPoint text="Get daily waiver and trade suggestions" />
      </div>

      <Button onClick={onNext} variant="primary" size="lg" className="w-full sm:w-auto px-8">
        Get Started
      </Button>
      <div className="mt-3">
        <button
          onClick={onNext}
          className="text-body-sm text-content-tertiary hover:text-content-secondary transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function BulletPoint({ text }: { text: string }) {
  return (
    <div className="flex items-center space-x-3">
      <svg
        className="w-5 h-5 text-accent dark:text-shell-accent flex-shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      <Text color="default">{text}</Text>
    </div>
  );
}

// Step 1: Connect League
function ConnectLeagueStep({ onNext }: { onNext: (league: League) => void }) {
  const [espnLeagueId, setEspnLeagueId] = useState("");
  const [season, setSeason] = useState(new Date().getFullYear().toString());
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [swid, setSwid] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const body: {
        espnLeagueId: number;
        season: number;
        name?: string;
        auth?: { SWID: string; espn_s2: string };
      } = {
        espnLeagueId: parseInt(espnLeagueId, 10),
        season: parseInt(season, 10),
      };

      if (name.trim()) body.name = name.trim();
      if (isPrivate && swid && espnS2) {
        body.auth = { SWID: swid, espn_s2: espnS2 };
      }

      const data = await api.connectLeague(body);
      onNext(data.league);
    } catch (err) {
      setError((err as Error).message || "Failed to connect league");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Heading level={2} className="mb-2">
        Connect Your ESPN League
      </Heading>
      <Text color="secondary" className="mb-6">
        Enter your ESPN Fantasy Baseball league details to get started.
      </Text>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ESPN League ID */}
        <div>
          <label
            htmlFor="espnLeagueId"
            className="block text-body-sm font-medium text-content dark:text-shell-text mb-1"
          >
            ESPN League ID *
          </label>
          <Input
            type="number"
            id="espnLeagueId"
            required
            value={espnLeagueId}
            onChange={(e) => setEspnLeagueId(e.target.value)}
            placeholder="123456"
          />
          <Text size="caption" color="tertiary" className="mt-1">
            Find this in your ESPN league URL: fantasy.espn.com/baseball/league?leagueId=<strong>123456</strong>
          </Text>
        </div>

        {/* Season */}
        <div>
          <label
            htmlFor="season"
            className="block text-body-sm font-medium text-content dark:text-shell-text mb-1"
          >
            Season *
          </label>
          <Input
            type="number"
            id="season"
            required
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="2026"
            min="2020"
            max={new Date().getFullYear() + 1}
          />
        </div>

        {/* League Name */}
        <div>
          <label
            htmlFor="leagueName"
            className="block text-body-sm font-medium text-content dark:text-shell-text mb-1"
          >
            League Name (Optional)
          </label>
          <Input
            type="text"
            id="leagueName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Will be fetched from ESPN if not provided"
          />
        </div>

        {/* Private League Toggle */}
        <div className="border-t border-neutral-100 dark:border-shell-border pt-4">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 dark:border-shell-border text-accent dark:text-shell-accent focus:ring-accent dark:focus:ring-shell-accent"
            />
            <Text size="sm" className="ml-2 font-medium">
              Private league (requires ESPN cookies)
            </Text>
          </label>

          {isPrivate && (
            <div className="mt-4 space-y-4 bg-surface-secondary dark:bg-shell-bg p-4 rounded-lg">
              <Text size="sm" color="secondary">
                Private leagues require your ESPN authentication cookies.{" "}
                <a
                  href="https://github.com/cwendt94/espn-api/wiki/ESPN-Fantasy-Football-Cookies"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent dark:text-shell-accent hover:underline"
                >
                  How to find these cookies
                </a>
              </Text>

              <div>
                <label
                  htmlFor="swid"
                  className="block text-body-sm font-medium text-content dark:text-shell-text mb-1"
                >
                  SWID Cookie
                </label>
                <Input
                  type="text"
                  id="swid"
                  value={swid}
                  onChange={(e) => setSwid(e.target.value)}
                  className="font-mono text-caption"
                  placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                />
              </div>

              <div>
                <label
                  htmlFor="espnS2"
                  className="block text-body-sm font-medium text-content dark:text-shell-text mb-1"
                >
                  espn_s2 Cookie
                </label>
                <Input
                  type="text"
                  id="espnS2"
                  value={espnS2}
                  onChange={(e) => setEspnS2(e.target.value)}
                  className="font-mono text-caption"
                  placeholder="AEB..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-negative-light dark:bg-negative-dark-bg/20 border border-negative-border dark:border-negative-dark-border rounded-lg p-4">
            <Text size="sm" className="text-negative dark:text-negative-dark">{error}</Text>
            <button
              type="button"
              onClick={() => setError(null)}
              className="mt-2 text-body-sm text-negative dark:text-negative-dark hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={loading || !espnLeagueId || !season}
          className="w-full"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5"
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
              Connecting...
            </>
          ) : (
            "Connect League"
          )}
        </Button>
      </form>
    </div>
  );
}

// Step 2: Select Team
function SelectTeamStep({
  league,
  onNext,
}: {
  league: League;
  onNext: (teamId: number, teamName: string) => void;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTeams() {
      try {
        const data = await api.getTeams(league.id);
        if (!cancelled) {
          const teamList = data.teams || data;
          setTeams(teamList);
          // Auto-select if only one team
          if (teamList.length === 1) {
            setSelectedTeamId(teamList[0].id);
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || "Failed to load teams");
          setLoading(false);
        }
      }
    }

    fetchTeams();
    return () => {
      cancelled = true;
    };
  }, [league.id]);

  const handleContinue = () => {
    if (selectedTeamId === null) return;
    const team = teams.find((t) => t.id === selectedTeamId);
    if (!team) return;

    // Store team selection in localStorage (existing pattern)
    localStorage.setItem(`league_${league.id}_team`, String(selectedTeamId));
    onNext(selectedTeamId, team.name);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full border-b-2 border-accent h-8 w-8 mx-auto mb-4" />
        <Text color="secondary">Loading teams...</Text>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <Text size="sm" className="text-red-700">{error}</Text>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setError(null);
            setLoading(true);
            api
              .getTeams(league.id)
              .then((data) => {
                const teamList = data.teams || data;
                setTeams(teamList);
                if (teamList.length === 1) {
                  setSelectedTeamId(teamList[0].id);
                }
                setLoading(false);
              })
              .catch((err) => {
                setError((err as Error).message || "Failed to load teams");
                setLoading(false);
              });
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Heading level={2} className="mb-2">
        Select Your Team
      </Heading>
      <Text color="secondary" className="mb-6">
        Choose the team you manage in {league.name || "your league"}.
      </Text>

      {teams.length === 1 ? (
        <div className="bg-surface-secondary dark:bg-shell-bg border border-neutral-200 dark:border-shell-border rounded-lg p-4 mb-6 text-center">
          <Text className="font-medium">
            Auto-selected: {teams[0].name}
          </Text>
          <Text size="sm" color="secondary" className="mt-1">
            Only one team found in this league.
          </Text>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => setSelectedTeamId(team.id)}
              className={cn(
                "text-left p-4 rounded-lg border-2 transition-all",
                selectedTeamId === team.id
                  ? "border-accent dark:border-shell-accent bg-accent/5 dark:bg-shell-accent/10 ring-1 ring-accent dark:ring-shell-accent"
                  : "border-neutral-200 dark:border-shell-border hover:border-neutral-300 dark:hover:border-shell-muted hover:bg-surface-secondary dark:hover:bg-shell-panel"
              )}
            >
              <Text className="font-semibold">{team.name}</Text>
              {team.abbreviation && (
                <Text size="sm" color="secondary" className="mt-0.5">
                  {team.abbreviation}
                </Text>
              )}
            </button>
          ))}
        </div>
      )}

      <Button
        onClick={handleContinue}
        variant="primary"
        size="lg"
        disabled={selectedTeamId === null}
        className="w-full"
      >
        Continue
      </Button>
    </div>
  );
}

// Step 3: Complete
function CompleteStep({
  leagueName,
  teamName,
  leagueId,
}: {
  leagueName: string;
  teamName: string;
  leagueId: number;
}) {
  const router = useRouter();

  return (
    <div className="text-center">
      <div className="w-16 h-16 bg-surface-secondary dark:bg-shell-panel rounded-full flex items-center justify-center mx-auto mb-4">
        <svg
          className="w-8 h-8 text-accent dark:text-shell-accent"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      <Heading level={2} className="mb-3">
        You&apos;re all set!
      </Heading>

      <Text color="secondary" className="mb-2">
        Connected to <span className="font-semibold text-content dark:text-shell-text">{leagueName}</span> as{" "}
        <span className="font-semibold text-content dark:text-shell-text">{teamName}</span>
      </Text>

      <Text size="sm" color="tertiary" className="mb-8 max-w-md mx-auto">
        Upload FanGraphs projections from your league dashboard for even better
        recommendations.
      </Text>

      <Button
        onClick={() => router.push(`/leagues/${leagueId}`)}
        variant="primary"
        size="lg"
        className="w-full sm:w-auto px-8"
      >
        Go to Dashboard
      </Button>
    </div>
  );
}
