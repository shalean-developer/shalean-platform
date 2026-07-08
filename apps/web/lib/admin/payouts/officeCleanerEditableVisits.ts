import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyBookingPayoutBucket,
  loadRosterByBookingIds,
  loadTeamJobMemberPayoutsByBookingIds,
  normalizeOfficePayoutPeriodRange,
  perCleanerAllocationsForBooking,
  type PayoutBucket,
} from "@/lib/admin/payouts/officePayoutPeriodReport";
import { MONTHLY_PAYOUT_START_YMD } from "@/lib/payout/payoutPeriodConfig";

const EDITABLE_BATCH_STATUSES = new Set(["pending", "frozen"]);

type BookingVisitRow = {
  id: string;
  date: string | null;
  customer_name: string | null;
  service: string | null;
  cleaner_id: string | null;
  payout_owner_cleaner_id: string | null;
  payout_status: string | null;
  payout_id: string | null;
  payout_paid_at: string | null;
  payout_frozen_cents: number | null;
  display_earnings_cents: number | null;
  cleaner_earnings_total_cents: number | null;
  cleaner_payout_cents: number | null;
  cleaner_bonus_cents: number | null;
  is_team_job: boolean | null;
  earnings_summary?: unknown;
};

export type OfficeCleanerEditableVisitRow = {
  id: string;
  date: string | null;
  customer_name: string | null;
  service: string | null;
  payout_bucket: PayoutBucket;
  earnings_cents: number;
  cleaner_payout_cents: number;
  cleaner_bonus_cents: number;
  is_team_job: boolean;
  editable: boolean;
  edit_blocked_reason: string | null;
};

export type OfficeCleanerEditableVisitsResult = {
  cleaner_id: string;
  cleaner_name: string;
  range: { from: string; to: string };
  visits: OfficeCleanerEditableVisitRow[];
  total_cents: number;
  editable_total_cents: number;
  unbatched_cents: number;
  unbatched_visits: number;
};

export function resolveVisitEditBlockedReason(
  row: Pick<
    BookingVisitRow,
    "payout_status" | "payout_paid_at" | "payout_id"
  >,
  batchStatusById: ReadonlyMap<string, string>,
): string | null {
  const payoutStatus = String(row.payout_status ?? "")
    .trim()
    .toLowerCase();
  if (payoutStatus === "paid" || row.payout_paid_at) {
    return "Visit payout is already paid.";
  }

  const payoutId = String(row.payout_id ?? "").trim();
  if (!payoutId) return null;

  const batchStatus = String(batchStatusById.get(payoutId) ?? "")
    .trim()
    .toLowerCase();
  if (!batchStatus) return "Linked payout batch not found.";
  if (!EDITABLE_BATCH_STATUSES.has(batchStatus)) {
    return "Payout batch is approved or paid.";
  }

  return null;
}

export async function loadOfficeCleanerEditableVisits(
  admin: SupabaseClient,
  cleanerId: string,
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
): Promise<OfficeCleanerEditableVisitsResult | { error: string }> {
  const targetCleanerId = String(cleanerId ?? "").trim();
  if (!targetCleanerId) return { error: "Missing cleaner id." };

  const { from, to } = normalizeOfficePayoutPeriodRange(fromRaw, toRaw);
  const reportFrom = from < MONTHLY_PAYOUT_START_YMD ? MONTHLY_PAYOUT_START_YMD : from;

  const { data: cleanerRow, error: cleanerErr } = await admin
    .from("cleaners")
    .select("id, full_name")
    .eq("id", targetCleanerId)
    .maybeSingle();
  if (cleanerErr) return { error: cleanerErr.message };
  if (!cleanerRow) return { error: "Cleaner not found." };

  const { data: bookingRows, error: bErr } = await admin
    .from("bookings")
    .select(
      "id, date, customer_name, service, cleaner_id, payout_owner_cleaner_id, payout_status, payout_id, payout_paid_at, payout_frozen_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, cleaner_bonus_cents, is_team_job, earnings_summary",
    )
    .eq("status", "completed")
    .eq("is_test", false)
    .gte("date", reportFrom)
    .lte("date", to)
    .order("date", { ascending: true })
    .limit(5000);

  if (bErr) return { error: bErr.message };

  const bookings = (bookingRows ?? []) as BookingVisitRow[];
  const rosterByBooking = await loadRosterByBookingIds(
    admin,
    bookings.map((b) => b.id),
  );
  const teamPayoutsByBooking = await loadTeamJobMemberPayoutsByBookingIds(
    admin,
    bookings.map((b) => b.id),
  );

  const payoutIds = [
    ...new Set(bookings.map((b) => String(b.payout_id ?? "").trim()).filter(Boolean)),
  ];
  const batchStatusById = new Map<string, string>();
  if (payoutIds.length > 0) {
    for (let i = 0; i < payoutIds.length; i += 120) {
      const slice = payoutIds.slice(i, i + 120);
      const { data: batches, error: batchErr } = await admin
        .from("cleaner_payouts")
        .select("id, status")
        .in("id", slice);
      if (batchErr) return { error: batchErr.message };
      for (const batch of batches ?? []) {
        const row = batch as { id?: string; status?: string | null };
        if (row.id) batchStatusById.set(row.id, String(row.status ?? ""));
      }
    }
  }

  const visits: OfficeCleanerEditableVisitRow[] = [];
  let totalCents = 0;
  let editableTotalCents = 0;
  let unbatchedCents = 0;
  let unbatchedVisits = 0;

  for (const b of bookings) {
    const roster = rosterByBooking.get(b.id) ?? [];
    const allocations = perCleanerAllocationsForBooking(b, roster, teamPayoutsByBooking.get(b.id));
    const alloc = allocations.find((a) => a.cleaner_id === targetCleanerId);
    if (!alloc) continue;

    const bucket = classifyBookingPayoutBucket(b.payout_status, b.payout_id, batchStatusById);
    const blockedReason = resolveVisitEditBlockedReason(b, batchStatusById);
    const editable = blockedReason == null;
    const payoutCents = Math.max(0, Math.round(Number(b.cleaner_payout_cents ?? 0)));
    const bonusCents = Math.max(0, Math.round(Number(b.cleaner_bonus_cents ?? 0)));
    const earningsCents = alloc.cents;

    visits.push({
      id: b.id,
      date: b.date,
      customer_name: b.customer_name,
      service: b.service,
      payout_bucket: bucket,
      earnings_cents: earningsCents,
      cleaner_payout_cents: payoutCents,
      cleaner_bonus_cents: bonusCents,
      is_team_job: b.is_team_job === true,
      editable,
      edit_blocked_reason: blockedReason,
    });

    totalCents += earningsCents;
    if (editable) editableTotalCents += earningsCents;
    if (!b.payout_id) {
      unbatchedCents += earningsCents;
      unbatchedVisits += 1;
    }
  }

  const cleaner = cleanerRow as { id?: string; full_name?: string | null };

  return {
    cleaner_id: targetCleanerId,
    cleaner_name: cleaner.full_name?.trim() || targetCleanerId,
    range: { from: reportFrom, to },
    visits,
    total_cents: totalCents,
    editable_total_cents: editableTotalCents,
    unbatched_cents: unbatchedCents,
    unbatched_visits: unbatchedVisits,
  };
}
