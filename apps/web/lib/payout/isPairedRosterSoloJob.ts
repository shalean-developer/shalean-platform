/** Client-safe paired roster detection (no server-only imports). */

export type PairedRosterDetectRow = { cleaner_id?: string | null };

const UUID_RE = /^[0-9a-f-]{36}$/i;

function isUuidCleanerId(id: string): boolean {
  return UUID_RE.test(String(id ?? "").trim());
}

/** Distinct roster cleaner ids from `booking_cleaners` rows. */
export function resolveRosterParticipantIds(rosterRows: readonly PairedRosterDetectRow[]): string[] {
  return [
    ...new Set(
      rosterRows
        .map((r) => String(r.cleaner_id ?? "").trim())
        .filter(isUuidCleanerId),
    ),
  ];
}

/** Solo booking with 2+ cleaners on `booking_cleaners` (paired / dual-cleaner job). */
export function isPairedRosterSoloJob(params: {
  isTeamJob?: boolean | null;
  rosterRows: readonly PairedRosterDetectRow[];
}): boolean {
  if (params.isTeamJob === true) return false;
  return resolveRosterParticipantIds(params.rosterRows).length >= 2;
}
