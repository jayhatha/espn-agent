"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

interface ConnectLeagueForm {
  espnLeagueId: string;
  season: string;
  name?: string;
  timezone?: string;
  swid?: string;
  espn_s2?: string;
}

interface TeamOption {
  espnTeamId: number;
  name: string;
}

export default function ConnectLeaguePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [step, setStep] = useState<"form" | "pick-team">("form");
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeamEspnId, setSelectedTeamEspnId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ConnectLeagueForm>({
    espnLeagueId: "",
    season: new Date().getFullYear().toString(),
    name: "",
    timezone: "America/New_York",
    swid: "",
    espn_s2: "",
  });

  const connectMutation = useMutation({
    mutationFn: async (data: ConnectLeagueForm & { teamEspnId?: number }) => {
      const body: any = {
        espnLeagueId: parseInt(data.espnLeagueId, 10),
        season: parseInt(data.season, 10),
      };

      if (data.name) body.name = data.name;
      if (data.timezone) body.timezone = data.timezone;
      if (data.swid && data.espn_s2) {
        body.auth = {
          SWID: data.swid,
          espn_s2: data.espn_s2,
        };
      }
      if (data.teamEspnId) body.teamEspnId = data.teamEspnId;

      return api.connectLeague(body);
    },
    onSuccess: (data) => {
      // If no team was auto-detected and we haven't picked yet, show team picker
      if (!data.userTeamDetected && step === "form" && data.teams?.length > 0) {
        setTeams(data.teams);
        setStep("pick-team");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["leagues"] });
      router.push(`/leagues/${data.league.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    connectMutation.mutate(formData);
  };

  const handleTeamSelect = () => {
    if (!selectedTeamEspnId) return;
    connectMutation.mutate({ ...formData, teamEspnId: selectedTeamEspnId });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  // Team selection step
  if (step === "pick-team") {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Select Your Team
          </h1>
          <p className="text-gray-600 mb-6">
            Which team is yours? We'll use this to personalize your dashboard and recommendations.
          </p>

          <div className="space-y-2">
            {teams.map((team) => (
              <button
                key={team.espnTeamId}
                type="button"
                onClick={() => setSelectedTeamEspnId(team.espnTeamId)}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                  selectedTeamEspnId === team.espnTeamId
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className="font-medium text-gray-900">{team.name}</span>
              </button>
            ))}
          </div>

          {connectMutation.isError && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 text-sm">
                {(connectMutation.error as Error).message}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <button
              type="button"
              onClick={() => { setStep("form"); connectMutation.reset(); }}
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleTeamSelect}
              disabled={!selectedTeamEspnId || connectMutation.isPending}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {connectMutation.isPending ? "Connecting..." : "Confirm & Connect"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/leagues"
          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
        >
          &larr; Back to Leagues
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Connect ESPN League
        </h1>
        <p className="text-gray-600 mb-6">
          Enter your ESPN Fantasy Baseball league details to start tracking your
          team.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ESPN League ID */}
          <div>
            <label
              htmlFor="espnLeagueId"
              className="block text-sm font-medium text-gray-700"
            >
              ESPN League ID *
            </label>
            <input
              type="number"
              id="espnLeagueId"
              name="espnLeagueId"
              required
              value={formData.espnLeagueId}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
              placeholder="123456"
            />
            <p className="mt-1 text-sm text-gray-500">
              Find this in your league URL:
              fantasy.espn.com/baseball/league?leagueId=
              <strong>123456</strong>
            </p>
          </div>

          {/* Season */}
          <div>
            <label
              htmlFor="season"
              className="block text-sm font-medium text-gray-700"
            >
              Season *
            </label>
            <input
              type="number"
              id="season"
              name="season"
              required
              value={formData.season}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
              placeholder="2024"
              min="2020"
              max={new Date().getFullYear() + 1}
            />
          </div>

          {/* League Name (Optional) */}
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              League Name (Optional)
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
              placeholder="Will be fetched from ESPN if not provided"
            />
          </div>

          {/* Timezone */}
          <div>
            <label
              htmlFor="timezone"
              className="block text-sm font-medium text-gray-700"
            >
              Timezone
            </label>
            <select
              id="timezone"
              name="timezone"
              value={formData.timezone}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
            >
              <option value="America/New_York">Eastern (ET)</option>
              <option value="America/Chicago">Central (CT)</option>
              <option value="America/Denver">Mountain (MT)</option>
              <option value="America/Los_Angeles">Pacific (PT)</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">
              Used for daily snapshot timing (03:00 in this timezone)
            </p>
          </div>

          {/* Advanced Options - Private League Auth */}
          <div className="border-t border-gray-200 pt-6">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              <svg
                className={`mr-2 h-5 w-5 transform transition-transform ${showAdvanced ? "rotate-90" : ""}`}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Private League Authentication (Optional)
            </button>
            <p className="mt-1 ml-7 text-sm text-gray-500">
              Required for private leagues. For public leagues, we'll ask you to pick your team in the next step.
            </p>

            {showAdvanced && (
              <div className="mt-4 space-y-4 bg-gray-50 p-4 rounded-md">
                <p className="text-sm text-gray-600">
                  If your league is private, you'll need to provide
                  authentication cookies from ESPN.
                  <a
                    href="https://github.com/cwendt94/espn-api/wiki/ESPN-Fantasy-Football-Cookies"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-blue-600 hover:text-blue-700 underline"
                  >
                    How to find these cookies &rarr;
                  </a>
                </p>

                <div>
                  <label
                    htmlFor="swid"
                    className="block text-sm font-medium text-gray-700"
                  >
                    SWID Cookie
                  </label>
                  <input
                    type="text"
                    id="swid"
                    name="swid"
                    value={formData.swid}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border font-mono text-xs"
                    placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                  />
                </div>

                <div>
                  <label
                    htmlFor="espn_s2"
                    className="block text-sm font-medium text-gray-700"
                  >
                    espn_s2 Cookie
                  </label>
                  <input
                    type="text"
                    id="espn_s2"
                    name="espn_s2"
                    value={formData.espn_s2}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border font-mono text-xs"
                    placeholder="AEB..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {connectMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="text-red-800 font-medium">Connection Failed</h3>
              <p className="text-red-600 text-sm mt-1">
                {(connectMutation.error as Error).message}
              </p>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex items-center justify-between pt-4">
            <Link
              href="/leagues"
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={
                connectMutation.isPending ||
                !formData.espnLeagueId ||
                !formData.season
              }
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {connectMutation.isPending ? (
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
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Connecting...
                </>
              ) : (
                "Connect League"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800 flex items-center">
          <svg
            className="mr-2 h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          What happens after connecting?
        </h3>
        <ul className="mt-2 text-sm text-blue-700 space-y-1 ml-7">
          <li>
            &bull; We'll fetch your league settings and validate the connection
          </li>
          <li>
            &bull; A daily snapshot will be created at 03:00 in your league's
            timezone
          </li>
          <li>
            &bull; You can upload FanGraphs projections to get standings predictions
          </li>
          <li>&bull; View trends, get waiver recommendations, and analyze trades</li>
        </ul>
      </div>
    </div>
  );
}
