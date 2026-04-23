import type { SupabaseClient } from "@supabase/supabase-js";
import {
  companyProfitCents,
  resolvedRevenueCents,
  type FinancialBookingInput,
} from "@/lib/admin/computeFinancialDashboard";
import type { AiPricingSuggestion } from "@/lib/pricing/safeAutoPricingGuardrails";
import {
  normalizeLocationLabel,
  shouldRollbackForMarginDrop,
  validatePricingChange,
  validateSuggestionShape,
} from "@/lib/pricing/safeAutoPricingGuardrails";

export const PRICING_AUTO_APPLY = process.env.PRICING_AUTO_APPLY === "true";

export type LocationMetricsSnapshot = {
  window_days: number;
  completed_jobs: number;
  revenue_cents: number;
  profit_cents: number;
  margin_ratio: number | null;
};

export type PricingRuleRowLite = {
  id: string;
  location: string | null;
  demand_level: string | null;
  base_multiplier: number;
  created_at?: string | null;
};

export type PricingChangeStatus = "pending" | "applied" | "rejected" | "rolled_back";

export type SubmitSuggestionResult = {
  location: string;
  new_multiplier: number;
  outcome: "applied" | "pending" | "rejected";
  pricing_change_id?: string;
  message?: string;
};

type BookingMetricsRow = {
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  company_revenue_cents: number | null;
  location: string | null;
};

export async function snapshotLocationMetrics(
  admin: SupabaseClient,
  locationLabel: string,
  windowDays = 30,
): Promise<LocationMetricsSnapshot> {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  const target = normalizeLocationLabel(locationLabel).toLowerCase();

  const { data, error } = await admin
    .from("bookings")
    .select("total_paid_zar, amount_paid_cents, company_revenue_cents, location")
    .ilike("status", "completed")
    .gte("created_at", since.toISOString())
    .limit(8000);

  if (error) {
    return { window_days: windowDays, completed_jobs: 0, revenue_cents: 0, profit_cents: 0, margin_ratio: null };
  }

  let revenueCents = 0;
  let profitCents = 0;
  let n = 0;
  for (const raw of data ?? []) {
    const b = raw as BookingMetricsRow;
    const loc = normalizeLocationLabel(b.location ?? "").toLowerCase();
    if (!loc || loc !== target) continue;
    const row: FinancialBookingInput = {
      id: "_",
      total_paid_zar: b.total_paid_zar,
      amount_paid_cents: b.amount_paid_cents,
      company_revenue_cents: b.company_revenue_cents,
      cleaner_payout_cents: null,
      location: b.location,
      cleaner_id: null,
      created_at: null,
    };
    revenueCents += resolvedRevenueCents(row);
    profitCents += companyProfitCents(row);
    n += 1;
  }

  const margin_ratio = revenueCents > 0 ? profitCents / revenueCents : null;
  return {
    window_days: windowDays,
    completed_jobs: n,
    revenue_cents: revenueCents,
    profit_cents: profitCents,
    margin_ratio,
  };
}

