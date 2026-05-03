/**
 * Stable account-health tier from `cleaners.status` (and related rules).
 * Prefer exact matches first; add new DB statuses here instead of inferring in UI.
 */
export type CleanerAccountHealthTier = "active" | "pending_verification" | "action_required";

export type AccountHealthBadgeVariant = "success" | "warning" | "destructive";

const ACTION_REQUIRED = new Set(["blocked", "suspended", "banned", "disabled"]);

export function mapCleanerAccountHealthTier(raw: string | null | undefined): CleanerAccountHealthTier {
  const s = String(raw ?? "").trim().toLowerCase();
  if (ACTION_REQUIRED.has(s)) return "action_required";
  if (s.startsWith("pending")) return "pending_verification";
  return "active";
}

export function accountHealthBadge(tier: CleanerAccountHealthTier): {
  variant: AccountHealthBadgeVariant;
  label: string;
  lineClass: string;
} {
  switch (tier) {
    case "action_required":
      return {
        variant: "destructive",
        label: "Action required",
        lineClass: "text-red-600 dark:text-red-400",
      };
    case "pending_verification":
      return {
        variant: "warning",
        label: "Pending verification",
        lineClass: "text-amber-600 dark:text-amber-500",
      };
    default:
      return {
        variant: "success",
        label: "Active",
        lineClass: "text-emerald-600 dark:text-emerald-400",
      };
  }
}
