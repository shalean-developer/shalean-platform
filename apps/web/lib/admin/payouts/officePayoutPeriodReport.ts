import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCleanerDashboardEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import {
  getJohannesburgMonthBoundsContainingYmd,
  isMonthlyPayoutBatchPeriod,
} from "@/lib/payout/monthBounds";
import { MONTHLY_PAYOUT_START_YMD } from "@/lib/payout/payoutPeriodConfig";
import { parseBookingEarningsSummary } from "@/lib/payout/bookingEarningsSummary";
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export type PayoutBucket = "pending" | "eligible" | "batched_open" | "paid";

export type OfficePayoutPeriodTotals = {
  visit_count: number;
  earned_cents: number;
  pending_cents: number;
  pending_visits: number;
  eligible_cents: number;
  eligible_visits: number;
  batched_open_cents: number;
  batched_open_visits: number;
  paid_cents: number;
  paid_visits: number;
  batch_count: number;
  batch_cents: number;
  /** Customer revenue collected on completed visits in the period. */
  total_revenue_cents: number;
  /** Company share (stored `company_revenue_cents`) on those visits. */
  company_earnings_cents: number;
  margin_percent: number | null;
};

export type OfficePayoutCleanerRow = {
  cleaner_id: string;
  cleaner_name: string;
  visit_count: number;
  earned_cents: number;
  pending_cents: number;
  pending_visits: number;
  eligible_cents: number;
  eligible_visits: number;
  batched_open_cents: number;
  batched_open_visits: number;
  paid_cents: number;
  paid_visits: number;
};

export type OfficePayoutBatchRow = {
  id: string;
  cleaner_id: string;
  cleaner_name: string;
  booking_count: number;
  total_amount_cents: number;
  calculated_amount_cents: number | null;
  adjustment_note: string | null;
  amount_adjusted_at: string | null;
  status: string;
  payment_status: string | null;
  payment_reference: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
};

export type OfficePayoutPeriodReport = {
  range: { from: string; to: string };
  totals: OfficePayoutPeriodTotals;
  cleaners: OfficePayoutCleanerRow[];
  payouts: OfficePayoutBatchRow[];
};

type BookingPeriodRow = {
  id: string;
  date: string | null;
  cleaner_id: string | null;
  payout_owner_cleaner_id: string | null;
  payout_status: string | null;
  payout_id: string | null;
  payout_frozen_cents: number | null;
  display_earnings_cents: number | null;
  cleaner_earnings_total_cents: number | null;
  cleaner_payout_cents: number | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  total_paid_cents: number | null;
  company_revenue_cents: number | null;
  earnings_summary?: unknown;
};

export type RosterCleanerRef = { cleaner_id: string; role?: string | null };

export type CleanerVisitAllocation = { cleaner_id: string; cents: number };
type PayoutDbRow = {
  id: string;
  cleaner_id: string;
  total_amount_cents: number;
  calculated_amount_cents?: number | null;
  adjustment_note?: string | null;
  amount_adjusted_at?: string | null;
  status: string;
  payment_status?: string | null;
  payment_reference?: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
  approved_at?: string | null;
  paid_at?: string | null;
};

export function parsePayoutPeriodYmd(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  return YMD_RE.test(t) ? t : null;
}

/** Default report window: full Johannesburg calendar month (from July 2026 epoch). */
export function defaultOfficePayoutPeriodRange(now = new Date()): { from: string; to: string } {
  const todayYmd = todayYmdJohannesburg(now);
  const anchorYmd = todayYmd < MONTHLY_PAYOUT_START_YMD ? MONTHLY_PAYOUT_START_YMD : todayYmd;
  const { periodStart, periodEnd } = getJohannesburgMonthBoundsContainingYmd(anchorYmd);
  return { from: periodStart, to: periodEnd };
}

