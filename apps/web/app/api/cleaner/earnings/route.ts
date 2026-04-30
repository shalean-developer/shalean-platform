import { NextResponse } from "next/server";
import {
  bookingsVisibilityOrFilter,
  fetchCleanerTeamIds,
} from "@/lib/cleaner/cleanerBookingAccess";
import { earningsPeriodCentsFromRows } from "@/lib/cleaner/cleanerEarningsPeriodTotals";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { normalizeCleanerPayoutSummaryRow } from "@/lib/cleaner/normalizeCleanerPayoutSummaryRow";
import { touchPayoutIntegrityFirstSeen } from "@/lib/cleaner/touchPayoutIntegrityFirstSeen";
import { metrics } from "@/lib/metrics/counters";
import { newPayoutMoneyPathErrorId } from "@/lib/payout/payoutMoneyPathErrorId";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingEarningsRow = {
  id: string;
  service: string | null;
  date: string | null;
  completed_at: string | null;
  location: string | null;
  payout_status: string | null;
  payout_frozen_cents: number | null;
  display_earnings_cents: number | null;
  cleaner_payout_cents: number | null;
  is_team_job: boolean | null;
  payout_paid_at: string | null;
  payout_run_id: string | null;
};

type PaymentDetailsRow = {
  recipient_code: string | null;
};

function amountCentsForRow(row: BookingEarningsRow): number {
  return (
    resolveCleanerEarningsCents({
      payout_frozen_cents: row.payout_frozen_cents,
      display_earnings_cents: row.display_earnings_cents,
    }) ?? 0
  );
}

function shortLocation(loc: string | null | undefined, max = 44): string {
  const t = String(loc ?? "").trim();
  if (!t) return "—";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function enqueuePayoutIntegrityAnomalyLog(
  admin: SupabaseClient,
  message: "eligible_or_paid_without_frozen" | "paid_row_missing_timestamp",
  bookingId: string,
  extra: Record<string, unknown>,
): void {
  void (async () => {
    const error_id = newPayoutMoneyPathErrorId();
    const first_seen_at_utc = await touchPayoutIntegrityFirstSeen(admin, bookingId);
    void logSystemEvent({
      level: "error",
      source: "cleaner_earnings",
      message,
      context: { booking_id: bookingId, error_id, first_seen_at_utc, ...extra },
    });
  })();
}

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }

  const { data: cleaner } = await admin.from("cleaners").select("id").eq("id", session.cleanerId).maybeSingle();
  if (!cleaner) {
    return NextResponse.json({ error: "Not a cleaner account." }, { status: 403 });
  }

  const teamIds = await fetchCleanerTeamIds(admin, session.cleanerId);
  const visibilityOr = bookingsVisibilityOrFilter(session.cleanerId, teamIds);

  const [{ data: bookings, error }, { data: paymentDetails, error: paymentDetailsError }] = await Promise.all([
    admin
      .from("bookings")
      .select(
        "id, service, date, completed_at, location, payout_status, payout_frozen_cents, display_earnings_cents, cleaner_payout_cents, is_team_job, payout_paid_at, payout_run_id",
      )
      .or(visibilityOr)
      .eq("status", "completed")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(300),
    admin.from("cleaner_payment_details").select("recipient_code").eq("cleaner_id", session.cleanerId).maybeSingle(),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (paymentDetailsError) {
    return NextResponse.json({ error: paymentDetailsError.message }, { status: 500 });
  }

  const rows = (bookings ?? []) as BookingEarningsRow[];

  let pending_cents = 0;
  let eligible_cents = 0;
  let paid_cents = 0;
  let invalid_cents = 0;

  const out = rows.map((b) => {
    const rawPs = String(b.payout_status ?? "")
      .trim()
      .toLowerCase();
    if ((rawPs === "eligible" || rawPs === "paid") && b.payout_frozen_cents == null) {
      enqueuePayoutIntegrityAnomalyLog(admin, "eligible_or_paid_without_frozen", b.id, { payout_status: rawPs });
    }
    const cents = amountCentsForRow(b);
    const normalized = normalizeCleanerPayoutSummaryRow(
      {
        booking_id: b.id,
        date: b.date,
        service: b.service?.trim() || "Cleaning",
        location: shortLocation(b.location),
        payout_status: b.payout_status,
        payout_paid_at: b.payout_paid_at,
        payout_run_id: b.payout_run_id,
        payout_frozen_cents: b.payout_frozen_cents,
        amount_cents: cents,
      },
      {
        onPaidRowMissingTimestamp: (bookingId) =>
          enqueuePayoutIntegrityAnomalyLog(admin, "paid_row_missing_timestamp", bookingId, {}),
      },
    );

    if (normalized.payout_status === "pending") pending_cents += cents;
    else if (normalized.payout_status === "eligible") eligible_cents += cents;
    else if (normalized.payout_status === "paid") paid_cents += cents;
    else if (normalized.payout_status === "invalid") invalid_cents += cents;

    return {
      booking_id: normalized.booking_id,
      date: normalized.date,
      service: normalized.service,
      location: normalized.location,
      payout_status: normalized.payout_status,
      payout_frozen_cents: normalized.payout_frozen_cents,
      amount_cents: normalized.amount_cents,
      payout_paid_at: normalized.payout_paid_at,
      payout_run_id: normalized.payout_run_id,
      ...(normalized.__invalid ? { __invalid: true as const } : {}),
    };
  });

  const { today_cents, week_cents, month_cents } = earningsPeriodCentsFromRows(
    rows.map((b) => ({
      completed_at: b.completed_at,
      schedule_date: b.date,
      amount_cents: amountCentsForRow(b),
    })),
    new Date(),
  );

  const sumRowCents = out.reduce((acc, r) => acc + r.amount_cents, 0);
  const sumBucketCents = pending_cents + eligible_cents + paid_cents + invalid_cents;
  if (sumRowCents !== sumBucketCents) {
    void logSystemEvent({
      level: "warn",
      source: "cleaner_earnings",
      message: "earnings_summary_mismatch",
      context: {
        sumRowCents,
        sumBucketCents,
        row_count: out.length,
        cleaner_id: session.cleanerId,
      },
    });
  }

  const invalidPaidRowCount = out.filter(
    (r) => r.payout_status === "invalid" || (r as { __invalid?: boolean }).__invalid === true,
  ).length;
  if (invalidPaidRowCount > 0) {
    metrics.increment("payout.invalid_paid_rows_count", { rows: invalidPaidRowCount });
  }

  return NextResponse.json({
    summary: {
      pending_cents,
      eligible_cents,
      paid_cents,
      invalid_cents,
      today_cents,
      week_cents,
      month_cents,
    },
    paymentDetails: {
      readyForPayout: Boolean((paymentDetails as PaymentDetailsRow | null)?.recipient_code?.trim()),
      missingBankDetails: !((paymentDetails as PaymentDetailsRow | null)?.recipient_code?.trim()),
    },
    rows: out,
  });
}
