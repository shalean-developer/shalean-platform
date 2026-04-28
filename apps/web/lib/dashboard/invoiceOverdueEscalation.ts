import { johannesburgTodayYmd } from "@/lib/dashboard/bookingSlotTimes";

/** Whole calendar days from `dueYmd` (inclusive) to “today” in Johannesburg (0 if not yet due). */
export function daysPastDueJhb(dueYmd: string, now: Date): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueYmd)) return 0;
  const today = johannesburgTodayYmd(now);
  if (dueYmd >= today) return 0;
  const [ys, ms, ds] = dueYmd.split("-").map(Number);
  const [ye, me, de] = today.split("-").map(Number);
  const s = Date.UTC(ys, ms - 1, ds);
  const e = Date.UTC(ye, me - 1, de);
  return Math.max(0, Math.round((e - s) / 86400000));
}

/** Soft → firm copy by days past due (balance still outstanding). */
export function invoiceOverdueEscalationText(daysPastDue: number): string {
  if (daysPastDue <= 0) return "";
  if (daysPastDue <= 3) {
    return "Friendly reminder to settle your invoice when you have a moment.";
  }
  if (daysPastDue <= 10) {
    return "Please settle to avoid service interruptions.";
  }
  return "Services may be paused until payment is received.";
}
