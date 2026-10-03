/**
 * Cleaner jobs list retention policy.
 *
 * Operational invariant: never let completed/cancelled history push an open job out of the
 * bounded jobs payload. Open rows are kept first; only history is trimmed, newest first.
 * If a cleaner somehow has more open rows than maxRows, all open rows are returned rather
 * than hiding assigned work.
 */

type JobRow = Record<string, unknown>;

function statusOf(row: JobRow): string {
  return String(row.status ?? "").trim().toLowerCase();
}

function dateOf(row: JobRow): string {
  return String(row.date ?? "").trim().slice(0, 10);
}

function timeOf(row: JobRow): string {
  return String(row.time ?? "").trim();
}

function openRank(row: JobRow): number {
  switch (statusOf(row)) {
    case "in_progress":
      return 0;
    case "en_route":
      return 1;
    case "assigned":
      return 2;
    case "pending_assignment":
      return 3;
    case "offered":
      return 4;
    case "pending":
      return 5;
    case "pending_payment":
      return 6;
    default:
      return 7;
  }
}

function isHistorical(row: JobRow): boolean {
  const status = statusOf(row);
  return status === "completed" || status === "cancelled" || status === "failed" || status === "payment_expired";
}

function sortOpen(a: JobRow, b: JobRow): number {
  const rank = openRank(a) - openRank(b);
  if (rank !== 0) return rank;
  const dateCmp = dateOf(a).localeCompare(dateOf(b));
  if (dateCmp !== 0) return dateCmp;
  return timeOf(a).localeCompare(timeOf(b));
}

function sortHistoryNewestFirst(a: JobRow, b: JobRow): number {
  const aCompleted = String(a.completed_at ?? "");
  const bCompleted = String(b.completed_at ?? "");
  if (aCompleted || bCompleted) {
    const completedCmp = bCompleted.localeCompare(aCompleted);
    if (completedCmp !== 0) return completedCmp;
  }
  const dateCmp = dateOf(b).localeCompare(dateOf(a));
  if (dateCmp !== 0) return dateCmp;
  const timeCmp = timeOf(b).localeCompare(timeOf(a));
  if (timeCmp !== 0) return timeCmp;
  return String(b.id ?? "").localeCompare(String(a.id ?? ""));
}

export function prioritizeCleanerJobsForList(
  rows: readonly JobRow[],
  maxRows = 100,
): JobRow[] {
  const byId = new Map<string, JobRow>();
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    byId.set(id, row);
  }

  const deduped = [...byId.values()];
  const open = deduped.filter((row) => !isHistorical(row)).sort(sortOpen);
  const history = deduped.filter(isHistorical).sort(sortHistoryNewestFirst);

  const safeMax = Math.max(1, Math.floor(maxRows));
  if (open.length >= safeMax) return open;

  return [...open, ...history.slice(0, safeMax - open.length)];
}
