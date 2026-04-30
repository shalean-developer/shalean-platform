import { NextResponse } from "next/server";
import {
  appendRosterBookingIdsToOrFilter,
  bookingsVisibilityOrFilter,
  fetchBookingIdsWhereCleanerOnRoster,
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
  payout_id: string | null;
  payout_status: string | null;
  payout_frozen_cents: number | null;
  display_earnings_cents: number | null;
  cleaner_earnings_total_cents: number | null;
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
      cleaner_earnings_total_cents: row.cleaner_earnings_total_cents,
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

function parseYmd(raw: string | null): string | null {
  const t = String(raw ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function serviceLabelFromBooking(row: {
  service?: string | null;
  price_snapshot?: unknown;
}): string {
  const s = String(row.service ?? "").trim();
  if (s) return s;
  const snap = row.price_snapshot;
  if (snap && typeof snap === "object" && snap !== null && "service_type" in snap) {
    const st = String((snap as { service_type?: string }).service_type ?? "").trim();
    if (st) return st.replace(/-/g, " ");
  }
  return "Cleaning";
}

function bookingTotalCents(row: { total_paid_zar?: unknown; amount_paid_cents?: unknown }): number | null {
  const z = row.total_paid_zar;
  if (typeof z === "number" && Number.isFinite(z)) return Math.max(0, Math.round(z * 100));
  if (typeof z === "string" && z.trim()) {
    const n = Number(z.trim());
    if (Number.isFinite(n)) return Math.max(0, Math.round(n * 100));
  }
  const ap = row.amount_paid_cents;
  if (typeof ap === "number" && Number.isFinite(ap)) return Math.max(0, Math.round(ap));
  return null;
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

  const url = new URL(request.url);
  const fromYmd = parseYmd(url.searchParams.get("from"));
  const toYmd = parseYmd(url.searchParams.get("to"));
  const statusParam = String(url.searchParams.get("status") ?? "all").trim().toLowerCase();
  const statusFilter =
    statusParam === "pending" || statusParam === "approved" || statusParam === "paid" ? statusParam : "all";

  const teamIds = await fetchCleanerTeamIds(admin, session.cleanerId);
  const rosterBookingIds = await fetchBookingIdsWhereCleanerOnRoster(admin, session.cleanerId);
  const visibilityOr = appendRosterBookingIdsToOrFilter(
    bookingsVisibilityOrFilter(session.cleanerId, teamIds),
    rosterBookingIds,
  );

  const ledgerTotalsQuery = admin
    .from("cleaner_earnings")
    .select("amount_cents, status")
    .eq("cleaner_id", session.cleanerId)
    .limit(10_000);

  let ledgerFilteredQuery = admin
    .from("cleaner_earnings")
    .select("id, booking_id, amount_cents, status, created_at, approved_at, paid_at")
    .eq("cleaner_id", session.cleanerId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (fromYmd) {
    ledgerFilteredQuery = ledgerFilteredQuery.gte("created_at", `${fromYmd}T00:00:00.000Z`);
  }
  if (toYmd) {
    ledgerFilteredQuery = ledgerFilteredQuery.lte("created_at", `${toYmd}T23:59:59.999Z`);
  }
  if (statusFilter !== "all") {
    ledgerFilteredQuery = ledgerFilteredQuery.eq("status", statusFilter);
  }

  const [
    { data: bookings, error },
    { data: paymentDetails, error: paymentDetailsError },
    { data: ledgerTotalsRows, error: ledgerTotalsErr },
    { data: ledgerRows, error: ledgerErr },
  ] = await Promise.all([
    admin
      .from("bookings")
      .select(
        "id, service, date, completed_at, location, payout_id, payout_status, payout_frozen_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, is_team_job, payout_paid_at, payout_run_id",
      )
      .or(visibilityOr)
      .eq("status", "completed")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(300),
    admin.from("cleaner_payment_details").select("recipient_code").eq("cleaner_id", session.cleanerId).maybeSingle(),
    ledgerTotalsQuery,
    ledgerFilteredQuery,
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (paymentDetailsError) {
    return NextResponse.json({ error: paymentDetailsError.message }, { status: 500 });
  }
  if (ledgerTotalsErr) {
    return NextResponse.json({ error: ledgerTotalsErr.message }, { status: 500 });
  }
  if (ledgerErr) {
    return NextResponse.json({ error: ledgerErr.message }, { status: 500 });
  }

  const rows = (bookings ?? []) as BookingEarningsRow[];

  const [{ data: lockedPayouts }, { data: failedTransfers }] = await Promise.all([
    admin.from("cleaner_payouts").select("id").eq("cleaner_id", session.cleanerId).in("status", ["frozen", "approved"]),
    admin
      .from("cleaner_payouts")
      .select("id")
      .eq("cleaner_id", session.cleanerId)
      .eq("status", "approved")
      .in("payment_status", ["failed", "partial_failed"])
      .limit(3),
  ]);

  const lockedWeeklyPayoutIds = new Set(
    (lockedPayouts ?? []).map((x) => String((x as { id?: string }).id ?? "")).filter(Boolean),
  );

  const has_failed_transfer = (failedTransfers ?? []).length > 0;

  let pending_cents = 0;
  let eligible_cents = 0;
  let paid_cents = 0;
  let invalid_cents = 0;
  let frozen_batch_cents = 0;

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

    const pid = String(b.payout_id ?? "").trim();
    const inLockedWeeklyBatch = Boolean(pid && lockedWeeklyPayoutIds.has(pid));
    if (inLockedWeeklyBatch) {
      frozen_batch_cents += cents;
    } else if (normalized.payout_status === "pending") pending_cents += cents;
    else if (normalized.payout_status === "eligible") eligible_cents += cents;
    else if (normalized.payout_status === "paid") paid_cents += cents;
    else if (normalized.payout_status === "invalid") invalid_cents += cents;

    return {
      booking_id: normalized.booking_id,
      date: normalized.date,
      completed_at: b.completed_at,
      service: normalized.service,
      location: normalized.location,
      payout_status: normalized.payout_status,
      payout_frozen_cents: normalized.payout_frozen_cents,
      amount_cents: normalized.amount_cents,
      payout_paid_at: normalized.payout_paid_at,
      payout_run_id: normalized.payout_run_id,
      in_frozen_batch: inLockedWeeklyBatch,
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

  const ledgerList = (ledgerRows ?? []) as {
    id: string;
    booking_id: string;
    amount_cents: number;
    status: string;
    created_at: string;
    approved_at?: string | null;
    paid_at?: string | null;
  }[];

  const totalsAll = (ledgerTotalsRows ?? []) as { amount_cents?: number | null; status?: string | null }[];
  let total_pending = 0;
  let total_approved = 0;
  let total_paid = 0;
  let total_all_time = 0;
  for (const le of totalsAll) {
    const c = Math.max(0, Math.round(Number(le.amount_cents) || 0));
    total_all_time += c;
    const st = String(le.status ?? "").toLowerCase();
    if (st === "pending") total_pending += c;
    else if (st === "approved") total_approved += c;
    else if (st === "paid") total_paid += c;
  }

  let ledger_pending = 0;
  let ledger_approved = 0;
  let ledger_paid = 0;
  for (const le of ledgerList) {
    const c = Math.max(0, Math.round(Number(le.amount_cents) || 0));
    const st = String(le.status ?? "").toLowerCase();
    if (st === "pending") ledger_pending += c;
    else if (st === "approved") ledger_approved += c;
    else if (st === "paid") ledger_paid += c;
  }

  const bookingDateById = new Map(rows.map((b) => [b.id, b.date]));
  const ledgerBookingIds = [...new Set(ledgerList.map((le) => le.booking_id))].filter(Boolean);
  const metaByBooking = new Map<
    string,
    { date: string | null; service_label: string; total_booking_cents: number | null }
  >();
  for (const b of rows) {
    metaByBooking.set(b.id, {
      date: b.date ?? null,
      service_label: b.service?.trim() || "Cleaning",
      total_booking_cents: null,
    });
  }
  if (ledgerBookingIds.length > 0) {
    const { data: metaRows } = await admin
      .from("bookings")
      .select("id, date, service, price_snapshot, total_paid_zar, amount_paid_cents")
      .in("id", ledgerBookingIds);
    for (const x of metaRows ?? []) {
      const row = x as {
        id?: string;
        date?: string | null;
        service?: string | null;
        price_snapshot?: unknown;
        total_paid_zar?: unknown;
        amount_paid_cents?: unknown;
      };
      if (!row.id) continue;
      const id = String(row.id);
      metaByBooking.set(id, {
        date: row.date ?? bookingDateById.get(id) ?? null,
        service_label: serviceLabelFromBooking(row),
        total_booking_cents: bookingTotalCents(row),
      });
      bookingDateById.set(id, row.date ?? bookingDateById.get(id) ?? null);
    }
  }

  const sumRowCents = out.reduce((acc, r) => acc + r.amount_cents, 0);
  const sumBucketCents = pending_cents + eligible_cents + paid_cents + invalid_cents + frozen_batch_cents;
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
    total_pending,
    total_approved,
    total_paid,
    total_all_time,
    summary: {
      pending_cents,
      eligible_cents,
      paid_cents,
      invalid_cents,
      frozen_batch_cents,
      today_cents,
      week_cents,
      month_cents,
    },
    line_item_ledger: {
      total_pending_cents: ledger_pending,
      total_approved_cents: ledger_approved,
      total_paid_cents: ledger_paid,
      rows: ledgerList.map((le) => {
        const meta = metaByBooking.get(le.booking_id);
        return {
          earnings_id: le.id,
          booking_id: le.booking_id,
          date: meta?.date ?? bookingDateById.get(le.booking_id) ?? null,
          service_label: meta?.service_label ?? "Cleaning",
          total_booking_cents: meta?.total_booking_cents ?? null,
          amount_cents: Math.max(0, Math.round(Number(le.amount_cents) || 0)),
          status: String(le.status ?? "").toLowerCase(),
          created_at: le.created_at,
          approved_at: le.approved_at ?? null,
          paid_at: le.paid_at ?? null,
        };
      }),
    },
    has_failed_transfer,
    paymentDetails: {
      readyForPayout: Boolean((paymentDetails as PaymentDetailsRow | null)?.recipient_code?.trim()),
      missingBankDetails: !((paymentDetails as PaymentDetailsRow | null)?.recipient_code?.trim()),
    },
    rows: out,
  });
}
