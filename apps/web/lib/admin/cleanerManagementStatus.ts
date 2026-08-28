export type CleanerManagementStatusInput = {
  status?: string | null;
  is_available?: boolean | null;
  is_active?: boolean | null;
};

export type CleanerManagementStatus = "available" | "busy" | "offline";

/**
 * Canonical three-state projection for Office Cleaner Management.
 * Lifecycle inactivity or any non-dispatch state is Offline; Busy remains
 * distinct; only an active, dispatchable Available row is shown Available.
 */
export function cleanerManagementStatus(row: CleanerManagementStatusInput): CleanerManagementStatus {
  const rawStatus = String(row.status ?? "").trim().toLowerCase();
  const lifecycleActive = row.is_active !== false;
  const dispatchAvailable = row.is_available === true;

  if (!lifecycleActive || !dispatchAvailable) return "offline";
  if (rawStatus === "busy") return "busy";
  if (rawStatus === "available") return "available";
  return "offline";
}
