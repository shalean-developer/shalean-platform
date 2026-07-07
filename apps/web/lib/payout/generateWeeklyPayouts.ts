import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeCutoffAssignmentProbe,
  instantNearJhbThursdayPayoutCutoff,
  payoutArrivalSummaryJohannesburg,
} from "@/lib/cleaner/earnings/nextPayoutFriday";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";
import {
  backfillLegacyWeeklyPayoutColumnsFromEarnings,
  countCompletedBlockingMissingLegacyPayout,
  PayoutGenerationBlockedError,
} from "@/lib/payout/backfillLegacyWeeklyPayoutColumns";
import {
  BOOKING_SELECT_FIELDS_FOR_WEEKLY_BATCH_ELIGIBILITY,
  bookingPayableForWeeklyBatch,
  type BookingRowForWeeklyBatchEligibility,
} from "@/lib/payout/bookingPayableForWeeklyBatch";
import { bookingUsesAccrualPayoutCap } from "@/lib/payout/bookingPayoutCapCents";
import { resolvePersistCleanerIdForBooking } from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import {
  getJohannesburgMonthBoundsContainingYmd,
  getPreviousMonthDateBoundsJhb,
  isMonthlyPayoutBatchPeriod,
  isMonthlyPayoutPeriod,
} from "@/lib/payout/monthBounds";
import { MONTHLY_PAYOUT_START_YMD } from "@/lib/payout/payoutPeriodConfig";
import { isYmdInInclusiveRange, weeklyBatchDayYmd } from "@/lib/payout/weekBounds";
import {
  listRosterMemberWeeklyPayoutCandidates,
  rosterMemberWeeklyPayoutTotalCents,
} from "@/lib/payout/rosterMemberWeeklyPayoutCandidates";

export type GenerateWeeklyPayoutsResult = {
  period: { start: string; end: string };
  payoutsCreated: number;
  bookingsLinked: number;
  payoutsBackfilled: number;
  skippedCleaners: number;
};

export type GenerateCatchUpWeeklyPayoutsResult = {
  /** @deprecated Use monthsProcessed — kept for API compatibility. */
  weeksProcessed: number;
  monthsProcessed: number;
  payoutsCreated: number;
  bookingsLinked: number;
  payoutsBackfilled: number;
  skippedCleaners: number;
  periods: Array<{ start: string; end: string; payoutsCreated: number; bookingsLinked: number }>;
};

type BookingPayoutRow = BookingRowForWeeklyBatchEligibility & {
  id: string;
  cleaner_id: string;
};

async function loadMonthlyInvoiceStatusMap(
  admin: SupabaseClient,
  invoiceIds: string[],
): Promise<Map<string, string> | null> {
  const uniq = [...new Set(invoiceIds.map((id) => String(id).trim()).filter(Boolean))];
  const map = new Map<string, string>();
  if (!uniq.length) return map;

  const { data, error } = await admin.from("monthly_invoices").select("id, status").in("id", uniq);
  if (error) {
    await reportOperationalIssue("error", "generateWeeklyPayouts", `monthly_invoices lookup failed: ${error.message}`, {
      invoice_count: uniq.length,
    });
    return null;
  }
  for (const row of data ?? []) {
    const r = row as { id?: string; status?: string | null };
    if (typeof r.id === "string") map.set(r.id, String(r.status ?? ""));
  }
  return map;
}

