import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";
import { newPayoutMoneyPathErrorId } from "@/lib/payout/payoutMoneyPathErrorId";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonRetryable<T extends object>(body: T, status: number): NextResponse {
  const retryable = "retryable" in body && (body as { retryable?: unknown }).retryable === true;
  return NextResponse.json(body, {
    status,
    ...(retryable ? { headers: { "X-Retryable": "1" } } : {}),
  });
}

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { cleaner_ids?: unknown };
  try {
    body = (await request.json()) as { cleaner_ids?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const raw = body.cleaner_ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: "cleaner_ids must be a non-empty array." }, { status: 400 });
  }

  const cleanerIds = [...new Set(raw.map((x) => String(x ?? "").trim()).filter(Boolean))].filter(isUuidLike);
  if (cleanerIds.length === 0) {
    return NextResponse.json({ error: "No valid cleaner UUIDs in cleaner_ids." }, { status: 400 });
  }
  if (cleanerIds.length > 500) {
    return NextResponse.json({ error: "Too many cleaner_ids (max 500)." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: rpcRows, error: rpcError } = await admin.rpc("admin_mark_payout_paid", {
    p_cleaner_ids: cleanerIds,
  });

  if (rpcError) {
    return jsonRetryable({ error: rpcError.message, retryable: true as const }, 500);
  }

  const rpc0 = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  const updatedCount = Math.max(0, Math.round(Number((rpc0 as { updated_count?: unknown })?.updated_count ?? 0)));
  const payoutRunId = String((rpc0 as { payout_run_id?: unknown })?.payout_run_id ?? "").trim();

  if (!payoutRunId || !/^[0-9a-f-]{36}$/i.test(payoutRunId)) {
    return jsonRetryable(
      { error: "Mark-paid RPC returned an invalid payout_run_id.", retryable: true as const },
      500,
    );
  }

  if (updatedCount === 0) {
    const idList = cleanerIds.join(",");
    const { count: eligibleLeft, error: eligErr } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .or(`cleaner_id.in.(${idList}),payout_owner_cleaner_id.in.(${idList})`)
      .eq("payout_status", "eligible");

    if (eligErr) return NextResponse.json({ error: eligErr.message }, { status: 500 });

    const n = eligibleLeft ?? 0;
    if (n === 0) {
      return NextResponse.json(
        { ok: true as const, updated_count: 0, replayed: true as const },
        { headers: { "X-Idempotent-Replayed": "1" } },
      );
    }

    void logSystemEvent({
      level: "error",
      source: "admin_payout_run",
      message: "mark_paid_zero_but_eligible_remain",
      context: { cleaner_ids: cleanerIds, eligible_remaining: n, admin_email: auth.email },
    });
    return NextResponse.json(
      {
        ok: false as const,
        error: "mark_paid_stale_or_conflict",
        message: "Eligible rows exist for these cleaners but none were updated. Retry or investigate.",
      },
      { status: 409 },
    );
  }

  const { data: updated, error } = await admin
    .from("bookings")
    .select("id, payout_frozen_cents, display_earnings_cents, cleaner_payout_cents, is_team_job")
    .eq("payout_run_id", payoutRunId);

  if (error) {
    return jsonRetryable({ error: error.message, retryable: true as const }, 500);
  }

  const rows = (updated ?? []) as {
    id: string;
    payout_frozen_cents?: number | null;
    display_earnings_cents?: number | null;
    cleaner_payout_cents?: number | null;
    is_team_job?: boolean | null;
  }[];

  if (rows.length === 0) {
    const error_id = newPayoutMoneyPathErrorId();
    metrics.increment("payout.mark_paid_readback_failures", { kind: "empty", error_id });
    void logSystemEvent({
      level: "error",
      source: "admin_payout_run",
      message: "mark_paid_readback_empty",
      context: {
        error_id,
        cleaner_ids: cleanerIds,
        payout_run_id: payoutRunId,
        updated_count: updatedCount,
        admin_email: auth.email,
      },
    });
    return jsonRetryable(
      { error: "Mark-paid succeeded but read-back returned no rows.", retryable: true as const, error_id },
      500,
    );
  }

  if (rows.length !== updatedCount) {
    const incomplete = rows.length < updatedCount;
    const error_id = newPayoutMoneyPathErrorId();
    void logSystemEvent({
      level: "error",
      source: "admin_payout_run",
      message: incomplete ? "payout_run_readback_incomplete" : "payout_run_readback_mismatch",
      context: {
        error_id,
        cleaner_ids: cleanerIds,
        payout_run_id: payoutRunId,
        rpc_updated_count: updatedCount,
        readback_count: rows.length,
        admin_email: auth.email,
      },
    });
    metrics.increment("payout.mark_paid_readback_failures", {
      kind: incomplete ? "incomplete" : "mismatch",
      error_id,
    });
    return jsonRetryable(
      {
        error: incomplete ? "payout_run_readback_incomplete" : "payout_run_readback_mismatch",
        message: incomplete
          ? "Fewer bookings were read back than the RPC reported updated. Aborting success response."
          : "Mark-paid count did not match read-back rows.",
        retryable: true as const,
        error_id,
      },
      500,
    );
  }

  let totalCents = 0;
  for (const r of rows) {
    totalCents +=
      resolveCleanerEarningsCents({
        payout_frozen_cents: r.payout_frozen_cents,
        display_earnings_cents: r.display_earnings_cents,
      }) ?? 0;
  }

  void logSystemEvent({
    level: "info",
    source: "admin_payout_run",
    message: `Marked invoice-eligible bookings paid for ${cleanerIds.length} cleaner(s), ${updatedCount} booking(s).`,
    context: {
      cleaner_ids: cleanerIds,
      payout_run_id: payoutRunId,
      total_amount_cents: totalCents,
      count: updatedCount,
      admin_email: auth.email,
    },
  });

  return NextResponse.json({ ok: true as const, updated_count: updatedCount, payout_run_id: payoutRunId });
}
