import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  opsHealthFindingKey,
  type OpsHealthAcknowledgement,
} from "@/lib/observability/opsHealthAcknowledgements";
import type {
  ProductionHealthCode,
  ProductionHealthFinding,
  ProductionHealthSeverity,
  ProductionHealthSummary,
} from "@/lib/observability/productionHealthMetrics";

export const OPS_HEALTH_ALERT_SOURCE = "ops_health_alert_sent";

const MAX_ALERT_SAMPLE_IDS = 10;
const MAX_SAFE_DIAGNOSTIC_ITEMS = 10;

export type OpsHealthAlertCode = Extract<
  ProductionHealthCode,
  | "payment_verified_not_finalized"
  | "monthly_invoice_paid_child_unsettled"
  | "booking_completed_missing_earnings_basis"
  | "dispatch_stale_unassigned"
  | "cron_stale_or_missing_success"
  | "payout_eligibility_drift"
>;

export type OpsHealthAlertPolicy = {
  code: OpsHealthAlertCode;
  severity: Extract<ProductionHealthSeverity, "critical" | "high">;
  cooldownMinutes: number;
  message: string;
};

export type OpsHealthAlertPayload = {
  kind: "ops_health_alert";
  code: OpsHealthAlertCode;
  severity: Extract<ProductionHealthSeverity, "critical" | "high">;
  count: number;
  message: string;
  sampleIds: string[];
  findingKey: string;
  cooldownKey: string;
  generatedAt: string;
  diagnostics?: Record<string, unknown>;
};

export type OpsHealthAlertCandidate = {
  code: OpsHealthAlertCode;
  severity: Extract<ProductionHealthSeverity, "critical" | "high">;
  count: number;
  message: string;
  sampleIds: string[];
  findingKey: string;
  cooldownKey: string;
  cooldownMinutes: number;
  payload: OpsHealthAlertPayload;
};

export type OpsHealthAlertCooldownResult =
  | { ok: true; allowed: true }
  | { ok: true; allowed: false; reason: "cooldown"; latestAt?: string }
  | { ok: false; allowed: false; error: string };

export type OpsHealthAlertPolicyResult = {
  ok: true;
  candidates: OpsHealthAlertCandidate[];
  suppressed: Array<{
    candidate: OpsHealthAlertCandidate;
    reason: "cooldown" | "cooldown_check_failed";
    latestAt?: string;
    error?: string;
  }>;
  errors: string[];
};

export const OPS_HEALTH_ALERT_POLICIES: Record<OpsHealthAlertCode, OpsHealthAlertPolicy> = {
  payment_verified_not_finalized: {
    code: "payment_verified_not_finalized",
    severity: "critical",
    cooldownMinutes: 15,
    message: "Verified payment has not finalized into booking settlement.",
  },
  monthly_invoice_paid_child_unsettled: {
    code: "monthly_invoice_paid_child_unsettled",
    severity: "critical",
    cooldownMinutes: 30,
    message: "Paid monthly invoice has unsettled non-cancelled child bookings.",
  },
  booking_completed_missing_earnings_basis: {
    code: "booking_completed_missing_earnings_basis",
    severity: "critical",
    cooldownMinutes: 45,
    message: "Completed booking is missing an earnings basis.",
  },
  dispatch_stale_unassigned: {
    code: "dispatch_stale_unassigned",
    severity: "high",
    cooldownMinutes: 30,
    message: "Paid booking remains stale without assignment.",
  },
  cron_stale_or_missing_success: {
    code: "cron_stale_or_missing_success",
    severity: "high",
    cooldownMinutes: 30,
    message: "Critical cron job has no recent successful run.",
  },
  payout_eligibility_drift: {
    code: "payout_eligibility_drift",
    severity: "high",
    cooldownMinutes: 60,
    message: "Payout eligibility state is missing expected frozen or paid markers.",
  },
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeDate(value: Date | string | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return new Date();
}

function boundedSampleIds(sampleIds: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of sampleIds ?? []) {
    const id = clean(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_ALERT_SAMPLE_IDS) break;
  }
  return out;
}