async function ensureNoMissingCompletedPayouts(
  admin: SupabaseClient,
): Promise<{ backfilled: number; remaining: number }> {
  const legacyBackfill = await backfillLegacyWeeklyPayoutColumnsFromEarnings(admin, 1000);

  const { data: missingRows, error } = await admin
    .from("bookings")
    .select("id, cleaner_id, payout_owner_cleaner_id, is_team_job")
    .eq("status", "completed")
    .eq("is_test", false)
    .is("cleaner_payout_cents", null)
    .limit(1000);

  if (error) {
    await reportOperationalIssue("error", "generateWeeklyPayouts", `missing payout preflight failed: ${error.message}`);
    throw new Error("Cannot generate payout batch: missing payout preflight failed");
  }

  let backfilled = legacyBackfill.fixed;
  for (const row of missingRows ?? []) {
    const bookingId = String((row as { id?: string }).id ?? "");
    const cleanerId = resolvePersistCleanerIdForBooking(
      row as { cleaner_id?: string | null; payout_owner_cleaner_id?: string | null; is_team_job?: boolean | null },
    );
    if (!bookingId || !cleanerId) continue;
    let result: Awaited<ReturnType<typeof persistCleanerPayoutIfUnset>>;
    try {
      result = await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("generateWeeklyPayouts persistCleanerPayoutIfUnset", { bookingId, cleanerId, error: msg });
      await reportOperationalIssue("error", "generateWeeklyPayouts", `preflight payout backfill threw: ${msg}`, {
        bookingId,
        cleanerId,
      });
      continue;
    }
    if (!result.ok) {
      await reportOperationalIssue("error", "generateWeeklyPayouts", `preflight payout backfill failed: ${result.error}`, {
        bookingId,
        cleanerId,
      });
      continue;
    }
    if (!result.skipped) backfilled += 1;
  }

  const blocking = await countCompletedBlockingMissingLegacyPayout(admin);
  const remaining = blocking.count;
  if (remaining > 0) {
    const bookingIds = blocking.bookingIds;
    void logSystemEvent({
      level: "error",
      source: "payout_generation_blocked",
      message: "Payout generation blocked because completed bookings are missing payouts",
      context: {
        missingCount: remaining,
        totalMissingCount: remaining,
        bookingIds,
        backfilled,
        legacyBackfillScanned: legacyBackfill.scanned,
      },
    });
    await reportOperationalIssue("error", "generateWeeklyPayouts", "missing payouts detected after preflight", {
      missingPayoutCount: remaining,
      totalMissingCount: remaining,
      bookingIds,
      backfilled,
    });
    throw new PayoutGenerationBlockedError(
      "Cannot generate payout batch: completed bookings still missing legacy payout columns after backfill.",
      { remaining, bookingIds },
    );
  }

  return { backfilled, remaining: 0 };
}

async function listUnbatchedCompletionMonths(admin: SupabaseClient): Promise<Array<{ periodStart: string; periodEnd: string }>> {
  const { data, error } = await admin
    .from("bookings")
    .select("completed_at, date, billing_type, is_monthly_billing_booking, payment_status, monthly_invoice_id")
    .eq("status", "completed")
    .eq("is_test", false)
    .is("payout_id", null)
    .not("cleaner_payout_cents", "is", null)
    .gt("cleaner_payout_cents", 0);

  if (error) throw new Error(error.message);

  const monthStarts = new Set<string>();
  for (const row of data ?? []) {
    const ymd = weeklyBatchDayYmd(row as Parameters<typeof weeklyBatchDayYmd>[0]);
    if (!ymd || ymd < MONTHLY_PAYOUT_START_YMD) continue;
    monthStarts.add(getJohannesburgMonthBoundsContainingYmd(ymd).periodStart);
  }

  return [...monthStarts]
    .sort()
    .filter((periodStart) => isMonthlyPayoutPeriod(periodStart))
    .map((periodStart) => getJohannesburgMonthBoundsContainingYmd(periodStart));
}

type GeneratePeriodResult = Omit<GenerateWeeklyPayoutsResult, "period">;

