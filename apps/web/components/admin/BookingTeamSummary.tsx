export type AdminBookingRosterMember = {
  cleaner_id: string;
  full_name: string | null;
  role: string;
};

type Props = {
  /** When set, team template name (from `teams.name`). */
  teamId?: string | null;
  teamName?: string | null;
  /** Canonical roster from `booking_cleaners` (+ cleaner names). */
  bookingCleaners: readonly AdminBookingRosterMember[];
};

function rosterTooltip(roster: readonly AdminBookingRosterMember[]): string {
  if (!roster.length) return "";
  return roster
    .map((m) => {
      const n = m.full_name?.trim() || "Cleaner";
      return m.role === "lead" ? `${n} (lead)` : n;
    })
    .join(", ");
}

/**
 * Admin list: team context + roster count. Roster length is source of truth; `team_id` is display context only.
 */
export function BookingTeamSummary({ teamId, teamName, bookingCleaners }: Props) {
  const count = bookingCleaners.length;
  if (count === 0) {
    return (
      <div className="text-sm text-zinc-400 dark:text-zinc-500" title="No rows in booking_cleaners yet">
        Unassigned
      </div>
    );
  }

  const hasTeam = Boolean(teamId?.trim());
  const titleLine = rosterTooltip(bookingCleaners);
  const headline = hasTeam ? (teamName?.trim() ? teamName.trim() : "Team") : "Custom team";
  const lead = bookingCleaners.find((c) => String(c.role).toLowerCase() === "lead");
  const leadName = lead?.full_name?.trim() || null;

  return (
    <div className="flex flex-col gap-0.5" title={titleLine || undefined}>
      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{headline}</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        <span aria-hidden className="mr-0.5">
          👥
        </span>
        {count} cleaner{count === 1 ? "" : "s"}
      </span>
      {leadName ? <span className="text-xs text-zinc-400 dark:text-zinc-500">Lead: {leadName}</span> : null}
    </div>
  );
}