function safeDiagnostics(finding: ProductionHealthFinding): Record<string, unknown> | undefined {
  const diagnostics = finding.diagnostics ?? {};
  const out: Record<string, unknown> = {};

  if (Array.isArray(diagnostics.missing)) {
    out.missing = diagnostics.missing.map(clean).filter(Boolean).slice(0, MAX_SAFE_DIAGNOSTIC_ITEMS);
  }
  if (Array.isArray(diagnostics.stale)) {
    out.stale = diagnostics.stale.map(clean).filter(Boolean).slice(0, MAX_SAFE_DIAGNOSTIC_ITEMS);
  }
  if (typeof diagnostics.stale_minutes === "number" && Number.isFinite(diagnostics.stale_minutes)) {
    out.stale_minutes = diagnostics.stale_minutes;
  }
  if (diagnostics.max_age_minutes_by_job && typeof diagnostics.max_age_minutes_by_job === "object") {
    const safeAges: Record<string, number> = {};
    for (const [key, value] of Object.entries(diagnostics.max_age_minutes_by_job as Record<string, unknown>).slice(
      0,
      MAX_SAFE_DIAGNOSTIC_ITEMS,
    )) {
      const n = Number(value);
      if (clean(key) && Number.isFinite(n)) safeAges[clean(key)] = n;
    }
    if (Object.keys(safeAges).length > 0) out.max_age_minutes_by_job = safeAges;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function activeAcknowledgementKeys(acknowledgements: readonly OpsHealthAcknowledgement[]): Set<string> {
  return new Set(acknowledgements.filter((ack) => ack.status === "acknowledged").map((ack) => ack.key));
}

function policyFor(code: ProductionHealthCode): OpsHealthAlertPolicy | null {
  return (OPS_HEALTH_ALERT_POLICIES as Partial<Record<ProductionHealthCode, OpsHealthAlertPolicy>>)[code] ?? null;
}

export function buildOpsHealthAlertPayload(
  finding: ProductionHealthFinding,
  options?: { generatedAt?: Date | string },
): OpsHealthAlertPayload | null {
  const policy = policyFor(finding.code);
  if (!policy) return null;
  if (finding.severity !== "critical" && finding.severity !== "high") return null;

  const sampleIds = boundedSampleIds(finding.sampleIds);
  const findingKey = opsHealthFindingKey(finding.code, sampleIds);
  const diagnostics = safeDiagnostics(finding);

  return {
    kind: "ops_health_alert",
    code: policy.code,
    severity: finding.severity === "critical" ? "critical" : policy.severity,
    count: Math.max(0, Number.isFinite(Number(finding.count)) ? Math.round(Number(finding.count)) : sampleIds.length),
    message: policy.message,
    sampleIds,
    findingKey,
    cooldownKey: policy.code,
    generatedAt: normalizeDate(options?.generatedAt).toISOString(),
    ...(diagnostics ? { diagnostics } : {}),
  };
}

export function buildOpsHealthAlertCandidates(
  summary: ProductionHealthSummary,
  options?: {
    acknowledgements?: readonly OpsHealthAcknowledgement[];
    generatedAt?: Date | string;
  },
): OpsHealthAlertCandidate[] {
  const activeKeys = activeAcknowledgementKeys(options?.acknowledgements ?? []);
  const generatedAt = options?.generatedAt ?? summary.generatedAt;
  const candidates: OpsHealthAlertCandidate[] = [];

  for (const finding of summary.findings) {
    const payload = buildOpsHealthAlertPayload(finding, { generatedAt });
    if (!payload) continue;
    if (activeKeys.has(payload.findingKey)) continue;
    const policy = OPS_HEALTH_ALERT_POLICIES[payload.code];
    candidates.push({
      code: payload.code,
      severity: payload.severity,
      count: payload.count,
      message: payload.message,
      sampleIds: payload.sampleIds,
      findingKey: payload.findingKey,
      cooldownKey: payload.cooldownKey,
      cooldownMinutes: policy.cooldownMinutes,
      payload,
    });
  }

  return candidates;
}

export async function checkOpsHealthAlertCooldown(
  admin: SupabaseClient,
  candidate: Pick<OpsHealthAlertCandidate, "cooldownKey" | "cooldownMinutes">,
  options?: { now?: Date | string },
): Promise<OpsHealthAlertCooldownResult> {
  try {
    const now = normalizeDate(options?.now);
    const cutoff = new Date(now.getTime() - candidate.cooldownMinutes * 60_000).toISOString();
    const { data, error } = await admin
      .from("system_logs")
      .select("created_at")
      .eq("source", OPS_HEALTH_ALERT_SOURCE)
      .eq("context->>cooldownKey", candidate.cooldownKey)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return { ok: false, allowed: false, error: error.message ?? "Unknown cooldown query error" };
    const latest = Array.isArray(data) ? data[0] : null;
    if (latest) {
      return {
        ok: true,
        allowed: false,
        reason: "cooldown",
        latestAt: clean((latest as { created_at?: unknown }).created_at) || undefined,
      };
    }
    return { ok: true, allowed: true };
  } catch (err) {
    return { ok: false, allowed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function recordOpsHealthAlertCooldownMarker(
  admin: SupabaseClient,
  candidate: OpsHealthAlertCandidate,
  options?: { now?: Date | string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const createdAt = normalizeDate(options?.now ?? candidate.payload.generatedAt).toISOString();
    const { error } = await admin.from("system_logs").insert({
      level: candidate.severity === "critical" ? "error" : "warn",
      source: OPS_HEALTH_ALERT_SOURCE,
      message: "ops_health_alert_policy_matched",
      context: {
        ...candidate.payload,
        recordedAt: createdAt,
        cooldownMinutes: candidate.cooldownMinutes,
      },
    });
    if (error) return { ok: false, error: error.message ?? "Unknown alert marker insert error" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function selectOpsHealthAlertCandidatesSafe(
  admin: SupabaseClient,
  summary: ProductionHealthSummary,
  options?: {
    acknowledgements?: readonly OpsHealthAcknowledgement[];
    now?: Date | string;
  },
): Promise<OpsHealthAlertPolicyResult> {
  const errors: string[] = [];
  const allowed: OpsHealthAlertCandidate[] = [];
  const suppressed: OpsHealthAlertPolicyResult["suppressed"] = [];

  try {
    const candidates = buildOpsHealthAlertCandidates(summary, {
      acknowledgements: options?.acknowledgements,
      generatedAt: options?.now ?? summary.generatedAt,
    });

    for (const candidate of candidates) {
      const cooldown = await checkOpsHealthAlertCooldown(admin, candidate, { now: options?.now });
      if (cooldown.ok && cooldown.allowed) {
        allowed.push(candidate);
        continue;
      }
      if (cooldown.ok) {
        suppressed.push({ candidate, reason: "cooldown", latestAt: cooldown.latestAt });
      } else {
        errors.push(cooldown.error);
        suppressed.push({ candidate, reason: "cooldown_check_failed", error: cooldown.error });
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return { ok: true, candidates: allowed, suppressed, errors };
}
