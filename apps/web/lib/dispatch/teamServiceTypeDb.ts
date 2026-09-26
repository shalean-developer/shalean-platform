/** Normalize `teams.service_type` from Postgres (canonical, legacy codes, or human labels). */
export function normalizeTeamServiceTypeFromDb(raw: string | null | undefined): "deep_cleaning" | "move_cleaning" | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\//g, "_")
    .replace(/\s+/g, "_")
    .replace(/-/g, "_")
    .replace(/_+/g, "_");

  const moveAliases = new Set([
    "move_cleaning",
    "move",
    "move_in_out",
    "move_in_out_cleaning",
    "move_out",
    "move_out_cleaning",
    "moveinout",
  ]);
  const deepAliases = new Set(["deep_cleaning", "deep", "deep_clean"]);

  if (moveAliases.has(s)) return "move_cleaning";
  if (deepAliases.has(s)) return "deep_cleaning";

  if (s.startsWith("move_cleaning") || s.startsWith("move_in_out")) return "move_cleaning";
  if (s.startsWith("deep_cleaning") || s.startsWith("deep_clean")) return "deep_cleaning";

  return null;
}

/** Canonical + short codes useful for SQL patches / migrations (exact DB match only). */
export function teamServiceTypeDatabaseValues(st: "deep_cleaning" | "move_cleaning"): string[] {
  return st === "move_cleaning" ? ["move_cleaning", "move"] : ["deep_cleaning", "deep"];
}

/** Deep and move bookings share one ops team pool (`teams.service_type` deep_cleaning or move_cleaning). */
export function isDispatchTeamPoolServiceType(raw: string | null | undefined): boolean {
  const n = normalizeTeamServiceTypeFromDb(raw);
  return n === "deep_cleaning" || n === "move_cleaning";
}


/** True when a persisted team belongs to the requested Booking V2 team service. */
export function teamServiceTypeMatchesBookingV2Slug(
  raw: string | null | undefined,
  serviceSlug: string | null | undefined,
): boolean {
  const normalizedTeam = normalizeTeamServiceTypeFromDb(raw);
  const normalizedService = String(serviceSlug ?? "").trim().toLowerCase();
  if (normalizedService === "deep-cleaning") return normalizedTeam === "deep_cleaning";
  if (normalizedService === "moving-cleaning") return normalizedTeam === "move_cleaning";
  return false;
}