async function generateWeeklyPayoutsForPeriod(
  admin: SupabaseClient,
  periodStart: string,
  periodEnd: string,
  opts?: { asOfForCutoffProbe?: Date },
): Promise<GeneratePeriodResult> {
  if (!isMonthlyPayoutBatchPeriod(periodStart, periodEnd)) {
    return { payoutsCreated: 0, bookingsLinked: 0, payoutsBackfilled: 0, skippedCleaners: 0 };
  }

  const asOf = opts?.asOfForCutoffProbe ?? new Date();
  const batchPayFridayJhb = computeCutoffAssignmentProbe(asOf).batch_pay_friday_jhb_ymd;
  let payoutsCreated = 0;
  let bookingsLinked = 0;
  let payoutsBackfilled = 0;
  let skippedCleaners = 0;

  let jhbCutoffEdgeCaseBookings = 0;
  let batchCutoffUiVsBatchFridayMismatches = 0;

  const { data: cleaners, error: cErr } = await admin.from("cleaners").select("id");
  if (cErr || !cleaners?.length) {
    await reportOperationalIssue("warn", "generateWeeklyPayouts", cErr?.message ?? "no cleaners", {});
    return { payoutsCreated: 0, bookingsLinked: 0, payoutsBackfilled: 0, skippedCleaners: 0 };
  }

  for (const row of cleaners) {
    const cleanerId = String((row as { id?: string }).id ?? "");
    if (!cleanerId) continue;

    const { data: rawBookings, error: bErr } = await admin
      .from("bookings")
      .select(BOOKING_SELECT_FIELDS_FOR_WEEKLY_BATCH_ELIGIBILITY)
      .eq("cleaner_id", cleanerId)
      .eq("status", "completed")
      .eq("is_test", false)
      .is("payout_id", null);

    if (bErr) {
      await reportOperationalIssue("warn", "generateWeeklyPayouts", bErr.message, { cleanerId });
      skippedCleaners += 1;
      continue;
    }

    const candidateBookings = (rawBookings ?? []).filter((b) => {
      const br = b as BookingPayoutRow;
      const ymd = weeklyBatchDayYmd(br);
      if (!ymd || ymd < MONTHLY_PAYOUT_START_YMD) return false;
      return isYmdInInclusiveRange(ymd, periodStart, periodEnd);
    }) as BookingPayoutRow[];

    for (const b of candidateBookings) {
      const br = b as BookingPayoutRow;
      const completedMs = Date.parse(String(br.completed_at ?? ""));
      if (Number.isFinite(completedMs) && instantNearJhbThursdayPayoutCutoff(completedMs)) {
        jhbCutoffEdgeCaseBookings += 1;
      }
      const ymd = weeklyBatchDayYmd(br);
      const uiFriday = Number.isFinite(completedMs)
        ? payoutArrivalSummaryJohannesburg(new Date(completedMs)).payoutTargetFridayYmd
        : ymd
          ? payoutArrivalSummaryJohannesburg(new Date(`${ymd}T12:00:00+02:00`)).payoutTargetFridayYmd
          : null;
      if (uiFriday != null && uiFriday !== batchPayFridayJhb) batchCutoffUiVsBatchFridayMismatches += 1;
    }

    const accrualInvoiceIds: string[] = [];
    for (const b of candidateBookings) {
      const br = b as BookingRowForWeeklyBatchEligibility;
      if (bookingUsesAccrualPayoutCap(br)) {
        const invId = String(br.monthly_invoice_id ?? "").trim();
        if (invId) accrualInvoiceIds.push(invId);
      }
    }
    const invoiceMap = await loadMonthlyInvoiceStatusMap(admin, accrualInvoiceIds);
    if (invoiceMap === null) {
      skippedCleaners += 1;
      continue;
    }

    const payableCandidates: BookingPayoutRow[] = [];
    for (const b of candidateBookings) {
      const br = b as BookingRowForWeeklyBatchEligibility;
      const gate = bookingPayableForWeeklyBatch(br, invoiceMap);
      if (!gate.payable) {
        metrics.increment("cleaner.weekly_batch_booking_excluded_phase12", {
          reason: gate.reason,
          bookingId: br.id ?? null,
          cleanerId,
        });
        continue;
      }
      payableCandidates.push(b as BookingPayoutRow);
    }

    const bookings: BookingPayoutRow[] = [];
    for (const booking of payableCandidates) {
      const payoutCents = Number(booking.cleaner_payout_cents);
      if (!Number.isFinite(payoutCents) || payoutCents <= 0) {
        await reportOperationalIssue("warn", "generateWeeklyPayouts", "completed booking missing payout; attempting backfill", {
          bookingId: booking.id,
          cleanerId,
        });
        let persisted: Awaited<ReturnType<typeof persistCleanerPayoutIfUnset>>;
        try {
          persisted = await persistCleanerPayoutIfUnset({ admin, bookingId: booking.id, cleanerId });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("generateWeeklyPayouts persistCleanerPayoutIfUnset", { bookingId: booking.id, cleanerId, error: msg });
          await reportOperationalIssue("error", "generateWeeklyPayouts", `payout backfill threw: ${msg}`, {
            bookingId: booking.id,
            cleanerId,
          });
          continue;
        }
        if (!persisted.ok) {
          await reportOperationalIssue("error", "generateWeeklyPayouts", `payout backfill failed: ${persisted.error}`, {
            bookingId: booking.id,
            cleanerId,
          });
          continue;
        }
        payoutsBackfilled += persisted.skipped ? 0 : 1;

        const { data: refreshed, error: refreshErr } = await admin
          .from("bookings")
          .select(BOOKING_SELECT_FIELDS_FOR_WEEKLY_BATCH_ELIGIBILITY)
          .eq("id", booking.id)
          .maybeSingle();
        if (refreshErr || !refreshed) {
          await reportOperationalIssue("error", "generateWeeklyPayouts", refreshErr?.message ?? "payout refresh failed", {
            bookingId: booking.id,
            cleanerId,
          });
          continue;
        }
        const refreshedBooking = refreshed as BookingPayoutRow;
        const gateAfter = bookingPayableForWeeklyBatch(refreshedBooking, invoiceMap);
        if (!gateAfter.payable) {
          metrics.increment("cleaner.weekly_batch_booking_excluded_phase12", {
            reason: `${gateAfter.reason}_after_backfill`,
            bookingId: booking.id,
            cleanerId,
          });
          continue;
        }
        if (Number(refreshedBooking.cleaner_payout_cents) > 0) bookings.push(refreshedBooking);
        continue;
      }

      bookings.push(booking);
    }

    const rosterMemberCandidates = await listRosterMemberWeeklyPayoutCandidates({
      admin,
      cleanerId,
      periodStart,
      periodEnd,
      invoiceStatusById: invoiceMap,
    });

    if (!bookings.length && !rosterMemberCandidates.length) continue;

    const total =
      bookings.reduce(
        (sum, b) =>
          sum +
          Math.max(0, Math.floor(Number(b.cleaner_payout_cents) || 0)) +
          Math.max(0, Math.floor(Number(b.cleaner_bonus_cents) || 0)),
        0,
      ) + rosterMemberWeeklyPayoutTotalCents(rosterMemberCandidates);
    if (total <= 0) continue;

    const { data: payout, error: insErr } = await admin
      .from("cleaner_payouts")
      .insert({
        cleaner_id: cleanerId,
        total_amount_cents: total,
        calculated_amount_cents: total,
        status: "pending",
        period_start: periodStart,
        period_end: periodEnd,
      })
      .select("id")
      .maybeSingle();

    if (insErr || !payout || typeof (payout as { id?: string }).id !== "string") {
      /**
       * M-18 idempotency: a 23505 unique-violation here means the partial
       * unique index `cleaner_payouts_unique_active_period_idx`
       * (supabase/migrations/20260945_m18_cleaner_payouts_unique_period.sql)
       * already has a non-cancelled row for this `(cleaner_id, period_start,
       * period_end)`. That can only happen when:
       *   - the H-15 cron lock failed open and another runner won;
       *   - the admin manual trigger raced the cron;
       *   - a retry-after-success replay re-entered this loop.
       *
       * In every case the canonical row already exists, the bookings have
       * already been (or are about to be) linked by the winner, and the
       * correct behaviour is a silent skip. We do NOT re-link the bookings
       * here because the winner's booking-link update already runs against
       * `payout_id IS NULL` and would have claimed the same set.
       */
      const errCode = (insErr as { code?: string } | null)?.code ?? "";
      if (errCode === "23505") {
        metrics.increment("cleaner.weekly_payout_duplicate_creation_blocked", {
          cleanerId,
          period_start: periodStart,
          period_end: periodEnd,
          source: "generateWeeklyPayouts",
        });
        void logSystemEvent({
          level: "info",
          source: "weekly_payout_duplicate_creation_blocked",
          message:
            "M-18 unique index suppressed a duplicate weekly cleaner_payouts insert (idempotent skip)",
          context: {
            cleanerId,
            period_start: periodStart,
            period_end: periodEnd,
          },
        });
        skippedCleaners += 1;
        continue;
      }
      await reportOperationalIssue("error", "generateWeeklyPayouts", insErr?.message ?? "insert failed", {
        cleanerId,
      });
      skippedCleaners += 1;
      continue;
    }

    const payoutId = String((payout as { id: string }).id);
    const ids = bookings.map((b) => b.id);
    let linkedCount = 0;

    if (ids.length > 0) {
      const { data: updated, error: upErr } = await admin
        .from("bookings")
        .update({ payout_id: payoutId })
        .in("id", ids)
        .eq("cleaner_id", cleanerId)
        .is("payout_id", null)
        .select("id");

      if (upErr) {
        await reportOperationalIssue("error", "generateWeeklyPayouts", `link bookings failed: ${upErr.message}`, {
          cleanerId,
          payoutId,
        });
        await admin.from("cleaner_payouts").delete().eq("id", payoutId);
        skippedCleaners += 1;
        continue;
      }
      linkedCount += updated?.length ?? 0;
    }

    if (rosterMemberCandidates.length > 0) {
      const memberIds = rosterMemberCandidates.map((row) => row.id);
      const { data: linkedMembers, error: memberUpErr } = await admin
        .from("booking_roster_member_payouts")
        .update({ cleaner_payout_id: payoutId, status: "batched" })
        .in("id", memberIds)
        .eq("cleaner_id", cleanerId)
        .is("cleaner_payout_id", null)
        .eq("status", "pending")
        .select("id");
      if (memberUpErr) {
        await reportOperationalIssue("error", "generateWeeklyPayouts", `link roster member payouts failed: ${memberUpErr.message}`, {
          cleanerId,
          payoutId,
        });
        if (linkedCount === 0) {
          await admin.from("cleaner_payouts").delete().eq("id", payoutId);
        }
        skippedCleaners += 1;
        continue;
      }
      linkedCount += linkedMembers?.length ?? 0;
    }

    if (linkedCount === 0) {
      await admin.from("cleaner_payouts").delete().eq("id", payoutId);
      skippedCleaners += 1;
      continue;
    }

    payoutsCreated += 1;
    bookingsLinked += linkedCount;

    void logSystemEvent({
      level: "info",
      source: "MONTHLY_PAYOUT_CREATED",
      message: "Cleaner monthly payout batch created",
      context: {
        cleanerId,
        payoutId,
        bookings: ids.length,
        roster_member_payouts: rosterMemberCandidates.length,
        linked_rows: linkedCount,
        total_amount_cents: total,
        period_start: periodStart,
        period_end: periodEnd,
      },
    });
  }

  if (jhbCutoffEdgeCaseBookings > 0) {
    metrics.increment("cleaner.earnings_cutoff_edge_case", {
      count: jhbCutoffEdgeCaseBookings,
      period_start: periodStart,
      period_end: periodEnd,
      source: "generateWeeklyPayouts",
    });
  }

  if (batchCutoffUiVsBatchFridayMismatches > 0) {
    metrics.increment("cleaner.earnings_cutoff_assignment_mismatch", {
      kind: "weekly_batch_per_booking",
      count: batchCutoffUiVsBatchFridayMismatches,
      period_start: periodStart,
      period_end: periodEnd,
      batch_pay_friday_jhb_ymd: batchPayFridayJhb,
      source: "generateWeeklyPayouts",
    });
  }

  return {
    payoutsCreated,
    bookingsLinked,
    payoutsBackfilled,
    skippedCleaners,
  };
}