export async function resolvePricingRuleForSuggestion(
  admin: SupabaseClient,
  s: AiPricingSuggestion,
): Promise<PricingRuleRowLite | null> {
  if (s.pricing_rule_id) {
    const { data, error } = await admin
      .from("pricing_rules")
      .select("id, location, demand_level, base_multiplier, created_at")
      .eq("id", s.pricing_rule_id)
      .maybeSingle();
    if (error || !data) return null;
    return data as PricingRuleRowLite;
  }

  const want = normalizeLocationLabel(s.location).toLowerCase();
  const { data, error } = await admin
    .from("pricing_rules")
    .select("id, location, demand_level, base_multiplier, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !data?.length) return null;

  const rows = data as PricingRuleRowLite[];
  const matches = rows.filter((r) => normalizeLocationLabel(r.location ?? "").toLowerCase() === want);
  if (matches.length === 0) return null;
  matches.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return matches[0] ?? null;
}

async function insertPricingChange(
  admin: SupabaseClient,
  row: {
    pricing_rule_id: string | null;
    location: string | null;
    demand_level: string | null;
    old_multiplier: number | null;
    new_multiplier: number;
    reason: string | null;
    status: PricingChangeStatus;
    rejection_reason?: string | null;
    created_by?: string | null;
    metrics_before?: LocationMetricsSnapshot | null;
    applied_at?: string | null;
    ai_payload?: unknown;
  },
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await admin
    .from("pricing_changes")
    .insert({
      pricing_rule_id: row.pricing_rule_id,
      location: row.location,
      demand_level: row.demand_level,
      old_multiplier: row.old_multiplier,
      new_multiplier: row.new_multiplier,
      reason: row.reason,
      status: row.status,
      rejection_reason: row.rejection_reason ?? null,
      created_by: row.created_by ?? null,
      metrics_before: row.metrics_before ?? null,
      applied_at: row.applied_at ?? null,
      ai_payload: row.ai_payload ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "insert failed" };
  return { id: String((data as { id: string }).id) };
}

export async function submitPricingSuggestions(
  admin: SupabaseClient,
  suggestions: AiPricingSuggestion[],
  opts: { createdBy?: string | null; forceAutoApply?: boolean } = {},
): Promise<SubmitSuggestionResult[]> {
  const auto = PRICING_AUTO_APPLY || Boolean(opts.forceAutoApply);
  const out: SubmitSuggestionResult[] = [];

  for (const s of suggestions) {
    const shape = validateSuggestionShape(s);
    if (!shape.ok) {
      const ins = await insertPricingChange(admin, {
        pricing_rule_id: null,
        location: normalizeLocationLabel(s.location),
        demand_level: null,
        old_multiplier: null,
        new_multiplier: s.new_multiplier,
        reason: s.reason ?? null,
        status: "rejected",
        rejection_reason: shape.error,
        created_by: opts.createdBy ?? null,
        ai_payload: s,
      });
      out.push({
        location: s.location,
        new_multiplier: s.new_multiplier,
        outcome: "rejected",
        pricing_change_id: "error" in ins ? undefined : ins.id,
        message: shape.error,
      });
      continue;
    }

    const rule = await resolvePricingRuleForSuggestion(admin, s);
    if (!rule) {
      const ins = await insertPricingChange(admin, {
        pricing_rule_id: null,
        location: normalizeLocationLabel(s.location),
        demand_level: null,
        old_multiplier: null,
        new_multiplier: s.new_multiplier,
        reason: s.reason ?? null,
        status: "rejected",
        rejection_reason: "No matching pricing_rules row for this location (or pricing_rule_id).",
        created_by: opts.createdBy ?? null,
        ai_payload: s,
      });
      out.push({
        location: s.location,
        new_multiplier: s.new_multiplier,
        outcome: "rejected",
        pricing_change_id: "error" in ins ? undefined : ins.id,
        message: "No matching pricing_rules row.",
      });
      continue;
    }

    const oldVal = Number(rule.base_multiplier);
    const newVal = s.new_multiplier;
    const ok = validatePricingChange(oldVal, newVal);
    const metrics = await snapshotLocationMetrics(admin, s.location, 30);

    if (!ok) {
      const ins = await insertPricingChange(admin, {
        pricing_rule_id: rule.id,
        location: rule.location,
        demand_level: rule.demand_level,
        old_multiplier: oldVal,
        new_multiplier: newVal,
        reason: s.reason ?? null,
        status: "rejected",
        rejection_reason: "Guardrails failed: max ±20% move and multiplier must stay within [0.8, 1.5].",
        created_by: opts.createdBy ?? null,
        metrics_before: metrics,
        ai_payload: s,
      });
      out.push({
        location: s.location,
        new_multiplier: newVal,
        outcome: "rejected",
        pricing_change_id: "error" in ins ? undefined : ins.id,
        message: "Failed guardrail validation.",
      });
      continue;
    }

    if (auto) {
      const { error: upErr } = await admin.from("pricing_rules").update({ base_multiplier: newVal }).eq("id", rule.id);
      if (upErr) {
        const ins = await insertPricingChange(admin, {
          pricing_rule_id: rule.id,
          location: rule.location,
          demand_level: rule.demand_level,
          old_multiplier: oldVal,
          new_multiplier: newVal,
          reason: s.reason ?? null,
          status: "rejected",
          rejection_reason: upErr.message,
          created_by: opts.createdBy ?? null,
          metrics_before: metrics,
          ai_payload: s,
        });
        out.push({
          location: s.location,
          new_multiplier: newVal,
          outcome: "rejected",
          pricing_change_id: "error" in ins ? undefined : ins.id,
          message: upErr.message,
        });
        continue;
      }

      const ins = await insertPricingChange(admin, {
        pricing_rule_id: rule.id,
        location: rule.location,
        demand_level: rule.demand_level,
        old_multiplier: oldVal,
        new_multiplier: newVal,
        reason: s.reason ?? null,
        status: "applied",
        created_by: opts.createdBy ?? null,
        metrics_before: metrics,
        applied_at: new Date().toISOString(),
        ai_payload: s,
      });
      out.push({
        location: s.location,
        new_multiplier: newVal,
        outcome: "applied",
        pricing_change_id: "error" in ins ? undefined : ins.id,
      });
    } else {
      const ins = await insertPricingChange(admin, {
        pricing_rule_id: rule.id,
        location: rule.location,
        demand_level: rule.demand_level,
        old_multiplier: oldVal,
        new_multiplier: newVal,
        reason: s.reason ?? null,
        status: "pending",
        created_by: opts.createdBy ?? null,
        metrics_before: metrics,
        ai_payload: s,
      });
      out.push({
        location: s.location,
        new_multiplier: newVal,
        outcome: "pending",
        pricing_change_id: "error" in ins ? undefined : ins.id,
      });
    }
  }

  return out;
}

export async function approvePricingChange(
  admin: SupabaseClient,
  changeId: string,
  opts: { createdBy?: string | null } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row, error: fErr } = await admin.from("pricing_changes").select("*").eq("id", changeId).maybeSingle();
  if (fErr || !row) return { ok: false, error: fErr?.message ?? "Change not found." };
  const ch = row as Record<string, unknown>;
  if (String(ch.status) !== "pending") return { ok: false, error: "Only pending changes can be approved." };

  const ruleId = String(ch.pricing_rule_id ?? "");
  const newMult = Number(ch.new_multiplier);
  if (!ruleId || !Number.isFinite(newMult)) return { ok: false, error: "Invalid pending row." };

  const { data: rule, error: rErr } = await admin
    .from("pricing_rules")
    .select("id, base_multiplier")
    .eq("id", ruleId)
    .maybeSingle();
  if (rErr || !rule) return { ok: false, error: "Pricing rule no longer exists." };

  const current = Number((rule as { base_multiplier: number }).base_multiplier);
  if (!validatePricingChange(current, newMult)) {
    await admin
      .from("pricing_changes")
      .update({
        status: "rejected",
        rejection_reason: "Guardrails failed at approval time (current multiplier may have drifted).",
      })
      .eq("id", changeId);
    return { ok: false, error: "Guardrails failed at approval time." };
  }

  const { error: uErr } = await admin.from("pricing_rules").update({ base_multiplier: newMult }).eq("id", ruleId);
  if (uErr) return { ok: false, error: uErr.message };

  const metrics = await snapshotLocationMetrics(admin, String(ch.location ?? ""), 30);
  const existingBefore = ch.metrics_before;
  const patch: Record<string, unknown> = {
    status: "applied",
    applied_at: new Date().toISOString(),
    old_multiplier: current,
  };
  if (existingBefore == null) {
    patch.metrics_before = metrics;
  }

  const { error: pErr } = await admin.from("pricing_changes").update(patch).eq("id", changeId);

  if (pErr) return { ok: false, error: pErr.message };
  return { ok: true };
}

export async function rejectPricingChange(
  admin: SupabaseClient,
  changeId: string,
  reason?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row, error: fErr } = await admin.from("pricing_changes").select("status").eq("id", changeId).maybeSingle();
  if (fErr || !row) return { ok: false, error: "Change not found." };
  if (String((row as { status: string }).status) !== "pending") return { ok: false, error: "Only pending changes can be rejected." };

  const { error } = await admin
    .from("pricing_changes")
    .update({
      status: "rejected",
      rejection_reason: reason?.slice(0, 2000) ?? "Rejected by admin.",
    })
    .eq("id", changeId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function rollbackPricingChange(
  admin: SupabaseClient,
  changeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row, error: fErr } = await admin.from("pricing_changes").select("*").eq("id", changeId).maybeSingle();
  if (fErr || !row) return { ok: false, error: "Change not found." };
  const ch = row as Record<string, unknown>;
  const st = String(ch.status);
  if (st !== "applied") return { ok: false, error: "Only applied changes can be rolled back." };

  const ruleId = String(ch.pricing_rule_id ?? "");
  const oldMult = ch.old_multiplier != null ? Number(ch.old_multiplier) : NaN;
  if (!ruleId || !Number.isFinite(oldMult)) return { ok: false, error: "Missing pricing_rule_id or old_multiplier." };

  const { error: uErr } = await admin.from("pricing_rules").update({ base_multiplier: oldMult }).eq("id", ruleId);
  if (uErr) return { ok: false, error: uErr.message };

  const { error: pErr } = await admin
    .from("pricing_changes")
    .update({ status: "rolled_back", rolled_back_at: new Date().toISOString() })
    .eq("id", changeId);
  if (pErr) return { ok: false, error: pErr.message };
  return { ok: true };
}

export type PerformanceEvaluation = {
  should_rollback: boolean;
  margin_before: number | null;
  margin_after: number | null;
  reason: string;
};

/**
 * Compares stored `metrics_before.margin_ratio` to a fresh snapshot for the same location.
 * Does not auto-rollback; callers decide whether to call `rollbackPricingChange`.
 */
export async function evaluatePricingChangePerformance(
  admin: SupabaseClient,
  changeId: string,
  windowDays = 30,
): Promise<PerformanceEvaluation | { ok: false; error: string }> {
  const { data: row, error: fErr } = await admin.from("pricing_changes").select("*").eq("id", changeId).maybeSingle();
  if (fErr || !row) return { ok: false, error: "Change not found." };
  const ch = row as Record<string, unknown>;
  if (String(ch.status) !== "applied") {
    return { ok: false, error: "Performance check is only meaningful for applied changes." };
  }

  const loc = String(ch.location ?? "");
  const beforeJson = ch.metrics_before as LocationMetricsSnapshot | null;
  const marginBefore = beforeJson?.margin_ratio ?? null;

  const afterSnap = await snapshotLocationMetrics(admin, loc, windowDays);
  const marginAfter = afterSnap.margin_ratio;

  const checkedAt = new Date().toISOString();
  await admin
    .from("pricing_changes")
    .update({ metrics_after: afterSnap, metrics_checked_at: checkedAt })
    .eq("id", changeId);

  const should = shouldRollbackForMarginDrop(marginBefore, marginAfter);
  const reason = should
    ? `Portfolio margin for this location dropped by more than 0.10 vs snapshot (before ${marginBefore ?? "n/a"}, after ${marginAfter ?? "n/a"}). Consider rollback.`
    : "Margin movement vs snapshot is within tolerance.";

  return {
    should_rollback: should,
    margin_before: marginBefore,
    margin_after: marginAfter,
    reason,
  };
}