export function normalizeOfficePayoutPeriodRange(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
  now = new Date(),
): { from: string; to: string } {
  const defaults = defaultOfficePayoutPeriodRange(now);
  let from = parsePayoutPeriodYmd(fromRaw) ?? defaults.from;
  let to = parsePayoutPeriodYmd(toRaw) ?? defaults.to;
  if (from < MONTHLY_PAYOUT_START_YMD) from = MONTHLY_PAYOUT_START_YMD;
  if (to < MONTHLY_PAYOUT_START_YMD) to = MONTHLY_PAYOUT_START_YMD;
  if (from > to) return { from: to, to: from };
  return { from, to };
}

/** Weekly batch period overlaps an inclusive YMD window. */
export function payoutPeriodOverlapsRange(
  periodStart: string,
  periodEnd: string,
  from: string,
  to: string,
): boolean {
  return periodStart <= to && periodEnd >= from;
}

export function payrollCleanerId(row: {
  cleaner_id?: string | null;
  payout_owner_cleaner_id?: string | null;
}): string {
  return String(row.cleaner_id ?? "").trim() || String(row.payout_owner_cleaner_id ?? "").trim();
}

export function classifyBookingPayoutBucket(
  payoutStatus: string | null | undefined,
  payoutId: string | null | undefined,
  batchStatusById: ReadonlyMap<string, string>,
): PayoutBucket {
  const ps = String(payoutStatus ?? "")
    .trim()
    .toLowerCase();
  if (ps === "paid") return "paid";

  const batchId = String(payoutId ?? "").trim();
  if (batchId) {
    const batchSt = String(batchStatusById.get(batchId) ?? "")
      .trim()
      .toLowerCase();
    if (batchSt === "paid") return "paid";
    return "batched_open";
  }

  if (ps === "eligible") return "eligible";
  return "pending";
}

function emptyCleanerRow(cleanerId: string, cleanerName: string): OfficePayoutCleanerRow {
  return {
    cleaner_id: cleanerId,
    cleaner_name: cleanerName,
    visit_count: 0,
    earned_cents: 0,
    pending_cents: 0,
    pending_visits: 0,
    eligible_cents: 0,
    eligible_visits: 0,
    batched_open_cents: 0,
    batched_open_visits: 0,
    paid_cents: 0,
    paid_visits: 0,
  };
}

function emptyTotals(): OfficePayoutPeriodTotals {
  return {
    visit_count: 0,
    earned_cents: 0,
    pending_cents: 0,
    pending_visits: 0,
    eligible_cents: 0,
    eligible_visits: 0,
    batched_open_cents: 0,
    batched_open_visits: 0,
    paid_cents: 0,
    paid_visits: 0,
    batch_count: 0,
    batch_cents: 0,
    total_revenue_cents: 0,
    company_earnings_cents: 0,
    margin_percent: null,
  };
}

/** Customer revenue for a completed visit — stored payment fields, then earnings summary. */
export function bookingCustomerRevenueCents(
  b: Pick<BookingPeriodRow, "total_paid_zar" | "amount_paid_cents" | "total_paid_cents" | "earnings_summary">,
): number {
  const z = Number(b.total_paid_zar);
  if (Number.isFinite(z) && z > 0) return Math.max(0, Math.round(z * 100));
  for (const raw of [b.amount_paid_cents, b.total_paid_cents]) {
    const paid = Number(raw);
    if (Number.isFinite(paid) && paid > 0) return Math.max(0, Math.round(paid));
  }
  const summary = parseBookingEarningsSummary(b.earnings_summary);
  const customer = Number(summary?.customer_total_cents);
  return Number.isFinite(customer) && customer > 0 ? Math.round(customer) : 0;
}