/**
 * Aggregates **completed**, non-test jobs with stored cleaner payout + bonus and no `payout_id`,
 * for the **previous Johannesburg calendar month** (from July 2026 onward). Does not recalculate cents.
 *
 * Phase 12: each booking must satisfy {@link bookingPayableForWeeklyBatch} (invoice-settled accrual vs prepaid
 * customer-settled) before linking into a monthly batch.
 */
export async function generateWeeklyPayouts(admin: SupabaseClient): Promise<GenerateWeeklyPayoutsResult> {
  const asOf = new Date();
  const { periodStart, periodEnd } = getPreviousMonthDateBoundsJhb(asOf);

  if (!isMonthlyPayoutPeriod(periodStart)) {
    return {
      period: { start: periodStart, end: periodEnd },
      payoutsCreated: 0,
      bookingsLinked: 0,
      payoutsBackfilled: 0,
      skippedCleaners: 0,
    };
  }

  const preflight = await ensureNoMissingCompletedPayouts(admin);
  const periodResult = await generateWeeklyPayoutsForPeriod(admin, periodStart, periodEnd, { asOfForCutoffProbe: asOf });

  return {
    period: { start: periodStart, end: periodEnd },
    payoutsCreated: periodResult.payoutsCreated,
    bookingsLinked: periodResult.bookingsLinked,
    payoutsBackfilled: preflight.backfilled + periodResult.payoutsBackfilled,
    skippedCleaners: periodResult.skippedCleaners,
  };
}

