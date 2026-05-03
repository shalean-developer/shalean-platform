import { NextResponse } from "next/server";
import { getCleanerVisibleBookingsOrFilter } from "@/lib/cleaner/cleanerBookingAccess";
import {
  suggestedDailyGoalCentsFromWireRows,
  todayCentsAndBreakdownFromBookings,
  type CleanerDashboardEarningsWireRow,
} from "@/lib/cleaner/cleanerDashboardTodayCents";
import { earningsPeriodCentsFromRows } from "@/lib/cleaner/cleanerEarningsPeriodTotals";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { normalizeCleanerPayoutSummaryRow } from "@/lib/cleaner/normalizeCleanerPayoutSummaryRow";
import { touchPayoutIntegrityFirstSeen } from "@/lib/cleaner/touchPayoutIntegrityFirstSeen";
import { metrics } from "@/lib/metrics/counters";
import { buildLast7DaysEarningsPoints } from "@/lib/cleaner/earningsInsightsSeries";
import { computeCutoffAssignmentProbe } from "@/lib/cleaner/earnings/nextPayoutFriday";
import {
  computeEarningsFinanceShadow,
  filterPayoutCardsForJhbIsoWeek,
  isEarningsLedgerFlipReady,
} from "@/lib/cleaner/earningsLedgerShadowTotals";
import type { CleanerPayoutSummaryRow } from "@/lib/cleaner/cleanerPayoutSummaryTypes";
import { newPayoutMoneyPathErrorId } from "@/lib/payout/payoutMoneyPathErrorId";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingEarningsRow = {
  id: string;
  status: string | null;
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
  total_paid_zar?: unknown;
  amount_paid_cents?: unknown;
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

  const { data: cleanerRow } = await admin
    .from("cleaners")
    .select("id, full_name")
    .eq("id", session.cleanerId)
    .maybeSingle();
  if (!cleanerRow) {
    return NextResponse.json({ error: "Not a cleaner account." }, { status: 403 });
  }
  const cleanerFullName = String((cleanerRow as { full_name?: string | null }).full_name ?? "").trim() || null;

  const earningsFetchStartedMs = performance.now();

  const url = new URL(request.url);
  const fromYmd = parseYmd(url.searchParams.get("from"));
  const toYmd = parseYmd(url.searchParams.get("to"));
  const statusParam = String(url.searchParams.get("status") ?? "all").trim().toLowerCase();
  const statusFilter =
    statusParam === "pending" || statusParam === "approved" || statusParam === "paid" ? statusParam : "all";
  const useLedgerTotalsParam = String(url.searchParams.get("use_ledger_totals") ?? "")
    .trim()
    .toLowerCase();
  const useLedgerTotalsFromQuery = useLedgerTotalsParam === "true" || useLedgerTotalsParam === "1";
  const useLedgerTotalsEnv = process.env.USE_LEDGER_TOTALS === "true";
  const useLedgerTotals = useLedgerTotalsEnv || useLedgerTotalsFromQuery;

  const { orFilter: visibilityOr } = await getCleanerVisibleBookingsOrFilter(admin, session.cleanerId);

  const ledgerTotalsQuery = admin
    .from("cleaner_earnings")
    .select("amount_cents, status, booking_id")
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
        "id, status, service, date, completed_at, location, payout_id, payout_status, payout_frozen_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, is_team_job, payout_paid_at, payout_run_id, total_paid_zar, amount_paid_cents",
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

  /** Wall-clock when this response bundle was assembled (bookings + ledger queries already completed). */
  const as_of = new Date().toISOString();

  const rows = (bookings ?? []) as BookingEarningsRow[];

  const now = new Date();
  const goalWire: CleanerDashboardEarningsWireRow[] = rows.map((r) => ({
    id: r.id,
    status: "completed",
    date: r.date,
    completed_at: r.completed_at,
    cleaner_earnings_total_cents: r.cleaner_earnings_total_cents,
    payout_frozen_cents: r.payout_frozen_cents,
    display_earnings_cents: r.display_earnings_cents,
  }));
  const suggested_daily_goal_cents = suggestedDailyGoalCentsFromWireRows(goalWire, now);

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
    const customerPaid = bookingTotalCents(b);
    const platformFee =
      customerPaid != null
        ? customerPaid < cents
          ? null
          : Math.max(0, customerPaid - cents)
        : null;
    if (customerPaid != null && customerPaid < cents) {
      metrics.increment("cleaner.earnings_negative_estimate_seen", {
        booking_id: b.id,
        customer_paid_cents: customerPaid,
        cleaner_amount_cents: cents,
      });
    }
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
      booking_status: String(b.status ?? "completed").trim().toLowerCase(),
      is_team_job: Boolean(b.is_team_job),
      ...(normalized.__invalid ? { __invalid: true as const } : {}),
    };
  });

  const { today_cents } = todayCentsAndBreakdownFromBookings(
    rows.map((b) => ({
      id: b.id,
      service: b.service,
      status: "completed",
      date: b.date,
      completed_at: b.completed_at,
      cleaner_earnings_total_cents: b.cleaner_earnings_total_cents,
      payout_frozen_cents: b.payout_frozen_cents,
      display_earnings_cents: b.display_earnings_cents,
    })),
    now,
  );
  const { week_cents, month_cents } = earningsPeriodCentsFromRows(
    rows.map((b) => ({
      completed_at: b.completed_at,
      schedule_date: b.date,
      amount_cents: amountCentsForRow(b),
    })),
    now,
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

  const totalsAll = (ledgerTotalsRows ?? []) as {
    amount_cents?: number | null;
    status?: string | null;
    booking_id?: string | null;
  }[];
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

  const chartPoints = buildLast7DaysEarningsPoints(out as CleanerPayoutSummaryRow[], now);

  const shadowCards = out.map((r, i) => {
    const b = rows[i];
    const primary_completion_at_iso =
      typeof b?.completed_at === "string" && b.completed_at.trim()
        ? b.completed_at.trim()
        : typeof b?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date.trim())
          ? `${b.date.trim()}T12:00:00+02:00`
          : null;
    return {
      booking_id: r.booking_id,
      amount_cents: r.amount_cents,
      payout_status: r.payout_status,
      in_frozen_batch: Boolean(r.in_frozen_batch),
      is_team_job: Boolean(b?.is_team_job),
      cleaner_earnings_total_cents: b?.cleaner_earnings_total_cents ?? null,
      primary_completion_at_iso,
    };
  });
  const ledgerShadowRows = totalsAll.map((le) => ({
    booking_id: String(le.booking_id ?? ""),
    amount_cents: Math.max(0, Math.round(Number(le.amount_cents) || 0)),
    status: String(le.status ?? ""),
  }));
  const asOfMs = Date.parse(as_of);
  const shadowOpts = { asOfMs: Number.isFinite(asOfMs) ? asOfMs : Date.now() };
  const finance_shadow_core = computeEarningsFinanceShadow(shadowCards, ledgerShadowRows, shadowOpts);
  const weekSliceCards = filterPayoutCardsForJhbIsoWeek(shadowCards, new Date(as_of));
  const finance_shadow_jhb_week = computeEarningsFinanceShadow(weekSliceCards, ledgerShadowRows, shadowOpts);
  const finance_shadow = {
    ...finance_shadow_core,
    jhb_week: finance_shadow_jhb_week,
  };
  const cutoff_assignment_probe = computeCutoffAssignmentProbe(new Date(as_of));

  if (finance_shadow.shadow_mismatch) {
    metrics.increment("cleaner.earnings_shadow_totals_mismatch", {
      booking_ids_in_slice: finance_shadow.booking_ids_in_slice,
      delta_all_cents: finance_shadow.delta_all_cents,
      delta_direction: finance_shadow.delta_direction,
      bucket_aligned: finance_shadow.bucket_aligned,
      card_all_cents: finance_shadow.card.all_cents,
      ledger_all_cents: finance_shadow.ledger.all_cents,
      bucket_mapping_mismatch_count: finance_shadow.bucket_mapping_mismatch_count,
    });
  }
  if (finance_shadow.missing_ledger_expected_count_soft > 0) {
    metrics.increment("cleaner.earnings_missing_ledger_rows_soft", {
      count: finance_shadow.missing_ledger_expected_count_soft,
    });
  }
  if (finance_shadow.missing_ledger_expected_count_hard > 0) {
    metrics.increment("cleaner.earnings_missing_ledger_rows_hard", {
      count: finance_shadow.missing_ledger_expected_count_hard,
    });
  }
  if (finance_shadow.missing_ledger_expected_count > 0) {
    metrics.increment("cleaner.earnings_missing_ledger_rows", {
      count: finance_shadow.missing_ledger_expected_count,
    });
  }
  if (finance_shadow.bucket_mapping_mismatch_count > 0) {
    metrics.increment("cleaner.earnings_bucket_mapping_mismatch", {
      count: finance_shadow.bucket_mapping_mismatch_count,
    });
  }
  if (cutoff_assignment_probe.mismatch) {
    metrics.increment("cleaner.earnings_cutoff_assignment_mismatch", {
      kind: "earnings_api_probe",
      ui_payout_target_friday_ymd: cutoff_assignment_probe.ui_payout_target_friday_ymd,
      batch_pay_friday_jhb_ymd: cutoff_assignment_probe.batch_pay_friday_jhb_ymd,
    });
  }

  const earnings_ledger_flip_ready = isEarningsLedgerFlipReady(finance_shadow);
  metrics.increment("cleaner.earnings_ledger_flip_ready", {
    ready: earnings_ledger_flip_ready ? 1 : 0,
    use_ledger_totals: useLedgerTotals,
  });

  metrics.increment("cleaner.earnings_fetch", {
    latency_ms: Math.round(performance.now() - earningsFetchStartedMs),
    rows_count: out.length,
    earnings_chart_points_count: chartPoints.length,
    use_ledger_totals: useLedgerTotals,
  });

  const source_of_truth = useLedgerTotals ? ("ledger" as const) : ("booking" as const);
  const summaryPayload = {
    pending_cents: useLedgerTotals ? total_pending : pending_cents,
    eligible_cents: useLedgerTotals ? total_approved : eligible_cents,
    paid_cents: useLedgerTotals ? total_paid : paid_cents,
    invalid_cents,
    frozen_batch_cents,
    today_cents,
    week_cents,
    month_cents,
    /** Same 7-day JHB logic as `GET /api/cleaner/dashboard` — single source for goal UI. */
    suggested_daily_goal_cents,
  };

  return NextResponse.json({
    as_of,
    /**
     * `"booking"`: card buckets + `rows` are booking-derived; ledger is shadowed.
     * `"ledger"` (with `?use_ledger_totals=true`): summary pending/eligible/paid mirror full-ledger totals; rows unchanged.
     */
    source_of_truth,
    use_ledger_totals: useLedgerTotals,
    earnings_ledger_flip_ready,
    finance_shadow,
    cutoff_assignment_probe,
    total_pending,
    total_approved,
    total_paid,
    total_all_time,
    summary: summaryPayload,
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
    cleaner: { full_name: cleanerFullName },
    rows: out,
  });
}
