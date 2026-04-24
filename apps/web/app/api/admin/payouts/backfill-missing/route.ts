import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MissingPayoutRow = {
  id: string;
  cleaner_id: string | null;
};

type UnresolvedMissingPayoutRow = MissingPayoutRow & {
  total_paid_cents?: number | null;
  amount_paid_cents?: number | null;
  total_paid_zar?: number | null;
  base_amount_cents?: number | null;
  service?: string | null;
};

async function getMissingPayoutStatus(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const { count } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed")
    .eq("is_test", false)
    .is("cleaner_payout_cents", null);

  const { data: unresolvedRows } = await admin
    .from("bookings")
    .select("id, cleaner_id, total_paid_cents, amount_paid_cents, total_paid_zar, base_amount_cents, service")
    .eq("status", "completed")
    .eq("is_test", false)
    .is("cleaner_payout_cents", null)
    .limit(20);

  const unresolved = ((unresolvedRows ?? []) as UnresolvedMissingPayoutRow[]).map((row) => {
    const cleanerId = String(row.cleaner_id ?? "").trim();
    const hasAmount =
      Number(row.total_paid_cents ?? row.amount_paid_cents ?? 0) > 0 ||
      (row.total_paid_zar != null && Number(row.total_paid_zar) > 0);
    const reason = !cleanerId ? "missing_cleaner_id" : !hasAmount ? "missing_paid_amount" : "persist_failed_or_skipped";
    return {
      bookingId: row.id,
      cleanerId: cleanerId || null,
      reason,
      totalPaidCents: row.total_paid_cents ?? row.amount_paid_cents ?? null,
      totalPaidZar: row.total_paid_zar ?? null,
      baseAmountCents: row.base_amount_cents ?? null,
      service: row.service ?? null,
    };
  });

  return { remaining: count ?? 0, unresolved };
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const status = await getMissingPayoutStatus(admin);
  return NextResponse.json({ ok: true, ...status });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("bookings")
    .select("id, cleaner_id")
    .eq("status", "completed")
    .eq("is_test", false)
    .is("cleaner_payout_cents", null)
    .not("cleaner_id", "is", null)
    .limit(1000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let fixed = 0;
  let skipped = 0;
  const failed: { bookingId: string; error: string }[] = [];

  for (const row of (data ?? []) as MissingPayoutRow[]) {
    const cleanerId = String(row.cleaner_id ?? "").trim();
    if (!cleanerId) {
      skipped += 1;
      continue;
    }
    const result = await persistCleanerPayoutIfUnset({ admin, bookingId: row.id, cleanerId });
    if (!result.ok) {
      failed.push({ bookingId: row.id, error: result.error });
      continue;
    }
    if (result.skipped) skipped += 1;
    else fixed += 1;
  }

  const { remaining, unresolved } = await getMissingPayoutStatus(admin);

  void logSystemEvent({
    level: failed.length ? "warn" : "info",
    source: "PAYOUT_BACKFILL_MISSING",
    message: "Completed booking payout backfill run",
    context: { fixed, skipped, failedCount: failed.length, remaining, unresolved, actor: auth.userId },
  });

  return NextResponse.json({
    ok: failed.length === 0,
    fixed,
    skipped,
    failed,
    remaining,
    unresolved,
  });
}
