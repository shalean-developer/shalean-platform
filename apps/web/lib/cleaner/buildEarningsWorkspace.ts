import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import {
  addDaysYmd,
  isoWeekdayFromYmd,
} from "@/lib/recurring/johannesburgCalendar";
import {
  normalizePayoutVisitDate,
  PAYOUT_PROCESSING_START_YMD,
} from "@/lib/payout/payoutProcessingCutoff";
import { bookingHasActivePayoutAttributionRemoval } from "@/lib/payout/bookingPayoutAttributionRemoval";
import {
  parseBookingEarningsSummary,
  resolveCleanerFacingEarnings,
} from "@/lib/payout/bookingEarningsSummary";
import {
  resolveCleanerDashboardEarningsCents,
  resolveCleanerBonusCents,
} from "@/lib/cleaner/resolveCleanerEarnings";
import type { CleanerAllTimeEarningsBookingRow } from "@/lib/cleaner/fetchCleanerAllTimeEarningsCents";
import {
  earningsWorkspaceSchema,
  type WorkspaceEarning,
  type WorkspacePayment,
} from "./earningsWorkspaceContract";

export type WorkspaceBooking = CleanerAllTimeEarningsBookingRow & {
  date: string | null;
  service: string | null;
  completed_at: string | null;
  payout_id: string | null;
  payout_status: string | null;
};
export type WorkspaceMember = {
  booking_id: string;
  payout_cents: number;
  bonus_cents?: number;
  status: string;
  cleaner_payout_id: string | null;
};
export type WorkspaceBatch = {
  id: string;
  total_amount_cents: number;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  period_start: string;
  period_end: string;
};
export type WorkspaceDisbursement = {
  id: string;
  total_amount_cents: number;
  status: string;
  paid_at: string | null;
  paystack_reference: string | null;
  transfer_code: string | null;
  paystack_transfer_code: string | null;
  created_at?: string | null;
};
/** Payment lineage only. Ledger amounts never replace booking/member earnings. */
export type WorkspaceSettlementLink = {
  booking_id: string;
  status: string;
  disbursement_id: string | null;
};

function validCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function instant(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function sum(rows: readonly { amount_cents: number | null }[]): number | null {
  return rows.some((r) => r.amount_cents == null)
    ? null
    : rows.reduce((n, r) => n + r.amount_cents!, 0);
}

/** Read presentation only: never synthesizes a payment from a job or retirement rule. */
export function buildEarningsWorkspace(input: {
  cleanerId: string;
  bookings: WorkspaceBooking[];
  teamMembers: WorkspaceMember[];
  rosterMembers: WorkspaceMember[];
  batches: WorkspaceBatch[];
  disbursements: WorkspaceDisbursement[];
  settlementLinks?: WorkspaceSettlementLink[];
  bankReady: boolean;
  month: string;
  now: Date;
}) {
  const { cleanerId, month, now } = input;
  const today = johannesburgCalendarYmd(now);
  const weekStart = addDaysYmd(today, -(isoWeekdayFromYmd(today) - 1));
  const currentMonth = today.slice(0, 7);
  const team = new Map(input.teamMembers.map((r) => [r.booking_id, r]));
  const roster = new Map(input.rosterMembers.map((r) => [r.booking_id, r]));
  const batches = new Map(input.batches.map((r) => [r.id, r]));
  const disbursements = new Map(input.disbursements.map((r) => [r.id, r]));
  const settlementLinks = new Map(
    (input.settlementLinks ?? []).map((r) => [r.booking_id, r]),
  );
  const payments: WorkspacePayment[] = [];
  const acceptedBatches = new Set<string>();
  const acceptedDisbursements = new Set<string>();
  const preparingTransferVisits = new Set<string>();
  let paymentReviewCount = 0;
  let unassignedPaymentRecords = 0;
  // These are distinct settlement records, not per-visit booking amounts.
  for (const batch of input.batches) {
    if (batch.status !== "paid") continue;
    const paidAt = instant(batch.paid_at);
    const reference = batch.payment_reference?.trim();
    if (
      !paidAt ||
      !reference ||
      batch.payment_status !== "success" ||
      !validCents(batch.total_amount_cents)
    ) {
      if (!paidAt) unassignedPaymentRecords++;
      else if (johannesburgCalendarYmd(new Date(paidAt)).startsWith(month))
        paymentReviewCount++;
      continue;
    }
    acceptedBatches.add(batch.id);
    payments.push({
      id: `batch-${batch.id}`,
      paid_at: paidAt,
      amount_cents: batch.total_amount_cents,
      reference,
      method:
        batch.payment_method === "bank_transfer"
          ? "Bank transfer"
          : "Recorded transfer",
      earning_period:
        normalizePayoutVisitDate(batch.period_start)?.slice(0, 7) ?? null,
    });
  }
  for (const transfer of input.disbursements) {
    if (transfer.status !== "paid") continue;
    const paidAt = instant(transfer.paid_at);
    const reference =
      transfer.paystack_reference?.trim() ||
      transfer.transfer_code?.trim() ||
      transfer.paystack_transfer_code?.trim();
    if (!paidAt || !reference || !validCents(transfer.total_amount_cents)) {
      if (!paidAt) unassignedPaymentRecords++;
      else if (johannesburgCalendarYmd(new Date(paidAt)).startsWith(month))
        paymentReviewCount++;
      continue;
    }
    acceptedDisbursements.add(transfer.id);
    payments.push({
      id: `transfer-${transfer.id}`,
      paid_at: paidAt,
      amount_cents: transfer.total_amount_cents,
      reference,
      method: "Recorded transfer",
      earning_period: null,
    });
  }
  const all: WorkspaceEarning[] = [];
  for (const booking of new Map(
    input.bookings.map((r) => [r.id, r]),
  ).values()) {
    if (bookingHasActivePayoutAttributionRemoval(booking)) continue;
    const member = team.get(booking.id) ?? roster.get(booking.id);
    const viewerAmount =
      member == null
        ? null
        : member.payout_cents +
          (team.has(booking.id) ? 0 : (member.bonus_cents ?? 0));
    const wire = { ...booking, viewer_payout_cents: viewerAmount };
    const facing = resolveCleanerFacingEarnings(
      parseBookingEarningsSummary(booking.earnings_summary),
      cleanerId,
    );
    const hasAmount =
      viewerAmount != null ||
      facing != null ||
      [
        booking.display_earnings_cents,
        booking.payout_frozen_cents,
        booking.cleaner_earnings_total_cents,
        booking.cleaner_payout_cents,
      ].some(validCents) ||
      (booking.earnings_policy === "legacy_july" &&
        validCents(booking.internal_earnings_cents));
    const amount = hasAmount
      ? resolveCleanerDashboardEarningsCents(wire, cleanerId)
      : null;
    const trustedBreakdown =
      facing != null &&
      facing.total_cents === amount &&
      Math.max(
        0,
        facing.job_earning_cents + facing.bonus_cents - facing.deduction_cents,
      ) === amount;
    const bonus = trustedBreakdown
      ? facing.bonus_cents
      : member
        ? team.has(booking.id)
          ? 0
          : (member.bonus_cents ?? 0)
        : Math.min(amount ?? 0, resolveCleanerBonusCents(wire, cleanerId));
    const date =
      normalizePayoutVisitDate(booking.date) ??
      (instant(booking.completed_at)
        ? johannesburgCalendarYmd(new Date(booking.completed_at!))
        : null);
    // A member must never inherit the lead's payment status or batch.
    const payoutId = member ? member.cleaner_payout_id : booking.payout_id;
    const batch = payoutId ? batches.get(payoutId) : null;
    const settlement = settlementLinks.get(booking.id);
    const transfer = settlement?.disbursement_id
      ? disbursements.get(settlement.disbursement_id)
      : null;
    const transferPaid =
      settlement?.status === "paid" &&
      transfer != null &&
      acceptedDisbursements.has(transfer.id);
    const transferPreparing =
      settlement?.status === "processing" &&
      transfer?.status === "processing" &&
      validCents(transfer.total_amount_cents);
    let state: WorkspaceEarning["state"] = "awaiting_review";
    if (amount == null || !date) state = "needs_review";
    else if ((batch && acceptedBatches.has(batch.id)) || transferPaid)
      state = "paid";
    else if (date < PAYOUT_PROCESSING_START_YMD) state = "historical_review";
    else if (transferPreparing) {
      state = "preparing";
      if (!batch) preparingTransferVisits.add(booking.id);
    } else if (settlement?.disbursement_id || settlement?.status === "paid")
      state = "needs_review";
    else if (date.slice(0, 7) >= currentMonth) state = "month_open";
    else if (
      batch?.status === "approved" &&
      !["failed", "partial_failed"].includes(batch.payment_status ?? "")
    )
      state = "approved";
    else if (batch && ["pending", "frozen"].includes(batch.status))
      state = "preparing";
    else if (payoutId || (member?.status ?? booking.payout_status) === "paid")
      state = "needs_review";
    all.push({
      id: booking.id,
      date,
      service: booking.service?.trim() || "Cleaning job",
      reference: `Job ${booking.id.slice(0, 8).toUpperCase()}`,
      amount_cents: amount,
      bonus_cents: bonus,
      base_cents: trustedBreakdown ? facing.job_earning_cents : null,
      deduction_cents: trustedBreakdown ? facing.deduction_cents : null,
      state,
    });
  }
  all.sort(
    (a, b) =>
      (b.date ?? "").localeCompare(a.date ?? "") || a.id.localeCompare(b.id),
  );
  const selected = all.filter((r) => r.date?.startsWith(month));
  const selectedPayments = payments
    .filter((p) =>
      johannesburgCalendarYmd(new Date(p.paid_at)).startsWith(month),
    )
    .sort(
      (a, b) => b.paid_at.localeCompare(a.paid_at) || a.id.localeCompare(b.id),
    );
  const periodBatches = input.batches.filter(
    (b) => b.period_start?.startsWith(month) && b.status !== "cancelled",
  );
  for (const b of periodBatches)
    if (!validCents(b.total_amount_cents))
      throw new Error("Invalid payout amount");
  const historical = all.filter((r) => r.state === "historical_review");
  // Ambiguous receipt records must not silently double a payment total.
  const receiptKeys = new Set<string>();
  let conflictingReceipts = false;
  for (const payment of selectedPayments) {
    const key = `${payment.reference.toLowerCase()}|${johannesburgCalendarYmd(new Date(payment.paid_at))}|${payment.amount_cents}`;
    if (receiptKeys.has(key)) {
      conflictingReceipts = true;
      paymentReviewCount++;
    }
    receiptKeys.add(key);
  }
  return earningsWorkspaceSchema.parse({
    version: 1,
    as_of: now.toISOString(),
    today,
    month,
    months: [
      ...new Set([
        currentMonth,
        month,
        ...all.flatMap((r) => (r.date ? [r.date.slice(0, 7)] : [])),
        ...payments.map((p) =>
          johannesburgCalendarYmd(new Date(p.paid_at)).slice(0, 7),
        ),
        ...input.batches.flatMap((b) => {
          const date = normalizePayoutVisitDate(b.period_start);
          const paidAt = instant(b.paid_at);
          return [
            ...(date ? [date.slice(0, 7)] : []),
            ...(paidAt
              ? [johannesburgCalendarYmd(new Date(paidAt)).slice(0, 7)]
              : []),
          ];
        }),
        ...input.disbursements.flatMap((t) =>
          [
            t.paid_at,
            t.status === "failed" ? (t.created_at ?? null) : null,
          ].flatMap((value) => {
            const date = instant(value);
            return date
              ? [johannesburgCalendarYmd(new Date(date)).slice(0, 7)]
              : [];
          }),
        ),
      ]),
    ]
      .sort()
      .reverse(),
    period: {
      earned_cents: sum(selected),
      completed_visits: selected.length,
      unavailable_visits: selected.filter((r) => r.amount_cents == null).length,
      unbatched_cents: selected.some((r) => r.amount_cents == null)
        ? null
        : sum(
            selected.filter((r) =>
              ["month_open", "awaiting_review"].includes(r.state),
            ),
          ),
      preparing_cents:
        periodBatches
          .filter((b) => ["pending", "frozen"].includes(b.status))
          .reduce((n, b) => n + b.total_amount_cents, 0) +
        selected
          .filter((r) => preparingTransferVisits.has(r.id))
          .reduce((n, r) => n + (r.amount_cents ?? 0), 0),
      approved_cents: periodBatches
        .filter((b) => b.status === "approved")
        .reduce((n, b) => n + b.total_amount_cents, 0),
      recorded_payments_cents: conflictingReceipts
        ? null
        : selectedPayments.reduce((n, p) => n + p.amount_cents, 0),
      payment_review_count: paymentReviewCount,
      payment_issue_count:
        periodBatches.filter((b) =>
          ["failed", "partial_failed"].includes(b.payment_status ?? ""),
        ).length +
        input.disbursements.filter(
          (t) =>
            t.status === "failed" &&
            instant(t.created_at ?? null) &&
            johannesburgCalendarYmd(new Date(t.created_at!)).startsWith(month),
        ).length,
    },
    today_cents: sum(all.filter((r) => r.date === today)),
    week_cents: sum(
      all.filter((r) => r.date && r.date >= weekStart && r.date <= today),
    ),
    week_start: weekStart,
    undated_visits: all.filter((r) => !r.date).length,
    unassigned_payment_records: unassignedPaymentRecords,
    lifetime: { earned_cents: sum(all), completed_visits: all.length },
    historical: {
      unreviewed_cents: sum(historical),
      completed_visits: historical.length,
    },
    bank_details_ready: input.bankReady,
    earnings: selected,
    payments: selectedPayments,
  });
}
