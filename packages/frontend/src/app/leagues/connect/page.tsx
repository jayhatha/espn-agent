"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRightIcon, InfoIcon, Loader2Icon } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/Container";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

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
      <Container size="narrow" className="py-8">
        <Card>
          <CardHeader>
            <Heading level={2}>Select Your Team</Heading>
            <Text size="sm" color="secondary" className="mt-1">
              Which team is yours? We'll use this to personalize your dashboard and recommendations.
            </Text>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {teams.map((team) => (
                <button
                  key={team.espnTeamId}
                  type="button"
                  onClick={() => setSelectedTeamEspnId(team.espnTeamId)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-lg border-2 transition-colors",
                    selectedTeamEspnId === team.espnTeamId
                      ? "border-accent bg-accent-light"
                      : "border-neutral-200 hover:border-neutral-300"
                  )}
                >
                  <span className="font-medium text-content">{team.name}</span>
                </button>
              ))}
            </div>

            {connectMutation.isError && (
              <div className="mt-4 bg-negative-light border border-negative-border rounded-lg p-4">
                <p className="text-body-sm text-negative">
                  {(connectMutation.error as Error).message}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => { setStep("form"); connectMutation.reset(); }}
                className="text-sm font-medium text-content-secondary hover:text-content"
              >
                Back
              </button>
              <Button
                type="button"
                onClick={handleTeamSelect}
                disabled={!selectedTeamEspnId || connectMutation.isPending}
              >
                {connectMutation.isPending ? "Connecting..." : "Confirm & Connect"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="narrow" className="py-8">
      <div className="mb-6">
        <Link
          href="/leagues"
          className="text-sm font-medium text-content-secondary hover:text-content transition-colors"
        >
          &larr; Back to Leagues
        </Link>
      </div>

      <Card>
        <CardHeader>
          <Heading level={2}>Connect ESPN League</Heading>
          <Text size="sm" color="secondary" className="mt-1">
            Enter your ESPN Fantasy Baseball league details to start tracking your team.
          </Text>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ESPN League ID */}
            <div>
              <label
                htmlFor="espnLeagueId"
                className="block text-body-sm font-medium text-content mb-1"
              >
                ESPN League ID *
              </label>
              <Input
                type="number"
                id="espnLeagueId"
                name="espnLeagueId"
                required
                value={formData.espnLeagueId}
                onChange={handleChange}
                placeholder="123456"
              />
              <Text size="sm" color="tertiary" className="mt-1">
                Find this in your league URL: fantasy.espn.com/baseball/league?leagueId=
                <strong className="text-content">123456</strong>
              </Text>
            </div>

            {/* Season */}
            <div>
              <label
                htmlFor="season"
                className="block text-body-sm font-medium text-content mb-1"
              >
                Season *
              </label>
              <Input
                type="number"
                id="season"
                name="season"
                required
                value={formData.season}
                onChange={handleChange}
                placeholder="2024"
                min="2020"
                max={new Date().getFullYear() + 1}
              />
            </div>

            {/* League Name (Optional) */}
            <div>
              <label
                htmlFor="name"
                className="block text-body-sm font-medium text-content mb-1"
              >
                League Name (Optional)
              </label>
              <Input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Will be fetched from ESPN if not provided"
              />
            </div>

            {/* Timezone */}
            <div>
              <label
                htmlFor="timezone"
                className="block text-body-sm font-medium text-content mb-1"
              >
                Timezone
              </label>
              <Select
                id="timezone"
                name="timezone"
                value={formData.timezone}
                onChange={handleChange}
              >
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
              </Select>
              <Text size="sm" color="tertiary" className="mt-1">
                Used for daily snapshot timing (03:00 in this timezone)
              </Text>
            </div>

            {/* Advanced Options - Private League Auth */}
            <div className="border-t border-neutral-200 pt-6">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center text-body-sm font-medium text-content hover:text-content-secondary transition-colors"
              >
                <ChevronRightIcon
                  className={cn(
                    "mr-2 h-5 w-5 transform transition-transform",
                    showAdvanced ? "rotate-90" : ""
                  )}
                />
                Private League Authentication (Optional)
              </button>
              <Text size="sm" color="tertiary" className="mt-1 ml-7">
                Required for private leagues. For public leagues, we'll ask you to pick your team in the next step.
              </Text>

              {showAdvanced && (
                <div className="mt-4 space-y-4 bg-surface-secondary p-4 rounded-lg">
                  <Text size="sm" color="secondary">
                    If your league is private, you'll need to provide authentication cookies from ESPN.{" "}
                    <a
                      href="https://github.com/cwendt94/espn-api/wiki/ESPN-Fantasy-Football-Cookies"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-content hover:underline font-medium"
                    >
                      How to find these cookies &rarr;
                    </a>
                  </Text>

                  <div>
                    <label
                      htmlFor="swid"
                      className="block text-body-sm font-medium text-content mb-1"
                    >
                      SWID Cookie
                    </label>
                    <Input
                      type="text"
                      id="swid"
                      name="swid"
                      value={formData.swid}
                      onChange={handleChange}
                      placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                      className="font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="espn_s2"
                      className="block text-body-sm font-medium text-content mb-1"
                    >
                      espn_s2 Cookie
                    </label>
                    <Input
                      type="text"
                      id="espn_s2"
                      name="espn_s2"
                      value={formData.espn_s2}
                      onChange={handleChange}
                      placeholder="AEB..."
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {connectMutation.isError && (
              <div className="bg-negative-light border border-negative-border rounded-lg p-4">
                <h3 className="text-negative font-medium">Connection Failed</h3>
                <p className="text-body-sm text-negative mt-1">
                  {(connectMutation.error as Error).message}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex items-center justify-between pt-4">
              <Link
                href="/leagues"
                className="text-body-sm font-medium text-content-secondary hover:text-content transition-colors"
              >
                Cancel
              </Link>
              <Button
                type="submit"
                size="lg"
                disabled={
                  connectMutation.isPending ||
                  !formData.espnLeagueId ||
                  !formData.season
                }
              >
                {connectMutation.isPending ? (
                  <>
                    <Loader2Icon className="animate-spin -ml-1 mr-3 h-5 w-5" />
                    Connecting...
                  </>
                ) : (
                  "Connect League"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Info Box */}
      <div className="mt-6 bg-info-light border border-info-border rounded-lg p-4">
        <h3 className="text-body-sm font-medium text-info flex items-center">
          <InfoIcon className="mr-2 h-5 w-5" />
          What happens after connecting?
        </h3>
        <ul className="mt-2 text-body-sm text-info space-y-1 ml-7">
          <li>&bull; We'll fetch your league settings and validate the connection</li>
          <li>&bull; A daily snapshot will be created at 03:00 in your league's timezone</li>
          <li>&bull; You can upload FanGraphs projections to get standings predictions</li>
          <li>&bull; View trends, get waiver recommendations, and analyze trades</li>
        </ul>
      </div>
    </Container>
  );
}
