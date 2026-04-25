import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { completionDayYmd, getPreviousWeekDateBoundsUtc, isYmdInInclusiveRange } from "@/lib/payout/weekBounds";

export type GenerateWeeklyPayoutsResult = {
  period: { start: string; end: string };
  payoutsCreated: number;
  bookingsLinked: number;
  payoutsBackfilled: number;
  skippedCleaners: number;
};

type BookingPayoutRow = {
  id: string;
  cleaner_id: string;
  cleaner_payout_cents: number | null;
  cleaner_bonus_cents: number | null;
  is_test?: boolean | null;
  completed_at?: string | null;
  date?: string | null;
};

async function ensureNoMissingCompletedPayouts(
  admin: SupabaseClient,
): Promise<{ backfilled: number; remaining: number }> {
  const { data: missingRows, error } = await admin
    .from("bookings")
    .select("id, cleaner_id")
    .eq("status", "completed")
    .eq("is_test", false)
    .is("cleaner_payout_cents", null)
    .not("cleaner_id", "is", null)
    .limit(1000);

  if (error) {
    await reportOperationalIssue("error", "generateWeeklyPayouts", `missing payout preflight failed: ${error.message}`);
    throw new Error("Cannot generate payout batch: missing payout preflight failed");
  }

  let backfilled = 0;
  for (const row of missingRows ?? []) {
    const bookingId = String((row as { id?: string }).id ?? "");
    const cleanerId = String((row as { cleaner_id?: string | null }).cleaner_id ?? "").trim();
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

  const { count, error: countErr } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed")
    .eq("is_test", false)
    .is("cleaner_payout_cents", null);

  if (countErr) {
    await reportOperationalIssue("error", "generateWeeklyPayouts", `missing payout recount failed: ${countErr.message}`);
    throw new Error("Cannot generate payout batch: missing payout recount failed");
  }

  const remaining = count ?? 0;
  if (remaining > 0) {
    const { data: remainingRows } = await admin
      .from("bookings")
      .select("id")
      .eq("status", "completed")
      .eq("is_test", false)
      .is("cleaner_payout_cents", null)
      .limit(50);
    const bookingIds = (remainingRows ?? []).map((row) => String((row as { id?: string }).id ?? "")).filter(Boolean);
    void logSystemEvent({
      level: "error",
      source: "payout_generation_blocked",
      message: "Payout generation blocked because completed bookings are missing payouts",
      context: {
        missingCount: remaining,
        totalMissingCount: remaining,
        bookingIds,
        backfilled,
      },
    });
    await reportOperationalIssue("error", "generateWeeklyPayouts", "missing payouts detected after preflight", {
      missingPayoutCount: remaining,
      totalMissingCount: remaining,
      bookingIds,
      backfilled,
    });
    throw new Error("Cannot generate payout batch: missing payouts detected");
  }

  return { backfilled, remaining };
}

/**
 * Aggregates **completed**, non-test jobs with stored cleaner payout + bonus and no `payout_id`,
 * for the **previous UTC Mon–Sun** week (by completion day). Does not recalculate cents.
 */
export async function generateWeeklyPayouts(admin: SupabaseClient): Promise<GenerateWeeklyPayoutsResult> {
  const { periodStart, periodEnd } = getPreviousWeekDateBoundsUtc();
  let payoutsCreated = 0;
  let bookingsLinked = 0;
  let payoutsBackfilled = 0;
  let skippedCleaners = 0;

  const preflight = await ensureNoMissingCompletedPayouts(admin);
  payoutsBackfilled += preflight.backfilled;

  const { data: cleaners, error: cErr } = await admin.from("cleaners").select("id");
  if (cErr || !cleaners?.length) {
    await reportOperationalIssue("warn", "generateWeeklyPayouts", cErr?.message ?? "no cleaners", {});
    return { period: { start: periodStart, end: periodEnd }, payoutsCreated: 0, bookingsLinked: 0, payoutsBackfilled: 0, skippedCleaners: 0 };
  }

  for (const row of cleaners) {
    const cleanerId = String((row as { id?: string }).id ?? "");
    if (!cleanerId) continue;

    const { data: rawBookings, error: bErr } = await admin
      .from("bookings")
      .select("id, cleaner_id, cleaner_payout_cents, cleaner_bonus_cents, is_test, completed_at, date")
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
      const ymd = completionDayYmd(br);
      if (!ymd) return false;
      return isYmdInInclusiveRange(ymd, periodStart, periodEnd);
    }) as BookingPayoutRow[];

    const bookings: BookingPayoutRow[] = [];
    for (const booking of candidateBookings) {
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
          .select("id, cleaner_id, cleaner_payout_cents, cleaner_bonus_cents, is_test, completed_at, date")
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
        if (Number(refreshedBooking.cleaner_payout_cents) > 0) bookings.push(refreshedBooking);
        continue;
      }

      bookings.push(booking);
    }

    if (!bookings.length) continue;

    const total = bookings.reduce(
      (sum, b) =>
        sum +
        Math.max(0, Math.floor(Number(b.cleaner_payout_cents) || 0)) +
        Math.max(0, Math.floor(Number(b.cleaner_bonus_cents) || 0)),
      0,
    );
    if (total <= 0) continue;

    const { data: payout, error: insErr } = await admin
      .from("cleaner_payouts")
      .insert({
        cleaner_id: cleanerId,
        total_amount_cents: total,
        status: "pending",
        period_start: periodStart,
        period_end: periodEnd,
      })
      .select("id")
      .maybeSingle();

    if (insErr || !payout || typeof (payout as { id?: string }).id !== "string") {
      await reportOperationalIssue("error", "generateWeeklyPayouts", insErr?.message ?? "insert failed", {
        cleanerId,
      });
      skippedCleaners += 1;
      continue;
    }

    const payoutId = String((payout as { id: string }).id);
    const ids = bookings.map((b) => b.id);

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

    const n = updated?.length ?? 0;
    if (n === 0) {
      await admin.from("cleaner_payouts").delete().eq("id", payoutId);
      skippedCleaners += 1;
      continue;
    }

    payoutsCreated += 1;
    bookingsLinked += n;

    void logSystemEvent({
      level: "info",
      source: "WEEKLY_PAYOUT_CREATED",
      message: "Cleaner payout batch created",
      context: {
        cleanerId,
        payoutId,
        bookings: n,
        total_amount_cents: total,
        period_start: periodStart,
        period_end: periodEnd,
      },
    });
  }

  return {
    period: { start: periodStart, end: periodEnd },
    payoutsCreated,
    bookingsLinked,
      payoutsBackfilled,
    skippedCleaners,
  };
}
