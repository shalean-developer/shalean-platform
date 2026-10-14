import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPayoutRows } from "@/lib/payout/payoutQueryPagination";
import { loadCleanerPayoutBatchItems } from "@/lib/payout/loadCleanerPayoutBatchItems";
import { getJohannesburgMonthBoundsContainingYmd } from "@/lib/payout/monthBounds";
import { isCurrentPayoutVisitDate, isProcessableClosedPayoutPeriod } from "@/lib/payout/payoutProcessingCutoff";

/** Shared final fence for new provider submissions, including cron outbox retries. */
export async function validateTransferProcessingCutoff(
  admin: SupabaseClient,
  rail: "cleaner_payout" | "cleaner_earnings",
  subjectId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  try {
    if (rail === "cleaner_payout") {
      const { data, error } = await admin.from("cleaner_payouts").select("period_start, period_end")
        .eq("id", subjectId).maybeSingle();
      if (error) return { ok: false, error: error.message, status: 500 };
      if (!data || !isProcessableClosedPayoutPeriod(data.period_start, data.period_end)) {
        return { ok: false, error: "Transfers require a closed October-or-later monthly payout.", status: 409 };
      }
      const loaded = await loadCleanerPayoutBatchItems(admin, subjectId);
      if (loaded.error) return { ok: false, error: loaded.error, status: 500 };
      if (!loaded.items.length || loaded.items.some((item) => !isCurrentPayoutVisitDate(item.date))) {
        return { ok: false, error: "Historical or undated earning items cannot be transferred.", status: 409 };
      }
    } else {
      const rows = await fetchAllPayoutRows((from, to) => admin.from("cleaner_earnings")
        .select("id, bookings!inner(date)").eq("disbursement_id", subjectId)
        .order("id", { ascending: true }).range(from, to));
      const { periodStart } = getJohannesburgMonthBoundsContainingYmd(johannesburgCalendarYmd(new Date()));
      if (!rows.length || rows.some((raw) => {
        const booking = (raw as { bookings: { date: string | null } | { date: string | null }[] }).bookings;
        const date = Array.isArray(booking) ? booking[0]?.date : booking?.date;
        return !isCurrentPayoutVisitDate(date) || String(date) >= periodStart;
      })) {
        return { ok: false, error: "Ledger transfers require October-or-later visits in closed months.", status: 409 };
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not verify transfer cutoff.", status: 500 };
  }
}
