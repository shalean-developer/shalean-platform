import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { backfillPaystackPaymentTransactions } from "@/lib/payments/backfillPaystackPaymentTransactions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const verify = url.searchParams.get("verify") === "1";

  const lockResult = await withCronLock(
    admin,
    { jobName: CRON_LOCK_KEYS.backfillPaystackPayments, leaseSeconds: 900 },
    async () =>
      backfillPaystackPaymentTransactions(admin, {
        limit: Number.isFinite(limit) ? limit : 50,
        verifyWithPaystack: verify,
      }),
  );

  if (lockResult.skipped) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason });
  }
  return NextResponse.json({ ok: true, ...lockResult.ranIt });
}
