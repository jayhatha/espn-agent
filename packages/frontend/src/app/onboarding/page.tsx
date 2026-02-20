"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((step, index) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    index < currentStep
                      ? "bg-blue-600 text-white"
                      : index === currentStep
                        ? "bg-blue-600 text-white ring-4 ring-blue-100"
                        : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {index < currentStep ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`hidden sm:block w-12 md:w-20 h-0.5 mx-1 ${
                      index < currentStep ? "bg-blue-600" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between">
            {STEPS.map((step, index) => (
              <span
                key={step}
                className={`text-xs sm:text-sm ${
                  index === currentStep
                    ? "text-blue-600 font-medium"
                    : "text-gray-400"
                }`}
              >
                {step}
              </span>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-xl shadow-md p-6 sm:p-8">
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
        </div>
      </div>
    </div>
  );
}

// Step 0: Welcome
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="text-5xl mb-4">&#9918;</div>
      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
        Welcome to Fantasy Baseball Command Center
      </h2>
      <p className="text-gray-600 mb-8 max-w-lg mx-auto">
        Get AI-powered recommendations for waivers, trades, and projected
        standings
      </p>

      <div className="text-left max-w-md mx-auto mb-8 space-y-4">
        <BulletPoint text="Connect your ESPN league" />
        <BulletPoint text="See projected final standings" />
        <BulletPoint text="Get daily waiver and trade suggestions" />
      </div>

      <button
        onClick={onNext}
        className="w-full sm:w-auto px-8 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-md"
      >
        Get Started
      </button>
      <div className="mt-3">
        <button
          onClick={onNext}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
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
        className="w-5 h-5 text-blue-600 flex-shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      <span className="text-gray-700">{text}</span>
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
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
        Connect Your ESPN League
      </h2>
      <p className="text-gray-600 mb-6">
        Enter your ESPN Fantasy Baseball league details to get started.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ESPN League ID */}
        <div>
          <label
            htmlFor="espnLeagueId"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            ESPN League ID *
          </label>
          <input
            type="number"
            id="espnLeagueId"
            required
            value={espnLeagueId}
            onChange={(e) => setEspnLeagueId(e.target.value)}
            className="block w-full rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2"
            placeholder="123456"
          />
          <p className="mt-1 text-xs text-gray-500">
            Find this in your ESPN league URL: fantasy.espn.com/baseball/league?leagueId=<strong>123456</strong>
          </p>
        </div>

        {/* Season */}
        <div>
          <label
            htmlFor="season"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Season *
          </label>
          <input
            type="number"
            id="season"
            required
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="block w-full rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2"
            placeholder="2026"
            min="2020"
            max={new Date().getFullYear() + 1}
          />
        </div>

        {/* League Name */}
        <div>
          <label
            htmlFor="leagueName"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            League Name (Optional)
          </label>
          <input
            type="text"
            id="leagueName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="block w-full rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2"
            placeholder="Will be fetched from ESPN if not provided"
          />
        </div>

        {/* Private League Toggle */}
        <div className="border-t border-gray-200 pt-4">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm font-medium text-gray-700">
              Private league (requires ESPN cookies)
            </span>
          </label>

          {isPrivate && (
            <div className="mt-4 space-y-4 bg-gray-50 p-4 rounded-md">
              <p className="text-sm text-gray-600">
                Private leagues require your ESPN authentication cookies.{" "}
                <a
                  href="https://github.com/cwendt94/espn-api/wiki/ESPN-Fantasy-Football-Cookies"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 underline"
                >
                  How to find these cookies
                </a>
              </p>

              <div>
                <label
                  htmlFor="swid"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  SWID Cookie
                </label>
                <input
                  type="text"
                  id="swid"
                  value={swid}
                  onChange={(e) => setSwid(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 font-mono text-xs"
                  placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                />
              </div>

              <div>
                <label
                  htmlFor="espnS2"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  espn_s2 Cookie
                </label>
                <input
                  type="text"
                  id="espnS2"
                  value={espnS2}
                  onChange={(e) => setEspnS2(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 font-mono text-xs"
                  placeholder="AEB..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 text-sm">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !espnLeagueId || !season}
          className="w-full py-3 px-4 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
        </button>
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
        <svg
          className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4"
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
        <p className="text-gray-600">Loading teams...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
        <button
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
          className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
        Select Your Team
      </h2>
      <p className="text-gray-600 mb-6">
        Choose the team you manage in {league.name || "your league"}.
      </p>

      {teams.length === 1 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-center">
          <p className="text-blue-800 font-medium">
            Auto-selected: {teams[0].name}
          </p>
          <p className="text-blue-600 text-sm mt-1">
            Only one team found in this league.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => setSelectedTeamId(team.id)}
              className={`text-left p-4 rounded-lg border-2 transition-all ${
                selectedTeamId === team.id
                  ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="font-semibold text-gray-900">{team.name}</div>
              {team.abbreviation && (
                <div className="text-sm text-gray-500 mt-0.5">
                  {team.abbreviation}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={selectedTeamId === null}
        className="w-full py-3 px-4 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        Continue
      </button>
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
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg
          className="w-8 h-8 text-green-600"
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

      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
        You're all set!
      </h2>

      <p className="text-gray-600 mb-2">
        Connected to <span className="font-semibold">{leagueName}</span> as{" "}
        <span className="font-semibold">{teamName}</span>
      </p>

      <p className="text-sm text-gray-500 mb-8 max-w-md mx-auto">
        Upload FanGraphs projections from your league dashboard for even better
        recommendations.
      </p>

      <button
        onClick={() => router.push(`/leagues/${leagueId}`)}
        className="w-full sm:w-auto px-8 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-md"
      >
        Go to Dashboard
      </button>
    </div>
  );
}
