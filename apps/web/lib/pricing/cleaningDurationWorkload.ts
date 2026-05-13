import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { BOOKING_SERVICE_IDS, parseBookingServiceId } from "@/components/booking/serviceCategories";
import { BOOKING_EXTRA_ID_SET } from "@/lib/pricing/extrasConfig";

export type DurationEffectKind =
  | "adds_duration"
  | "no_duration_effect"
  | "workload_multiplier_only"
  | "team_scaling_modifier";

export type OperationalComplexity = "routine" | "elevated" | "heavy" | "specialized" | "large_property";

export type TeamScalingBehavior =
  | "single_cleaner_default"
  | "partial_parallel"
  | "lead_plus_roster"
  | "requested_extra_cleaner"
  | "not_team_scaled";

export type ServiceDurationPolicy = {
  serviceId: BookingServiceId;
  label: string;
  durationBasis: "room_based" | "turnover_room_based" | "heavy_room_based" | "carpet_area_proxy";
  baseMinutes: number;
  bedroomMinutes: number;
  bathroomMinutes: number;
  extraRoomMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  workloadBase: number;
  bedroomWorkload: number;
  bathroomWorkload: number;
  extraRoomWorkload: number;
  operationalComplexity: OperationalComplexity;
  teamScalable: boolean;
  teamScalingBehavior: TeamScalingBehavior;
  recurringSnapshotCompatibility: "compatible" | "requires_snapshot_parity_check" | "legacy_only";
};

export type ExtraDurationPolicy = {
  slug: string;
  durationEffect: DurationEffectKind;
  durationMinutes: number;
  workloadDelta: number;
  workloadMultiplier: number;
  teamScalable: boolean;
  teamScalingBehavior: TeamScalingBehavior;
  operationalComplexity?: OperationalComplexity;
};

export type DurationWorkloadInput = {
  service: BookingServiceId | string | null | undefined;
  rooms: number;
  bathrooms: number;
  extraRooms?: number | null;
  extras?: readonly string[] | null;
  teamMemberCount?: number | null;
  recurringSnapshotDurationMinutes?: number | null;
};

export type ResolvedExtraDuration = ExtraDurationPolicy & {
  count: number;
};

export type DurationWorkloadResult = {
  service: BookingServiceId;
  duration_minutes: number;
  raw_duration_minutes: number;
  workload_weight: number;
  operational_complexity: OperationalComplexity;
  team_scalable: boolean;
  team_scaling_behavior: TeamScalingBehavior;
  team_member_count: number;
  team_scaled_duration_minutes: number;
  recurring_snapshot_compatible: boolean;
  recurring_snapshot_delta_minutes: number | null;
  guards: string[];
  service_policy: ServiceDurationPolicy;
  extra_effects: ResolvedExtraDuration[];
  unknown_extras: string[];
};

const SERVICE_DURATION_POLICIES: Record<BookingServiceId, ServiceDurationPolicy> = {
  quick: {
    serviceId: "quick",
    label: "Quick Clean",
    durationBasis: "room_based",
    baseMinutes: 120,
    bedroomMinutes: 20,
    bathroomMinutes: 20,
    extraRoomMinutes: 12,
    minMinutes: 90,
    maxMinutes: 300,
    workloadBase: 0.8,
    bedroomWorkload: 0.12,
    bathroomWorkload: 0.12,
    extraRoomWorkload: 0.06,
    operationalComplexity: "routine",
    teamScalable: false,
    teamScalingBehavior: "single_cleaner_default",
    recurringSnapshotCompatibility: "legacy_only",
  },
  standard: {
    serviceId: "standard",
    label: "Standard Cleaning",
    durationBasis: "room_based",
    baseMinutes: 180,
    bedroomMinutes: 30,
    bathroomMinutes: 30,
    extraRoomMinutes: 18,
    minMinutes: 120,
    maxMinutes: 540,
    workloadBase: 1,
    bedroomWorkload: 0.18,
    bathroomWorkload: 0.18,
    extraRoomWorkload: 0.1,
    operationalComplexity: "routine",
    teamScalable: true,
    teamScalingBehavior: "partial_parallel",
    recurringSnapshotCompatibility: "compatible",
  },
  airbnb: {
    serviceId: "airbnb",
    label: "Airbnb Cleaning",
    durationBasis: "turnover_room_based",
    baseMinutes: 210,
    bedroomMinutes: 25,
    bathroomMinutes: 30,
    extraRoomMinutes: 15,
    minMinutes: 150,
    maxMinutes: 540,
    workloadBase: 1.15,
    bedroomWorkload: 0.16,
    bathroomWorkload: 0.2,
    extraRoomWorkload: 0.08,
    operationalComplexity: "elevated",
    teamScalable: true,
    teamScalingBehavior: "partial_parallel",
    recurringSnapshotCompatibility: "compatible",
  },
  deep: {
    serviceId: "deep",
    label: "Deep Cleaning",
    durationBasis: "heavy_room_based",
    baseMinutes: 240,
    bedroomMinutes: 45,
    bathroomMinutes: 45,
    extraRoomMinutes: 30,
    minMinutes: 180,
    maxMinutes: 540,
    workloadBase: 1.8,
    bedroomWorkload: 0.32,
    bathroomWorkload: 0.34,
    extraRoomWorkload: 0.2,
    operationalComplexity: "heavy",
    teamScalable: true,
    teamScalingBehavior: "lead_plus_roster",
    recurringSnapshotCompatibility: "requires_snapshot_parity_check",
  },
  move: {
    serviceId: "move",
    label: "Move In/Out Cleaning",
    durationBasis: "heavy_room_based",
    baseMinutes: 240,
    bedroomMinutes: 45,
    bathroomMinutes: 45,
    extraRoomMinutes: 30,
    minMinutes: 180,
    maxMinutes: 540,
    workloadBase: 1.75,
    bedroomWorkload: 0.32,
    bathroomWorkload: 0.32,
    extraRoomWorkload: 0.2,
    operationalComplexity: "heavy",
    teamScalable: true,
    teamScalingBehavior: "lead_plus_roster",
    recurringSnapshotCompatibility: "requires_snapshot_parity_check",
  },
  carpet: {
    serviceId: "carpet",
    label: "Carpet Cleaning",
    durationBasis: "carpet_area_proxy",
    baseMinutes: 180,
    bedroomMinutes: 40,
    bathroomMinutes: 0,
    extraRoomMinutes: 25,
    minMinutes: 120,
    maxMinutes: 480,
    workloadBase: 1.35,
    bedroomWorkload: 0.28,
    bathroomWorkload: 0,
    extraRoomWorkload: 0.16,
    operationalComplexity: "specialized",
    teamScalable: true,
    teamScalingBehavior: "partial_parallel",
    recurringSnapshotCompatibility: "requires_snapshot_parity_check",
  },
};

