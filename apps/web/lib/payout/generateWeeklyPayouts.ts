import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { completionDayYmd, getPreviousWeekDateBoundsUtc, isYmdInInclusiveRange } from "@/lib/payout/weekBounds";

export type GenerateWeeklyPayoutsResult = {
  period: { start: string; end: string };
  payoutsCreated: number;
  bookingsLinked: number;
  skippedCleaners: number;
};

type BookingPayoutRow = {
  id: string;
  cleaner_id: string;
  cleaner_payout_cents: number | null;
  completed_at?: string | null;
  date?: string | null;
};

/**
 * Aggregates **completed** jobs with stored `cleaner_payout_cents` and no `payout_id`,
 * for the **previous UTC Mon–Sun** week (by completion day). Does not recalculate cents.
 */
export async function generateWeeklyPayouts(admin: SupabaseClient): Promise<GenerateWeeklyPayoutsResult> {
  const { periodStart, periodEnd } = getPreviousWeekDateBoundsUtc();
  let payoutsCreated = 0;
  let bookingsLinked = 0;
  let skippedCleaners = 0;

  const { data: cleaners, error: cErr } = await admin.from("cleaners").select("id");
  if (cErr || !cleaners?.length) {
    await reportOperationalIssue("warn", "generateWeeklyPayouts", cErr?.message ?? "no cleaners", {});
    return { period: { start: periodStart, end: periodEnd }, payoutsCreated: 0, bookingsLinked: 0, skippedCleaners: 0 };
  }

  for (const row of cleaners) {
    const cleanerId = String((row as { id?: string }).id ?? "");
    if (!cleanerId) continue;

    const { data: rawBookings, error: bErr } = await admin
      .from("bookings")
      .select("id, cleaner_id, cleaner_payout_cents, completed_at, date")
      .eq("cleaner_id", cleanerId)
      .eq("status", "completed")
      .is("payout_id", null)
      .gt("cleaner_payout_cents", 0);

    if (bErr) {
      await reportOperationalIssue("warn", "generateWeeklyPayouts", bErr.message, { cleanerId });
      skippedCleaners += 1;
      continue;
    }

    const bookings = (rawBookings ?? []).filter((b) => {
      const br = b as BookingPayoutRow;
      const ymd = completionDayYmd(br);
      if (!ymd) return false;
      return isYmdInInclusiveRange(ymd, periodStart, periodEnd);
    }) as BookingPayoutRow[];

    if (!bookings.length) continue;

    const total = bookings.reduce((sum, b) => sum + Math.max(0, Math.floor(Number(b.cleaner_payout_cents) || 0)), 0);
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
    skippedCleaners,
  };
}
