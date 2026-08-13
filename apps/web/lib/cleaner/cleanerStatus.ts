export const CLEANER_STATUSES = ["available", "busy", "unavailable", "day_off", "sick", "leave", "training", "suspended", "inactive", "offline"] as const;

export type CleanerStatus = (typeof CLEANER_STATUSES)[number];

export const CLEANER_STATUS_LABELS: Record<CleanerStatus, string> = {
  available: "Available",
  busy: "Busy",
  unavailable: "Unavailable",
  day_off: "Day Off",
  sick: "Sick",
  leave: "Leave",
  training: "Training",
  suspended: "Suspended",
  inactive: "Inactive",
  offline: "Offline",
};

export const CLEANER_MANUAL_UNAVAILABLE_STATUSES = new Set<CleanerStatus>([
  "unavailable", "day_off", "sick", "leave", "training", "suspended", "inactive", "offline",
]);

export function normalizeCleanerStatus(raw: string | null | undefined): CleanerStatus | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return (CLEANER_STATUSES as readonly string[]).includes(value) ? (value as CleanerStatus) : null;
}

export function cleanerStatusAllowsDispatch(status: CleanerStatus): boolean {
  return status === "available" || status === "busy";
}

export function cleanerStatusIsManuallyUnavailable(status: CleanerStatus | null): boolean {
  return status != null && CLEANER_MANUAL_UNAVAILABLE_STATUSES.has(status);
}