/** Company share for a completed visit — stored column, then earnings summary. */
export function bookingCompanyEarningsCents(
  b: Pick<BookingPeriodRow, "company_revenue_cents" | "earnings_summary">,
): number {
  if (b.company_revenue_cents != null) {
    const stored = Number(b.company_revenue_cents);
    if (Number.isFinite(stored) && stored >= 0) return Math.round(stored);
  }
  const summary = parseBookingEarningsSummary(b.earnings_summary);
  const fromSummary = Number(summary?.company_revenue_cents);
  return Number.isFinite(fromSummary) && fromSummary >= 0 ? Math.round(fromSummary) : 0;
}

function applyBucket(row: OfficePayoutCleanerRow, bucket: PayoutBucket, cents: number) {
  if (bucket === "pending") {
    row.pending_cents += cents;
    row.pending_visits += 1;
  } else if (bucket === "eligible") {
    row.eligible_cents += cents;
    row.eligible_visits += 1;
  } else if (bucket === "batched_open") {
    row.batched_open_cents += cents;
    row.batched_open_visits += 1;
  } else {
    row.paid_cents += cents;
    row.paid_visits += 1;
  }
}

function applyBookingBucketToTotals(totals: OfficePayoutPeriodTotals, bucket: PayoutBucket, allocCents: number) {
  if (bucket === "pending") {
    totals.pending_cents += allocCents;
    totals.pending_visits += 1;
  } else if (bucket === "eligible") {
    totals.eligible_cents += allocCents;
    totals.eligible_visits += 1;
  } else if (bucket === "batched_open") {
    totals.batched_open_cents += allocCents;
    totals.batched_open_visits += 1;
  } else {
    totals.paid_cents += allocCents;
    totals.paid_visits += 1;
  }
}

/** Roll one booking into period totals using per-cleaner allocations (matches the by-cleaner table). */
export function accumulateBookingIntoPeriodTotals(
  totals: OfficePayoutPeriodTotals,
  bucket: PayoutBucket,
  allocations: readonly CleanerVisitAllocation[],
  revenueCents: number,
  companyCents: number,
): void {
  if (!allocations.length) return;
  totals.visit_count += 1;
  totals.total_revenue_cents += revenueCents;
  totals.company_earnings_cents += companyCents;
  for (const alloc of allocations) {
    totals.earned_cents += alloc.cents;
    applyBookingBucketToTotals(totals, bucket, alloc.cents);
  }
}

/**
 * Split a completed booking across payroll cleaners — includes `booking_cleaners` roster
 * members even when earnings JSON only lists the lead (paired / dual-cleaner jobs).
 * Per-cleaner cents match {@link resolveCleanerDashboardEarningsCents} (cleaner dashboard).
 */
