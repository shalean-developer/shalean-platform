import { metrics } from "@/lib/metrics/counters";
import {
  resolveCanonicalDurationWorkload,
  type DurationWorkloadResult,
} from "@/lib/pricing/cleaningDurationWorkload";
import type { PricingJobInput } from "@/lib/pricing/pricingEngine";

export type CanonicalDurationDeltaSeverity = "parity" | "low" | "medium" | "high" | "critical";

export type CanonicalDurationShadowDiagnostics = {
  mode: "shadow";
  legacy_duration_minutes: number;
  canonical_duration_minutes: number;
  delta_minutes: number;
  abs_delta_minutes: number;
  delta_severity: CanonicalDurationDeltaSeverity;
  workload_weight: number;
  operational_complexity: DurationWorkloadResult["operational_complexity"];
  team_scalable: boolean;
  team_scaling_behavior: DurationWorkloadResult["team_scaling_behavior"];
  team_scaled_duration_minutes: number;
  recurring_snapshot_compatible: boolean;
  recurring_snapshot_delta_minutes: number | null;
  guards: string[];
  unknown_extras: string[];
};

export type CanonicalDurationShadowInput = {
  job: PricingJobInput;
  legacyHours: number;
  teamMemberCount?: number | null;
  recurringSnapshotDurationMinutes?: number | null;
  reportContext?: {
    source?: string | null;
    pricingVersion?: number | null;
    bookingId?: string | null;
  };
};

export function classifyCanonicalDurationDelta(absDeltaMinutes: number): CanonicalDurationDeltaSeverity {
  if (!Number.isFinite(absDeltaMinutes) || absDeltaMinutes < 0) return "critical";
  if (absDeltaMinutes <= 15) return "parity";
  if (absDeltaMinutes <= 30) return "low";
  if (absDeltaMinutes <= 60) return "medium";
  if (absDeltaMinutes <= 120) return "high";
  return "critical";
}

export function isLargeCanonicalDurationMismatch(severity: CanonicalDurationDeltaSeverity): boolean {
  return severity === "high" || severity === "critical";
}

function legacyMinutesFromHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.max(30, Math.round(hours * 60));
}

export function buildCanonicalDurationShadowDiagnostics(
  input: CanonicalDurationShadowInput,
): CanonicalDurationShadowDiagnostics {
  const legacyMinutes = legacyMinutesFromHours(input.legacyHours);
  const canonical = resolveCanonicalDurationWorkload({
    service: input.job.service ?? input.job.serviceType ?? null,
    rooms: input.job.rooms,
    bathrooms: input.job.bathrooms,
    extraRooms: input.job.extraRooms,
    extras: input.job.extras,
    teamMemberCount: input.teamMemberCount,
    recurringSnapshotDurationMinutes: input.recurringSnapshotDurationMinutes,
  });
  const delta = canonical.duration_minutes - legacyMinutes;
  const absDelta = Math.abs(delta);
  const severity = classifyCanonicalDurationDelta(absDelta);

  return {
    mode: "shadow",
    legacy_duration_minutes: legacyMinutes,
    canonical_duration_minutes: canonical.duration_minutes,
    delta_minutes: delta,
    abs_delta_minutes: absDelta,
    delta_severity: severity,
    workload_weight: canonical.workload_weight,
    operational_complexity: canonical.operational_complexity,
    team_scalable: canonical.team_scalable,
    team_scaling_behavior: canonical.team_scaling_behavior,
    team_scaled_duration_minutes: canonical.team_scaled_duration_minutes,
    recurring_snapshot_compatible: canonical.recurring_snapshot_compatible,
    recurring_snapshot_delta_minutes: canonical.recurring_snapshot_delta_minutes,
    guards: canonical.guards,
    unknown_extras: canonical.unknown_extras,
  };
}

export function reportCanonicalDurationShadowMismatch(
  diagnostics: CanonicalDurationShadowDiagnostics,
  context?: CanonicalDurationShadowInput["reportContext"],
): void {
  metrics.increment("pricing.duration_shadow.compared", {
    source: context?.source ?? null,
    pricingVersion: context?.pricingVersion ?? null,
    severity: diagnostics.delta_severity,
    legacy_duration_minutes: diagnostics.legacy_duration_minutes,
    canonical_duration_minutes: diagnostics.canonical_duration_minutes,
    delta_minutes: diagnostics.delta_minutes,
    operational_complexity: diagnostics.operational_complexity,
    guards: diagnostics.guards,
    unknown_extras_count: diagnostics.unknown_extras.length,
  });

  if (!isLargeCanonicalDurationMismatch(diagnostics.delta_severity)) return;
  if (process.env.NODE_ENV === "test") return;

  const payload = {
    source: context?.source ?? null,
    bookingId: context?.bookingId ?? null,
    pricingVersion: context?.pricingVersion ?? null,
    severity: diagnostics.delta_severity,
    legacy_duration_minutes: diagnostics.legacy_duration_minutes,
    canonical_duration_minutes: diagnostics.canonical_duration_minutes,
    delta_minutes: diagnostics.delta_minutes,
    operational_complexity: diagnostics.operational_complexity,
    guards: diagnostics.guards,
    unknown_extras: diagnostics.unknown_extras,
  };
  console.warn("[pricing.duration_shadow.mismatch]", payload);
  metrics.increment("pricing.duration_shadow.large_mismatch", payload);
}
