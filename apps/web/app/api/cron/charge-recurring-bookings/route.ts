import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import {
  recurringAutoChargeMaxRetries,
  recurringChargeBackoffMsAfterFailure,
  recurringChargeGraceMs,
} from "@/lib/recurring/autoChargeRetryPolicy";
import { chargePaystackAuthorization } from "@/lib/recurring/chargePaystackAuthorization";
import { runRecurringPaymentLinkFallback } from "@/lib/recurring/recurringPaymentLinkFallback";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHARGE = 100;

function isChargeDue(row: { recurring_next_charge_attempt_at?: string | null }): boolean {
  const next = row.recurring_next_charge_attempt_at;
  if (!next) return true;
  return new Date(next).getTime() <= Date.now();
}

/**
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`.
 * Recurring auto-charge with lease-claim, exponential-ish backoff, grace window, then payment-link fallback.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!paystackSecret) return NextResponse.json({ error: "PAYSTACK_SECRET_KEY not configured." }, { status: 503 });

  const { data: bookings, error } = await admin
    .from("bookings")
    .select(
      "id, recurring_id, customer_email, paystack_reference, booking_snapshot, total_paid_zar, user_id, recurring_retry_count, recurring_first_failure_at, recurring_next_charge_attempt_at",
    )
    .eq("status", "pending_payment")
    .eq("is_recurring_generated", true)
    .is("recurring_fallback_at", null)
    .not("recurring_id", "is", null)
    .or("payment_status.is.null,payment_status.eq.pending")
    .limit(MAX_CHARGE);

  if (error) {
    await reportOperationalIssue("error", "cron/charge-recurring-bookings", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dueRows = (bookings ?? []).filter((b) => isChargeDue(b as { recurring_next_charge_attempt_at?: string | null }));

  let attempted = 0;
  let success = 0;
  let failed = 0;
  let fallback = 0;
  const nowIso = new Date().toISOString();
  const maxRetries = recurringAutoChargeMaxRetries();
  const graceMs = recurringChargeGraceMs();

  for (const b of dueRows) {
    const row = b as {
      id: string;
      recurring_id: string;
      customer_email: string | null;
      paystack_reference: string | null;
      booking_snapshot: unknown;
      total_paid_zar: number | string | null;
      user_id: string | null;
      recurring_retry_count: number | null;
      recurring_first_failure_at: string | null;
    };

    const { data: rec, error: recErr } = await admin
      .from("recurring_bookings")
      .select("paystack_authorization_code")
      .eq("id", row.recurring_id)
      .maybeSingle();

    if (recErr || !rec) continue;
    const authCode = String((rec as { paystack_authorization_code?: string | null }).paystack_authorization_code ?? "").trim();
    if (!authCode) continue;

    let email = normalizeEmail(String(row.customer_email ?? ""));
    if (!email && row.user_id) {
      const userRes = await admin.auth.admin.getUserById(row.user_id);
      email = normalizeEmail(String(userRes.data.user?.email ?? ""));
    }
    if (!email) {
      await logSystemEvent({
        level: "warn",
        source: "cron/charge-recurring-bookings",
        message: "auto_charge_skipped_no_email",
        context: { booking_id: row.id },
      });
      continue;
    }

    const totalZarRaw = row.total_paid_zar;
    const amountZar =
      typeof totalZarRaw === "number" && Number.isFinite(totalZarRaw)
        ? Math.round(totalZarRaw)
        : typeof totalZarRaw === "string" && /^\d+(\.\d+)?$/.test(totalZarRaw.trim())
          ? Math.round(Number(totalZarRaw))
          : 0;
    const amountCents = Math.max(0, amountZar) * 100;
    if (amountCents < 100) continue;

    const { data: claimed, error: claimErr } = await admin.rpc("try_claim_recurring_charge", {
      p_booking_id: row.id,
      p_lease_seconds: 120,
    });

    if (claimErr) {
      await reportOperationalIssue("warn", "cron/charge-recurring-bookings", claimErr.message, { bookingId: row.id });
      continue;
    }
    if (!claimed) continue;

    attempted++;

    await logSystemEvent({
      level: "info",
      source: "cron/charge-recurring-bookings",
      message: "auto_charge_attempt",
      context: {
        booking_id: row.id,
        recurring_id: row.recurring_id,
        amount_cents: amountCents,
        retry_count: row.recurring_retry_count ?? 0,
      },
    });

    const reference =
      typeof row.paystack_reference === "string" && row.paystack_reference.trim()
        ? row.paystack_reference.trim()
        : `rec_${row.id}`;

    const metadata: Record<string, unknown> = {
      shalean_booking_id: row.id,
      booking_json: JSON.stringify(row.booking_snapshot ?? {}),
    };

    const charge = await chargePaystackAuthorization({
      secret: paystackSecret,
      authorizationCode: authCode,
      email,
      amountCents,
      reference,
      metadata,
    });

    if (charge.ok) {
      success++;
      await logSystemEvent({
        level: "info",
        source: "cron/charge-recurring-bookings",
        message: "auto_charge_success",
        context: { booking_id: row.id, reference: charge.reference },
      });
      continue;
    }

    failed++;

    const { data: fresh } = await admin
      .from("bookings")
      .select("recurring_retry_count, recurring_first_failure_at")
      .eq("id", row.id)
      .maybeSingle();

    const prevRetry = Number((fresh as { recurring_retry_count?: number | null })?.recurring_retry_count ?? 0);
    const firstFailIso =
      (fresh as { recurring_first_failure_at?: string | null })?.recurring_first_failure_at?.trim() || nowIso;
    const nextRetry = prevRetry + 1;

    const graceExpired = Date.now() - new Date(firstFailIso).getTime() >= graceMs;
    const retriesExhausted = nextRetry >= maxRetries;
    const shouldFallback = retriesExhausted || graceExpired;

    if (shouldFallback) {
      await admin
        .from("bookings")
        .update({
          recurring_retry_count: nextRetry,
          recurring_first_failure_at: firstFailIso,
          recurring_next_charge_attempt_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "pending_payment");

      await logSystemEvent({
        level: "warn",
        source: "cron/charge-recurring-bookings",
        message: "auto_charge_failed",
        context: {
          booking_id: row.id,
          recurring_id: row.recurring_id,
          error: charge.message,
          retry_count: nextRetry,
          terminal: true,
        },
      });

      const okFb = await runRecurringPaymentLinkFallback(admin, row.id);
      if (okFb) fallback++;
      continue;
    }

    const backoffMs = recurringChargeBackoffMsAfterFailure(nextRetry);
    const nextAt = new Date(Date.now() + backoffMs).toISOString();

    await admin
      .from("bookings")
      .update({
        recurring_retry_count: nextRetry,
        recurring_first_failure_at: firstFailIso,
        recurring_next_charge_attempt_at: nextAt,
      })
      .eq("id", row.id)
      .eq("status", "pending_payment");

    await logSystemEvent({
      level: "warn",
      source: "cron/charge-recurring-bookings",
      message: "auto_charge_failed",
      context: {
        booking_id: row.id,
        recurring_id: row.recurring_id,
        error: charge.message,
        retry_count: nextRetry,
        next_charge_attempt_at: nextAt,
        terminal: false,
      },
    });
  }

  await logSystemEvent({
    level: "info",
    source: "cron/charge-recurring-bookings",
    message: "Cron finished",
    context: { scanned: bookings?.length ?? 0, due: dueRows.length, attempted, success, failed, fallback },
  });

  return NextResponse.json({
    ok: true,
    scanned: bookings?.length ?? 0,
    due: dueRows.length,
    attempted,
    success,
    failed,
    fallback,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
