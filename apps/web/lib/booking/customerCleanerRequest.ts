/** Customer staffing intent is separate from confirmed assignment. Safe for browser and server. */
export type CustomerCleanerRequestRow = {
  cleaner_count?: number | null;
  selected_cleaner_id?: string | null;
  booking_snapshot?: unknown;
  cleaner_mode?: string | null;
  is_team_job?: boolean | null;
  team_id?: string | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function customerCleanerRequest(row: CustomerCleanerRequestRow) {
  const snapshot = row.booking_snapshot && typeof row.booking_snapshot === "object" && !Array.isArray(row.booking_snapshot)
    ? row.booking_snapshot as Record<string, unknown> : {};
  const raw = Array.isArray(snapshot.selectedCleanerIds) ? snapshot.selectedCleanerIds : [];
  const preferredIds = [...new Set(raw.filter((x): x is string => typeof x === "string" && uuid.test(x.trim())).map(x => x.trim().toLowerCase()))];
  const lead = String(row.selected_cleaner_id ?? "").trim().toLowerCase();
  if (!preferredIds.length && uuid.test(lead)) preferredIds.push(lead);
  const counts = [row.cleaner_count, snapshot.cleanerCount, preferredIds.length].map(Number).filter(n => Number.isInteger(n) && n > 0);
  const count = Math.max(1, ...counts);
  return { count, preferredIds, needsRoster: count > 1 && row.cleaner_mode !== "team" && !row.is_team_job && !row.team_id };
}
