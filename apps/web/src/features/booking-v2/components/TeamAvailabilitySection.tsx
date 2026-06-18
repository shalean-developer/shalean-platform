"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { TeamCard } from "@/src/features/booking-v2/components/TeamCard";

type Team = { id: string; name: string; available: boolean };

type TeamAvailabilityData = {
  available: boolean;
  teams: Team[];
};

function useTeamAvailability(date: string, serviceSlug: string) {
  const [data, setData] = useState<TeamAvailabilityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/booking-v2/team-availability?date=${date}&service=${serviceSlug}`)
      .then((r) => r.json())
      .then((json: TeamAvailabilityData) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not check team availability. Please try again.");
        setLoading(false);
      });
  }, [date, serviceSlug]);

  return { data, loading, error };
}

type Props = {
  date: string;
  serviceSlug: string;
  selectedTeamId: string;
  onSelect: (teamId: string) => void;
};

export function TeamAvailabilitySection({
  date,
  serviceSlug,
  selectedTeamId,
  onSelect,
}: Props) {
  const { data: teamAvail, loading, error } = useTeamAvailability(date, serviceSlug);

  return (
    <div className="space-y-4">
      {/* Heading */}
      <div className="text-center">
        <h3 className="text-sm font-semibold text-slate-900">Team availability</h3>
        <p className="mt-1 text-xs text-slate-500">
          We&apos;ll assign an available cleaning team for this service.
        </p>
      </div>

      {/* No date selected */}
      {!date && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
          Select a date above to check team availability.
        </p>
      )}

      {/* Loading */}
      {date && loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Checking team availability…
        </div>
      )}

      {/* Error */}
      {date && error && !loading && (
        <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Result */}
      {date && teamAvail && !loading && (
        <>
          {!teamAvail.available ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
              <AlertCircle
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
                aria-hidden
              />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  No team available for this date
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  All 3 teams are booked for {date}. Please choose a different date.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {teamAvail.teams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  isSelected={selectedTeamId === team.id}
                  onSelect={() => team.available && onSelect(team.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