const EXTRA_DURATION_POLICIES: Record<string, ExtraDurationPolicy> = {
  "inside-cabinets": durationExtra("inside-cabinets", 30, 0.25),
  "inside-oven": durationExtra("inside-oven", 45, 0.35),
  "inside-fridge": durationExtra("inside-fridge", 30, 0.25),
  "interior-walls": durationExtra("interior-walls", 60, 0.45, "elevated"),
  ironing: durationExtra("ironing", 30, 0.25),
  laundry: durationExtra("laundry", 30, 0.25),
  "interior-windows": durationExtra("interior-windows", 45, 0.35),
  "water-plants": durationExtra("water-plants", 15, 0.08),
  "balcony-cleaning": durationExtra("balcony-cleaning", 45, 0.35, "elevated"),
  "carpet-cleaning": durationExtra("carpet-cleaning", 60, 0.5, "specialized"),
  "ceiling-cleaning": durationExtra("ceiling-cleaning", 45, 0.4, "elevated"),
  "garage-cleaning": durationExtra("garage-cleaning", 45, 0.35, "elevated"),
  "mattress-cleaning": durationExtra("mattress-cleaning", 45, 0.35, "specialized"),
  "outside-windows": durationExtra("outside-windows", 45, 0.35, "elevated"),
  "extra-cleaner": {
    slug: "extra-cleaner",
    durationEffect: "team_scaling_modifier",
    durationMinutes: 0,
    workloadDelta: 0,
    workloadMultiplier: 1,
    teamScalable: true,
    teamScalingBehavior: "requested_extra_cleaner",
  },
  "supplies-kit": {
    slug: "supplies-kit",
    durationEffect: "no_duration_effect",
    durationMinutes: 0,
    workloadDelta: 0,
    workloadMultiplier: 1,
    teamScalable: false,
    teamScalingBehavior: "not_team_scaled",
  },
};