/**
 * Admin catch-up: batch every Johannesburg calendar month (from July 2026) that still has unlinked payable bookings.
 * Cron continues to use {@link generateWeeklyPayouts} for the previous month only.
 */
export async function generateCatchUpWeeklyPayouts(admin: SupabaseClient): Promise<GenerateCatchUpWeeklyPayoutsResult> {
  const preflight = await ensureNoMissingCompletedPayouts(admin);
  const months = await listUnbatchedCompletionMonths(admin);

  let payoutsCreated = 0;
  let bookingsLinked = 0;
  let payoutsBackfilled = preflight.backfilled;
  let skippedCleaners = 0;
  const periods: GenerateCatchUpWeeklyPayoutsResult["periods"] = [];

  for (const { periodStart, periodEnd } of months) {
    const asOfForCutoffProbe = new Date(`${periodEnd}T12:00:00+02:00`);
    const periodResult = await generateWeeklyPayoutsForPeriod(admin, periodStart, periodEnd, { asOfForCutoffProbe });
    payoutsCreated += periodResult.payoutsCreated;
    bookingsLinked += periodResult.bookingsLinked;
    payoutsBackfilled += periodResult.payoutsBackfilled;
    skippedCleaners += periodResult.skippedCleaners;
    if (periodResult.payoutsCreated > 0 || periodResult.bookingsLinked > 0) {
      periods.push({
        start: periodStart,
        end: periodEnd,
        payoutsCreated: periodResult.payoutsCreated,
        bookingsLinked: periodResult.bookingsLinked,
      });
    }
  }

  return {
    weeksProcessed: months.length,
    monthsProcessed: months.length,
    payoutsCreated,
    bookingsLinked,
    payoutsBackfilled,
    skippedCleaners,
    periods,
  };
}
