"use client";

import { Container } from "@/components/ui/Container";
import { Heading } from "@/components/ui/Heading";

interface RosterPlayer {
  player_id: number;
  player_name: string;
  mlb_team: string | null;
  positions: string[];
  roster_status: string;
  roster_slot: string | null;
  acquisition_type: string | null;
}

interface GroupedRoster {
  active: RosterPlayer[];
  bench: RosterPlayer[];
  il: RosterPlayer[];
}

interface RosterSectionProps {
  groupedRoster: GroupedRoster | null;
  hasRosterData: boolean;
}

export function RosterSection({ groupedRoster, hasRosterData }: RosterSectionProps) {
  return (
    <section className="bg-white py-10">
      <Container size="wide">
        <Heading level={2} className="mb-6">Roster</Heading>
        {hasRosterData && groupedRoster ? (
          <div className="space-y-6">
            {/* Active Lineup */}
            {groupedRoster.active.length > 0 && (
              <div>
                <h3 className="text-body-sm font-semibold text-content-secondary uppercase tracking-wider mb-2">
                  Active Lineup ({groupedRoster.active.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-200">
                    <thead className="bg-surface-secondary">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase w-16">
                          Slot
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase">
                          Player
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase">
                          Team
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase">
                          Positions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {groupedRoster.active.map((p) => (
                        <tr key={p.player_id}>
                          <td className="px-4 py-2 text-body-sm font-medium text-content-secondary w-16">
                            {p.roster_slot}
                          </td>
                          <td className="px-4 py-2 text-body-sm font-medium text-content">
                            {p.player_name}
                          </td>
                          <td className="px-4 py-2 text-body-sm text-content-secondary">
                            {p.mlb_team || "-"}
                          </td>
                          <td className="px-4 py-2 text-body-sm text-content-secondary">
                            {(p.positions || []).join(", ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Bench */}
            {groupedRoster.bench.length > 0 && (
              <div>
                <h3 className="text-body-sm font-semibold text-content-secondary uppercase tracking-wider mb-2">
                  Bench ({groupedRoster.bench.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-200">
                    <thead className="bg-surface-secondary">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase w-16">
                          Slot
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase">
                          Player
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase">
                          Team
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase">
                          Positions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {groupedRoster.bench.map((p) => (
                        <tr key={p.player_id}>
                          <td className="px-4 py-2 text-body-sm font-medium text-content-tertiary w-16">
                            BE
                          </td>
                          <td className="px-4 py-2 text-body-sm font-medium text-content">
                            {p.player_name}
                          </td>
                          <td className="px-4 py-2 text-body-sm text-content-secondary">
                            {p.mlb_team || "-"}
                          </td>
                          <td className="px-4 py-2 text-body-sm text-content-secondary">
                            {(p.positions || []).join(", ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Injured List */}
            {groupedRoster.il.length > 0 && (
              <div>
                <h3 className="text-body-sm font-semibold text-negative uppercase tracking-wider mb-2">
                  Injured List ({groupedRoster.il.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-200">
                    <thead className="bg-negative-light">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-negative uppercase w-16">
                          Slot
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-negative uppercase">
                          Player
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-negative uppercase">
                          Team
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-negative uppercase">
                          Positions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {groupedRoster.il.map((p) => (
                        <tr key={p.player_id} className="bg-negative-light/30">
                          <td className="px-4 py-2 text-body-sm font-medium text-negative w-16">
                            IL
                          </td>
                          <td className="px-4 py-2 text-body-sm font-medium text-content">
                            {p.player_name}
                          </td>
                          <td className="px-4 py-2 text-body-sm text-content-secondary">
                            {p.mlb_team || "-"}
                          </td>
                          <td className="px-4 py-2 text-body-sm text-content-secondary">
                            {(p.positions || []).join(", ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-body-sm text-content-secondary">
            No roster data available for this snapshot.
          </p>
        )}
      </Container>
    </section>
  );
}
