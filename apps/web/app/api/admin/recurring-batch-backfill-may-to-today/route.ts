import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import { backfillRecurringOccurrencesToToday } from "@/lib/recurring/backfillRecurringOccurrencesToToday";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full path — copy exactly in clients/docs; typos yield HTML 404. Not exported (Next route modules may only export handlers/config). */
const RECURRING_BATCH_BACKFILL_PATH = "/api/admin/recurring-batch-backfill-may-to-today";

/** Lets you verify the route is deployed (`GET` returns JSON; backfill still requires `POST` + admin JWT). */
export function GET() {
  return NextResponse.json({
    ok: true,
    path: RECURRING_BATCH_BACKFILL_PATH,
    method: "POST",
    hint: "Optional JSON body: { \"recurring_ids\": [\"uuid\", ...] }. Query: ?limit=1–500",
  });
}

type PlanRow = { id: string; customer_id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseRecurringIdsFilter(bodyText: string): { ok: true; ids: string[] | null } | { ok: false; error: string } {
  if (!bodyText.trim()) return { ok: true, ids: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON body." };
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "JSON body must be an object, e.g. { \"recurring_ids\": [\"uuid\", ...] }." };
  }
  const raw = (parsed as { recurring_ids?: unknown }).recurring_ids;
  if (raw === undefined) return { ok: true, ids: null };
  if (raw === null) return { ok: false, error: "recurring_ids cannot be null." };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "recurring_ids must be an array of UUID strings." };
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") return { ok: false, error: "recurring_ids must contain only strings." };
    const id = x.trim();
    if (!UUID_RE.test(id)) return { ok: false, error: `Invalid recurring_id: ${id.slice(0, 40)}` };
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length > 200) return { ok: false, error: "recurring_ids is limited to 200 entries." };
  }
  return { ok: true, ids: out };
}

/**
 * Runs {@link backfillRecurringOccurrencesToToday} for every **active** recurring plan whose customer has
 * `billing_type` in `per_booking` | `monthly` when a profile row exists; plans **without** `user_profiles` are
 * included using the same default as the generator (`per_booking`).
 *
 * Path is **not** under `/api/admin/recurring/[id]` so the segment is never mistaken for a plan UUID (which
 * caused **405** when only `recurring/[id]/route.ts` existed with PATCH-only).
 *
 * Optional JSON body: `{ "recurring_ids": ["uuid", ...] }` — only those plans (must still be **active**).
 * Optional `?limit=` caps how many plans are processed after filtering (default: all). Idempotent per plan + date.
 */
export async function POST(request: Request) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const bodyText = await request.text().catch(() => "");
  const parsedIds = parseRecurringIdsFilter(bodyText);
  if (!parsedIds.ok) {
    return NextResponse.json({ error: parsedIds.error }, { status: 400 });
  }
  const recurringIdsFilter = parsedIds.ids;

  if (recurringIdsFilter !== null && recurringIdsFilter.length === 0) {
    return NextResponse.json({
      ok: true,
      recurring_ids_filter: [],
      requested_not_active_or_missing: [],
      plans_eligible: 0,
      plans_processed: 0,
      totals: { generated: 0, skipped_duplicate: 0, skipped_other: 0 },
      plan_failures: [],
      truncated_by_limit: false,
      limit_applied: null,
    });
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  let limit: number | null = null;
  if (limitRaw != null && limitRaw.trim() !== "") {
    const n = Math.floor(Number(limitRaw));
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json({ error: "Invalid limit (use integer 1–500)." }, { status: 400 });
    }
    limit = Math.min(500, n);
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let planQuery = admin.from("recurring_bookings").select("id, customer_id").eq("status", "active");
  if (recurringIdsFilter != null) {
    planQuery = planQuery.in("id", recurringIdsFilter);
  }
  const { data: plans, error: plansErr } = await planQuery;
  if (plansErr) {
    return NextResponse.json({ error: plansErr.message }, { status: 500 });
  }

  const planRows = (plans ?? []) as PlanRow[];
  const requestedMissing =
    recurringIdsFilter != null
      ? recurringIdsFilter.filter((id) => !planRows.some((p) => p.id === id))
      : [];
  const customerIds = [...new Set(planRows.map((p) => p.customer_id).filter(Boolean))];
  if (customerIds.length === 0) {
    return NextResponse.json({
      ok: true,
      plans_eligible: 0,
      plans_processed: 0,
      totals: { generated: 0, skipped_duplicate: 0, skipped_other: 0 },
      plan_failures: [],
      truncated_by_limit: false,
    });
  }

  const { data: profiles, error: profErr } = await admin
    .from("user_profiles")
    .select("id, billing_type")
    .in("id", customerIds);
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  const billingByUser = new Map<string, string>();
  for (const row of profiles ?? []) {
    const r = row as { id?: string; billing_type?: string | null };
    if (r.id) billingByUser.set(r.id, String(r.billing_type ?? "per_booking"));
  }

  const eligibleAll = planRows
    .filter((p) => {
      const bt = billingByUser.get(p.customer_id) ?? "per_booking";
      return bt === "per_booking" || bt === "monthly";
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const truncatedByLimit = limit != null && eligibleAll.length > limit;
  const eligible = limit != null ? eligibleAll.slice(0, limit) : eligibleAll;

  let generated = 0;
  let skippedDuplicate = 0;
  let skippedOther = 0;
  const planFailures: { recurring_id: string; error: string }[] = [];

  for (const p of eligible) {
    const result = await backfillRecurringOccurrencesToToday(admin, p.id);
    if (!result.ok) {
      planFailures.push({ recurring_id: p.id, error: result.error });
      continue;
    }
    generated += result.generated;
    skippedDuplicate += result.skipped_duplicate;
    skippedOther += result.skipped_other;
  }

  await logSystemEvent({
    level: "info",
    source: "admin/recurring-batch-backfill-may-to-today",
    message: "batch_recurring_backfill_completed",
    context: {
      admin_id: auth.user.id,
      plans_processed: eligible.length,
      generated,
      skipped_duplicate: skippedDuplicate,
      skipped_other: skippedOther,
      plan_failures_count: planFailures.length,
      limit: limit ?? null,
      truncated_by_limit: truncatedByLimit,
      recurring_ids_filter_count: recurringIdsFilter?.length ?? null,
      requested_not_active_or_missing: requestedMissing.length,
    },
  });

  return NextResponse.json({
    ok: true,
    recurring_ids_filter: recurringIdsFilter,
    requested_not_active_or_missing: requestedMissing,
    plans_eligible: eligibleAll.length,
    plans_processed: eligible.length,
    totals: {
      generated,
      skipped_duplicate: skippedDuplicate,
      skipped_other: skippedOther,
    },
    plan_failures: planFailures.slice(0, 80),
    truncated_by_limit: truncatedByLimit,
    limit_applied: limit ?? null,
  });
}
