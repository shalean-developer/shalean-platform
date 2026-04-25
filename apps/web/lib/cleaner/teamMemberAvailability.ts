/** Booking calendar day as UTC window — matches dispatch team capacity logic. */
export function bookingDateUtcWindow(dateYmd: string): { startIso: string; endIso: string } {
  const ymd = String(dateYmd ?? "").trim().slice(0, 10);
  const startIso = `${ymd}T00:00:00.000Z`;
  const endIso = `${ymd}T23:59:59.999Z`;
  return { startIso, endIso };
}

export type TeamMemberAvailabilityRow = {
  active_from?: string | null;
  active_to?: string | null;
  cleaner_id?: string | null;
};

/** Whether this membership row counts as active for work on `dateYmd` (YYYY-MM-DD). */
export function isTeamMemberActiveOnBookingDate(row: TeamMemberAvailabilityRow, dateYmd: string): boolean {
  const { startIso, endIso } = bookingDateUtcWindow(dateYmd);
  const from = row.active_from ?? null;
  const to = row.active_to ?? null;
  if (from && from > endIso) return false;
  if (to && to < startIso) return false;
  return true;
}

/** Count roster cleaners active on the booking date (caller usually pre-filters by team_id). */
export function countActiveTeamMembersOnDate(
  members: TeamMemberAvailabilityRow[],
  dateYmd: string,
): number {
  const d = String(dateYmd ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 0;
  return members.filter((m) => m.cleaner_id != null && String(m.cleaner_id).trim() !== "").filter((m) =>
    isTeamMemberActiveOnBookingDate(m, d),
  ).length;
}
