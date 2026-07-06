/**
 * Display labels for `cleaners.status` workload values.
 *
 * Stored values stay `available` | `busy` | `offline` — only UI copy is centralized
 * here so office/admin surfaces stay aligned with booking lifecycle language
 * ("In progress" instead of "Busy").
 */

export type CleanerWorkloadStatus = "available" | "busy" | "offline";

export const CLEANER_WORKLOAD_STATUS_LABELS: Record<CleanerWorkloadStatus, string> = {
  available: "Available",
  busy: "In progress",
  offline: "Offline",
};

export function normalizeCleanerWorkloadStatus(
  raw: string | null | undefined,
): CleanerWorkloadStatus | null {
  const st = String(raw ?? "").trim().toLowerCase();
  if (st === "available" || st === "busy" || st === "offline") return st;
  return null;
}

/**
 * Label for admin/office lists from `cleaners.status` and optional `is_available`.
 * Manual pause (`is_available === false`) reads as Offline, matching list filters.
 */
export function cleanerWorkloadStatusLabel(
  status: string | null | undefined,
  isAvailable?: boolean | null,
): string {
  if (isAvailable === false) return CLEANER_WORKLOAD_STATUS_LABELS.offline;
  const st = normalizeCleanerWorkloadStatus(status);
  if (st) return CLEANER_WORKLOAD_STATUS_LABELS[st];
  return CLEANER_WORKLOAD_STATUS_LABELS.available;
}

/** Tailwind badge classes aligned with office booking status chips. */
export function cleanerWorkloadStatusBadgeClass(
  status: string | null | undefined,
  isAvailable?: boolean | null,
): string {
  if (isAvailable === false || normalizeCleanerWorkloadStatus(status) === "offline") {
    return "bg-slate-100 text-slate-700";
  }
  if (normalizeCleanerWorkloadStatus(status) === "busy") {
    return "bg-violet-100 text-violet-700";
  }
  return "bg-emerald-100 text-emerald-700";
}

/** Replacement-ranking availability enum → human label. */
export function replacementAvailabilityDisplayLabel(label: string): string {
  switch (label) {
    case "available":
      return CLEANER_WORKLOAD_STATUS_LABELS.available;
    case "busy":
      return CLEANER_WORKLOAD_STATUS_LABELS.busy;
    case "unavailable":
      return "Unavailable";
    default:
      return "Unavailable";
  }
}
