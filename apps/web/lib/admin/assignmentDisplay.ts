/**
 * Human-readable assignment line for admin ops (driven by `assignment_type` + row state).
 */
export function assignmentSourceLabel(input: {
  cleaner_id: string | null;
  status: string | null;
  assignment_type?: string | null;
}): string | null {
  const at = String(input.assignment_type ?? "").toLowerCase();
  const st = String(input.status ?? "").toLowerCase();
  const hasCleaner = Boolean(input.cleaner_id?.trim());

  if (at === "user_selected" && hasCleaner) return "Assigned (user selected)";
  if (at === "auto_fallback" && hasCleaner) return "Assigned (fallback)";
  if (at === "auto_dispatch" && hasCleaner) return "Assigned (auto)";
  if (hasCleaner && (st === "assigned" || st === "pending")) {
    return st === "assigned" ? "Assigned" : "Cleaner set";
  }
  return null;
}
