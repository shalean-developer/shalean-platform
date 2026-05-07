import { parseBookingServiceId } from "@/components/booking/serviceCategories";

/** Service types that require explicit cleaner capability columns. */
export type ServiceCapabilityGate = "deep" | "move";

export function serviceCapabilityGateFromBookingFields(
  serviceSlug: string | null | undefined,
  serviceLabel: string | null | undefined,
): ServiceCapabilityGate | null {
  const slug = String(serviceSlug ?? "").trim().toLowerCase();
  if (slug) {
    const sid = parseBookingServiceId(slug);
    if (sid === "deep") return "deep";
    if (sid === "move") return "move";
  }
  const label = String(serviceLabel ?? "").trim().toLowerCase();
  if (label.includes("move")) return "move";
  if (label.includes("deep")) return "deep";
  return null;
}

export type CleanerServiceCapabilityColumns = {
  can_do_deep_cleaning?: boolean | null;
  can_do_move_cleaning?: boolean | null;
};

/**
 * When gate is null, all cleaners pass. Missing columns / null count as allowed (legacy rows).
 */
export function cleanerPassesServiceCapabilityGate(
  c: CleanerServiceCapabilityColumns,
  gate: ServiceCapabilityGate | null,
): boolean {
  if (!gate) return true;
  if (gate === "deep") return (c.can_do_deep_cleaning ?? true) !== false;
  return (c.can_do_move_cleaning ?? true) !== false;
}

/** Teams table `teams.service_type` → same gate as individual dispatch for deep/move jobs. */
export function serviceCapabilityGateFromTeamServiceType(
  serviceType: "deep_cleaning" | "move_cleaning",
): ServiceCapabilityGate {
  return serviceType === "move_cleaning" ? "move" : "deep";
}

/** At least one active roster cleaner must pass the gate when `gate` is set. */
export function activeRosterHasServiceQualifiedMember(
  activeCleanerIds: readonly string[],
  capMap: Map<string, CleanerServiceCapabilityColumns>,
  gate: ServiceCapabilityGate | null,
): boolean {
  if (!gate) return activeCleanerIds.length > 0;
  if (activeCleanerIds.length === 0) return false;
  return activeCleanerIds.some((id) => cleanerPassesServiceCapabilityGate(capMap.get(id) ?? {}, gate));
}

/** Count distinct cleaners in `cleanerIds` that pass the gate (gate null → full count). */
export function countCleanersPassingServiceCapabilityGate(
  cleanerIds: readonly string[],
  capabilityByCleanerId: Map<string, CleanerServiceCapabilityColumns>,
  gate: ServiceCapabilityGate | null,
): number {
  if (!gate) return cleanerIds.length;
  let n = 0;
  for (const id of cleanerIds) {
    if (cleanerPassesServiceCapabilityGate(capabilityByCleanerId.get(id) ?? {}, gate)) n++;
  }
  return n;
}
