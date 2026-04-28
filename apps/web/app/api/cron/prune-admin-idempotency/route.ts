import { NextResponse } from "next/server";

import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`.
 * Deletes expired admin API idempotency rows (`expires_at` in the past), including billing-switch replay rows.
 *
 * Suggested schedule: daily — POST /api/cron/prune-admin-idempotency
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const nowIso = new Date().toISOString();
  const { error } = await admin.from("admin_api_idempotency").delete().lt("expires_at", nowIso);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: errBookingCreate } = await admin
    .from("admin_booking_create_idempotency")
    .delete()
    .lt("expires_at", nowIso);

  if (errBookingCreate) {
    return NextResponse.json({ error: errBookingCreate.message }, { status: 500 });
  }

  const { error: errBillingSwitch } = await admin.from("admin_billing_idempotency").delete().lt("expires_at", nowIso);

  if (errBillingSwitch) {
    return NextResponse.json({ error: errBillingSwitch.message }, { status: 500 });
  }

  await logSystemEvent({
    level: "info",
    source: "cron/prune-admin-idempotency",
    message: "pruned_admin_api_idempotency_expired",
    context: {
      before: nowIso,
      tables: ["admin_api_idempotency", "admin_booking_create_idempotency", "admin_billing_idempotency"],
    },
  });

  return NextResponse.json({ ok: true });
}