function durationExtra(
  slug: string,
  durationMinutes: number,
  workloadDelta: number,
  operationalComplexity?: OperationalComplexity,
): ExtraDurationPolicy {
  return {
    slug,
    durationEffect: "adds_duration",
    durationMinutes,
    workloadDelta,
    workloadMultiplier: 1,
    teamScalable: true,
    teamScalingBehavior: "partial_parallel",
    ...(operationalComplexity ? { operationalComplexity } : {}),
  };
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeExtras(extras: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of extras ?? []) {
    const slug = String(raw ?? "").trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function complexityRank(value: OperationalComplexity): number {
  switch (value) {
    case "routine":
      return 1;
    case "elevated":
      return 2;
    case "heavy":
      return 3;
    case "specialized":
      return 4;
    case "large_property":
      return 5;
  }
}

function maxComplexity(a: OperationalComplexity, b: OperationalComplexity): OperationalComplexity {
  return complexityRank(a) >= complexityRank(b) ? a : b;
}

function teamScaledDuration(durationMinutes: number, teamSize: number, teamScalable: boolean): number {
  if (!teamScalable || teamSize <= 1) return durationMinutes;
  const divisor = 1 + (teamSize - 1) * 0.65;
  return Math.max(60, Math.round(durationMinutes / divisor));
}

export function listCanonicalDurationServicePolicies(): ServiceDurationPolicy[] {
  return [...BOOKING_SERVICE_IDS].map((id) => SERVICE_DURATION_POLICIES[id]);
}

export function listCanonicalDurationExtraPolicies(): ExtraDurationPolicy[] {
  return [...BOOKING_EXTRA_ID_SET].map((slug) => EXTRA_DURATION_POLICIES[slug]).filter(Boolean);
}

export function getCanonicalDurationServicePolicy(
  service: BookingServiceId | string | null | undefined,
): ServiceDurationPolicy {
  const parsed = parseBookingServiceId(service) ?? "standard";
  return SERVICE_DURATION_POLICIES[parsed];
}

export function getCanonicalDurationExtraPolicy(slug: string): ExtraDurationPolicy | null {
  return EXTRA_DURATION_POLICIES[String(slug ?? "").trim()] ?? null;
}

export function resolveCanonicalDurationWorkload(input: DurationWorkloadInput): DurationWorkloadResult {
  const servicePolicy = getCanonicalDurationServicePolicy(input.service);
  const rooms = clampInt(input.rooms, 1, 1, 25);
  const bathrooms = clampInt(input.bathrooms, 1, 1, 25);
  const extraRooms = clampInt(input.extraRooms, 0, 0, 25);
  const guards: string[] = [];
  if (rooms >= 10 || bathrooms >= 6 || extraRooms >= 8) guards.push("large_property");

  const extras = normalizeExtras(input.extras);
  const extraEffects: ResolvedExtraDuration[] = [];
  const unknownExtras: string[] = [];
  let extraMinutes = 0;
  let workload = servicePolicy.workloadBase;
  let complexity = servicePolicy.operationalComplexity;
  let teamScalable = servicePolicy.teamScalable;
  let teamBehavior = servicePolicy.teamScalingBehavior;
  let requestedExtraCleaners = 0;

  workload += rooms * servicePolicy.bedroomWorkload;
  workload += bathrooms * servicePolicy.bathroomWorkload;
  workload += extraRooms * servicePolicy.extraRoomWorkload;

  for (const slug of extras) {
    const policy = getCanonicalDurationExtraPolicy(slug);
    if (!policy) {
      unknownExtras.push(slug);
      continue;
    }
    if (policy.durationEffect === "adds_duration") extraMinutes += policy.durationMinutes;
    if (policy.durationEffect === "team_scaling_modifier") requestedExtraCleaners += 1;
    workload = workload * policy.workloadMultiplier + policy.workloadDelta;
    if (policy.operationalComplexity) complexity = maxComplexity(complexity, policy.operationalComplexity);
    teamScalable = teamScalable || policy.teamScalable;
    if (policy.teamScalingBehavior === "requested_extra_cleaner") teamBehavior = "requested_extra_cleaner";
    extraEffects.push({ ...policy, count: 1 });
  }

  let rawDuration =
    servicePolicy.baseMinutes +
    rooms * servicePolicy.bedroomMinutes +
    bathrooms * servicePolicy.bathroomMinutes +
    extraRooms * servicePolicy.extraRoomMinutes +
    extraMinutes;

  if (rooms >= 10 || bathrooms >= 6 || extraRooms >= 8) {
    rawDuration += 60;
    complexity = "large_property";
  }

  const roundedRawDuration = Math.round(rawDuration);
  let duration = roundedRawDuration;
  if (duration < servicePolicy.minMinutes) {
    duration = servicePolicy.minMinutes;
    guards.push("min_duration_clamped");
  }
  if (duration > servicePolicy.maxMinutes) {
    duration = servicePolicy.maxMinutes;
    guards.push("max_duration_clamped");
  }

  const explicitTeamCount = clampInt(input.teamMemberCount, 1, 1, 20);
  const teamMemberCount = Math.max(explicitTeamCount, 1 + requestedExtraCleaners);
  const teamDuration = teamScaledDuration(duration, teamMemberCount, teamScalable);

  const recurringRaw = Number(input.recurringSnapshotDurationMinutes);
  const recurringDelta =
    Number.isFinite(recurringRaw) && recurringRaw > 0 ? Math.round(recurringRaw) - duration : null;
  const recurringCompatible = recurringDelta == null ? true : Math.abs(recurringDelta) <= 15;
  if (!recurringCompatible) guards.push("recurring_snapshot_duration_drift");

  return {
    service: servicePolicy.serviceId,
    duration_minutes: duration,
    raw_duration_minutes: roundedRawDuration,
    workload_weight: Number(workload.toFixed(2)),
    operational_complexity: complexity,
    team_scalable: teamScalable,
    team_scaling_behavior: teamBehavior,
    team_member_count: teamMemberCount,
    team_scaled_duration_minutes: teamDuration,
    recurring_snapshot_compatible: recurringCompatible,
    recurring_snapshot_delta_minutes: recurringDelta,
    guards,
    service_policy: servicePolicy,
    extra_effects: extraEffects,
    unknown_extras: unknownExtras,
  };
}