export function perCleanerAllocationsForBooking(
  booking: Pick<
    BookingPeriodRow,
    | "earnings_summary"
    | "cleaner_id"
    | "payout_owner_cleaner_id"
    | "display_earnings_cents"
    | "cleaner_payout_cents"
    | "cleaner_earnings_total_cents"
    | "payout_frozen_cents"
  >,
  roster: readonly RosterCleanerRef[],
  teamMemberPayouts?: readonly { cleaner_id: string; payout_cents: number }[],
): CleanerVisitAllocation[] {
  const summary = parseBookingEarningsSummary(booking.earnings_summary);
  const rosterIds = [
    ...new Set(
      roster
        .map((r) => String(r.cleaner_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const primary = payrollCleanerId(booking);
  const teamPayoutCentsByCleanerId = new Map(
    (teamMemberPayouts ?? [])
      .map((row) => {
        const cleanerId = String(row.cleaner_id ?? "").trim();
        const cents = Math.max(0, Math.round(Number(row.payout_cents) || 0));
        return [cleanerId, cents] as const;
      })
      .filter(([cleanerId, cents]) => cleanerId && cents > 0),
  );
  const centsFor = (cleanerId: string) =>
    resolveCleanerDashboardEarningsCents(
      {
        ...booking,
        viewer_payout_cents: teamPayoutCentsByCleanerId.get(cleanerId),
      },
      cleanerId,
    );

  if (summary?.per_cleaner_earnings?.length) {
    const out: CleanerVisitAllocation[] = [];
    const seen = new Set<string>();
    for (const row of summary.per_cleaner_earnings) {
      const cid = String(row.cleaner_id ?? "").trim();
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      out.push({ cleaner_id: cid, cents: centsFor(cid) });
    }
    for (const cid of rosterIds) {
      if (seen.has(cid)) continue;
      seen.add(cid);
      out.push({ cleaner_id: cid, cents: centsFor(cid) });
    }
    mergeTeamMemberPayoutAllocations(out, seen, teamMemberPayouts);
    if (out.length) return out;
  }

  if (rosterIds.length > 0) {
    const seen = new Set<string>();
    const out = rosterIds.map((cid) => {
      seen.add(cid);
      return {
        cleaner_id: cid,
        cents: centsFor(cid),
      };
    });
    mergeTeamMemberPayoutAllocations(out, seen, teamMemberPayouts);
    return out;
  }

  if (teamMemberPayouts?.length) {
    const seen = new Set<string>();
    const out: CleanerVisitAllocation[] = [];
    mergeTeamMemberPayoutAllocations(out, seen, teamMemberPayouts);
    if (out.length) return out;
  }

  if (primary) return [{ cleaner_id: primary, cents: centsFor(primary) }];
  return [];
}

function mergeTeamMemberPayoutAllocations(
  out: CleanerVisitAllocation[],
  seen: Set<string>,
  teamMemberPayouts?: readonly { cleaner_id: string; payout_cents: number }[],
): void {
  if (!teamMemberPayouts?.length) return;
  for (const row of teamMemberPayouts) {
    const cid = String(row.cleaner_id ?? "").trim();
    if (!cid || seen.has(cid)) continue;
    const cents = Math.max(0, Math.round(Number(row.payout_cents) || 0));
    if (cents <= 0) continue;
    seen.add(cid);
    out.push({ cleaner_id: cid, cents });
  }
}

/** Whether a cleaner receives payroll credit on a visit (same basis as the payouts visit list). */
export function cleanerHasPayoutAllocationOnBooking(
  booking: Parameters<typeof perCleanerAllocationsForBooking>[0],
  roster: readonly RosterCleanerRef[],
  cleanerId: string,
): boolean {
  const target = String(cleanerId ?? "").trim();
  if (!target) return false;
  return perCleanerAllocationsForBooking(booking, roster).some((alloc) => alloc.cleaner_id === target);
}

export async function loadTeamJobMemberPayoutsByBookingIds(
  admin: SupabaseClient,
  bookingIds: string[],
): Promise<Map<string, { cleaner_id: string; payout_cents: number }[]>> {
  const map = new Map<string, { cleaner_id: string; payout_cents: number }[]>();
  if (!bookingIds.length) return map;

  for (let i = 0; i < bookingIds.length; i += 120) {
    const slice = bookingIds.slice(i, i + 120);
    const { data, error } = await admin
      .from("team_job_member_payouts")
      .select("booking_id, cleaner_id, payout_cents")
      .in("booking_id", slice);
    if (error) throw new Error(error.message);
    for (const raw of data ?? []) {
      const row = raw as { booking_id?: string; cleaner_id?: string; payout_cents?: number | null };
      const bid = String(row.booking_id ?? "").trim();
      const cid = String(row.cleaner_id ?? "").trim();
      if (!bid || !cid) continue;
      const list = map.get(bid) ?? [];
      list.push({
        cleaner_id: cid,
        payout_cents: Math.max(0, Math.floor(Number(row.payout_cents) || 0)),
      });
      map.set(bid, list);
    }
  }
  return map;
}

export async function loadRosterByBookingIds(
  admin: SupabaseClient,
  bookingIds: string[],
): Promise<Map<string, RosterCleanerRef[]>> {
  const map = new Map<string, RosterCleanerRef[]>();
  if (!bookingIds.length) return map;

  for (let i = 0; i < bookingIds.length; i += 120) {
    const slice = bookingIds.slice(i, i + 120);
    const { data, error } = await admin
      .from("booking_cleaners")
      .select("booking_id, cleaner_id, role")
      .in("booking_id", slice);
    if (error) throw new Error(error.message);
    for (const raw of data ?? []) {
      const row = raw as { booking_id?: string; cleaner_id?: string; role?: string | null };
      const bid = String(row.booking_id ?? "").trim();
      const cid = String(row.cleaner_id ?? "").trim();
      if (!bid || !cid) continue;
      const list = map.get(bid) ?? [];
      list.push({ cleaner_id: cid, role: row.role ?? null });
      map.set(bid, list);
    }
  }
  return map;
}

export async function loadOfficePayoutPeriodReport(
  admin: SupabaseClient,
  from: string,
  to: string,
): Promise<OfficePayoutPeriodReport> {
  const reportFrom = from < MONTHLY_PAYOUT_START_YMD ? MONTHLY_PAYOUT_START_YMD : from;
  const [{ data: bookingRows, error: bErr }, { data: payoutRows, error: pErr }] = await Promise.all([
    admin
      .from("bookings")
      .select(
        "id, date, cleaner_id, payout_owner_cleaner_id, payout_status, payout_id, payout_frozen_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, total_paid_zar, total_paid_cents, amount_paid_cents, company_revenue_cents, earnings_summary",
      )
      .eq("status", "completed")
      .eq("is_test", false)
      .gte("date", reportFrom)
      .lte("date", to)
      .order("date", { ascending: true })
      .limit(5000),
    admin
      .from("cleaner_payouts")
      .select(
        "id, cleaner_id, total_amount_cents, calculated_amount_cents, adjustment_note, amount_adjusted_at, status, payment_status, payment_reference, period_start, period_end, created_at, approved_at, paid_at",
      )
      .gte("period_start", MONTHLY_PAYOUT_START_YMD)
      .lte("period_start", to)
      .gte("period_end", reportFrom)
      .order("period_end", { ascending: false })
      .limit(500),
  ]);

  if (bErr) throw new Error(bErr.message);
  if (pErr) throw new Error(pErr.message);

  const bookings = (bookingRows ?? []) as BookingPeriodRow[];
  const payoutsRaw = (payoutRows ?? []).filter((p) =>
    isMonthlyPayoutBatchPeriod(String((p as PayoutDbRow).period_start), String((p as PayoutDbRow).period_end)),
  ) as PayoutDbRow[];
  const rosterByBooking = await loadRosterByBookingIds(
    admin,
    bookings.map((b) => b.id),
  );
  const teamPayoutsByBooking = await loadTeamJobMemberPayoutsByBookingIds(
    admin,
    bookings.map((b) => b.id),
  );
  const batchStatusById = new Map<string, string>();
  for (const p of payoutsRaw) {
    if (p.id) batchStatusById.set(p.id, String(p.status ?? ""));
  }

  const payoutIdsNeedingStatus = [
    ...new Set(
      bookings
        .map((b) => String(b.payout_id ?? "").trim())
        .filter((id) => id && !batchStatusById.has(id)),
    ),
  ];
  if (payoutIdsNeedingStatus.length > 0) {
    const { data: extraBatches } = await admin
      .from("cleaner_payouts")
      .select("id, status")
      .in("id", payoutIdsNeedingStatus);
    for (const row of extraBatches ?? []) {
      const r = row as { id?: string; status?: string | null };
      if (r.id) batchStatusById.set(r.id, String(r.status ?? ""));
    }
  }

  const cleanerIds = new Set<string>();
  for (const b of bookings) {
    for (const alloc of perCleanerAllocationsForBooking(
      b,
      rosterByBooking.get(b.id) ?? [],
      teamPayoutsByBooking.get(b.id),
    )) {
      cleanerIds.add(alloc.cleaner_id);
    }
  }
  for (const p of payoutsRaw) {
    if (p.cleaner_id) cleanerIds.add(p.cleaner_id);
  }

  const cleanerNames = new Map<string, string>();
  const idList = [...cleanerIds];
  for (let i = 0; i < idList.length; i += 120) {
    const slice = idList.slice(i, i + 120);
    const { data: cleaners } = await admin.from("cleaners").select("id, full_name").in("id", slice);
    for (const c of cleaners ?? []) {
      const row = c as { id?: string; full_name?: string | null };
      if (row.id) cleanerNames.set(row.id, row.full_name?.trim() || row.id);
    }
  }

  const byCleaner = new Map<string, OfficePayoutCleanerRow>();
  const totals = emptyTotals();

  for (const b of bookings) {
    const roster = rosterByBooking.get(b.id) ?? [];
    const allocations = perCleanerAllocationsForBooking(b, roster, teamPayoutsByBooking.get(b.id));
    if (!allocations.length) continue;

    const bucket = classifyBookingPayoutBucket(b.payout_status, b.payout_id, batchStatusById);
    accumulateBookingIntoPeriodTotals(
      totals,
      bucket,
      allocations,
      bookingCustomerRevenueCents(b),
      bookingCompanyEarningsCents(b),
    );

    for (const alloc of allocations) {
      const name = cleanerNames.get(alloc.cleaner_id) ?? alloc.cleaner_id;
      if (!byCleaner.has(alloc.cleaner_id)) {
        byCleaner.set(alloc.cleaner_id, emptyCleanerRow(alloc.cleaner_id, name));
      }
      const row = byCleaner.get(alloc.cleaner_id)!;

      row.visit_count += 1;
      row.earned_cents += alloc.cents;
      applyBucket(row, bucket, alloc.cents);
    }
  }
  const payoutIds = payoutsRaw.map((p) => p.id);
  const bookingCounts = new Map<string, number>();
  if (payoutIds.length > 0) {
    const { data: linked } = await admin.from("bookings").select("payout_id").in("payout_id", payoutIds);
    for (const b of linked ?? []) {
      const payoutId = String((b as { payout_id?: string | null }).payout_id ?? "");
      if (payoutId) bookingCounts.set(payoutId, (bookingCounts.get(payoutId) ?? 0) + 1);
    }
  }

  const payouts: OfficePayoutBatchRow[] = payoutsRaw.map((p) => ({
    id: p.id,
    cleaner_id: p.cleaner_id,
    cleaner_name: cleanerNames.get(p.cleaner_id) ?? p.cleaner_id,
    booking_count: bookingCounts.get(p.id) ?? 0,
    total_amount_cents: p.total_amount_cents,
    calculated_amount_cents: p.calculated_amount_cents ?? null,
    adjustment_note: p.adjustment_note ?? null,
    amount_adjusted_at: p.amount_adjusted_at ?? null,
    status: p.status,
    payment_status: p.payment_status ?? null,
    payment_reference: p.payment_reference ?? null,
    period_start: p.period_start,
    period_end: p.period_end,
    created_at: p.created_at,
    approved_at: p.approved_at ?? null,
    paid_at: p.paid_at ?? null,
  }));

  totals.batch_count = payouts.length;
  totals.batch_cents = payouts.reduce((s, p) => s + (p.total_amount_cents ?? 0), 0);
  totals.margin_percent =
    totals.total_revenue_cents > 0
      ? Math.round((totals.company_earnings_cents / totals.total_revenue_cents) * 10000) / 100
      : null;

  const cleaners = [...byCleaner.values()].sort(
    (a, b) =>
      b.visit_count - a.visit_count ||
      b.earned_cents - a.earned_cents ||
      a.cleaner_name.localeCompare(b.cleaner_name),
  );
  return { range: { from: reportFrom, to }, totals, cleaners, payouts };
}
