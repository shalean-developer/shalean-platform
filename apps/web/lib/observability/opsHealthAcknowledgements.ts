import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductionHealthFinding, ProductionHealthSummary } from "@/lib/observability/productionHealthMetrics";

export type OpsHealthAcknowledgementStatus = "acknowledged" | "resolved";

export type OpsHealthAcknowledgement = {
  key: string;
  code: string;
  sampleIds: string[];
  status: OpsHealthAcknowledgementStatus;
  note?: string;
  operatorId?: string;
  operatorEmail?: string;
  createdAt: string;
};

export type OpsHealthAcknowledgementAction = {
  code: string;
  sampleIds?: string[];
  status: OpsHealthAcknowledgementStatus;
  note?: string;
  operator: {
    id: string;
    email: string;
  };
};

export type OpsHealthAcknowledgementView = {
  visibleSummary: ProductionHealthSummary;
  acknowledgedFindings: ProductionHealthFinding[];
  acknowledgements: OpsHealthAcknowledgement[];
};

export const OPS_HEALTH_ACK_SOURCE = "ops_health_acknowledgement";

const MAX_ACKS = 1000;
const MAX_SAMPLE_IDS = 10;
const MAX_NOTE_LENGTH = 1000;

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export function opsHealthFindingKey(code: string, sampleIds?: readonly string[]): string {
  const samples = [...new Set((sampleIds ?? []).map(clean).filter(Boolean))]
    .sort()
    .slice(0, MAX_SAMPLE_IDS);
  return samples.length > 0 ? `${clean(code)}:${samples.join("|")}` : clean(code);
}

function countsFor(findings: readonly ProductionHealthFinding[]): ProductionHealthSummary["totals"] {
  return findings.reduce<ProductionHealthSummary["totals"]>(
    (acc, finding) => {
      acc[finding.severity] += finding.count;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  );
}

function normalizeAck(row: {
  created_at?: string | null;
  context?: Record<string, unknown> | null;
}): OpsHealthAcknowledgement | null {
  const ctx = row.context ?? {};
  const code = clean(ctx.code ?? ctx.finding_code);
  const status = clean(ctx.status) as OpsHealthAcknowledgementStatus;
  if (!code || (status !== "acknowledged" && status !== "resolved")) return null;
  const rawSamples = Array.isArray(ctx.sampleIds) ? ctx.sampleIds : Array.isArray(ctx.sample_ids) ? ctx.sample_ids : [];
  const sampleIds = rawSamples.map(clean).filter(Boolean).slice(0, MAX_SAMPLE_IDS);
  return {
    key: clean(ctx.key) || opsHealthFindingKey(code, sampleIds),
    code,
    sampleIds,
    status,
    ...(clean(ctx.note) ? { note: clean(ctx.note) } : {}),
    ...(clean(ctx.operatorId ?? ctx.operator_id) ? { operatorId: clean(ctx.operatorId ?? ctx.operator_id) } : {}),
    ...(clean(ctx.operatorEmail ?? ctx.operator_email) ? { operatorEmail: clean(ctx.operatorEmail ?? ctx.operator_email) } : {}),
    createdAt: clean(row.created_at) || clean(ctx.createdAt ?? ctx.created_at) || new Date(0).toISOString(),
  };
}

export async function listOpsHealthAcknowledgements(admin: SupabaseClient): Promise<OpsHealthAcknowledgement[]> {
  try {
    const { data, error } = await admin
      .from("system_logs")
      .select("created_at, context")
      .eq("source", OPS_HEALTH_ACK_SOURCE)
      .order("created_at", { ascending: false })
      .limit(MAX_ACKS);
    if (error) return [];

    const latest = new Map<string, OpsHealthAcknowledgement>();
    for (const row of data ?? []) {
      const ack = normalizeAck(row as { created_at?: string | null; context?: Record<string, unknown> | null });
      if (!ack || latest.has(ack.key)) continue;
      latest.set(ack.key, ack);
    }
    return [...latest.values()];
  } catch {
    return [];
  }
}

export async function recordOpsHealthAcknowledgement(
  admin: SupabaseClient,
  action: OpsHealthAcknowledgementAction,
): Promise<{ ok: true; acknowledgement: OpsHealthAcknowledgement } | { ok: false; error: string }> {
  const code = clean(action.code);
  const sampleIds = [...new Set((action.sampleIds ?? []).map(clean).filter(Boolean))].slice(0, MAX_SAMPLE_IDS);
  if (!code) return { ok: false, error: "Missing finding code." };

  const now = new Date().toISOString();
  const key = opsHealthFindingKey(code, sampleIds);
  const note = clean(action.note).slice(0, MAX_NOTE_LENGTH);
  const acknowledgement: OpsHealthAcknowledgement = {
    key,
    code,
    sampleIds,
    status: action.status,
    ...(note ? { note } : {}),
    operatorId: action.operator.id,
    operatorEmail: action.operator.email,
    createdAt: now,
  };

  try {
    const { error } = await admin.from("system_logs").insert({
      level: "info",
      source: OPS_HEALTH_ACK_SOURCE,
      message: `ops_health_finding_${action.status}`,
      context: {
        key,
        code,
        sampleIds,
        status: action.status,
        note: note || null,
        operatorId: action.operator.id,
        operatorEmail: action.operator.email,
        createdAt: now,
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, acknowledgement };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function applyOpsHealthAcknowledgements(
  summary: ProductionHealthSummary,
  acknowledgements: readonly OpsHealthAcknowledgement[],
  options?: { includeAcknowledged?: boolean },
): OpsHealthAcknowledgementView {
  const activeKeys = new Set(
    acknowledgements.filter((ack) => ack.status === "acknowledged").map((ack) => ack.key),
  );
  const acknowledgedFindings: ProductionHealthFinding[] = [];
  const visibleFindings: ProductionHealthFinding[] = [];

  for (const finding of summary.findings) {
    const key = opsHealthFindingKey(finding.code, finding.sampleIds);
    const isAcknowledged = activeKeys.has(key);
    const enriched = {
      ...finding,
      diagnostics: {
        ...(finding.diagnostics ?? {}),
        acknowledgement_key: key,
        acknowledged: isAcknowledged,
      },
    };
    if (isAcknowledged) acknowledgedFindings.push(enriched);
    if (!isAcknowledged || options?.includeAcknowledged === true) visibleFindings.push(enriched);
  }

  return {
    visibleSummary: {
      ...summary,
      findings: visibleFindings,
      totals: countsFor(visibleFindings),
    },
    acknowledgedFindings,
    acknowledgements: [...acknowledgements],
  };
}
