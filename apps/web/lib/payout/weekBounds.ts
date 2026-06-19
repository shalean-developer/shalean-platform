/**
 * Previous calendar week (Mon–Sun) in UTC date parts — used for payout batch labels.
 * Weekly batch assignment uses {@link weeklyBatchDayYmd} (visit date for invoice/monthly rows).
 */
export function getPreviousWeekDateBoundsUtc(now: Date = new Date()): { periodStart: string; periodEnd: string } {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = utc.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  const thisMonday = new Date(utc);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - daysSinceMonday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setUTCDate(lastSunday.getUTCDate() + 6);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return { periodStart: ymd(lastMonday), periodEnd: ymd(lastSunday) };
}

export function completionDayYmd(booking: { completed_at?: string | null; date?: string | null }): string | null {
  if (typeof booking.completed_at === "string" && booking.completed_at.length >= 10) {
    return booking.completed_at.slice(0, 10);
  }
  if (typeof booking.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(booking.date)) {
    return booking.date;
  }
  return null;
}

export type WeeklyBatchDayBooking = {
  completed_at?: string | null;
  date?: string | null;
  billing_type?: string | null;
  is_monthly_billing_booking?: boolean | null;
  payment_status?: string | null;
  monthly_invoice_id?: string | null;
};

function normLower(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

/** True when payout week should follow the scheduled visit date, not admin completion timestamp. */
export function bookingUsesVisitDateForWeeklyBatch(row: WeeklyBatchDayBooking): boolean {
  const bt = normLower(row.billing_type);
  if (bt === "recurring_invoice" || bt === "monthly_contract" || bt === "pay_later") return true;
  if (row.is_monthly_billing_booking === true) return true;
  if (normLower(row.payment_status) === "pending_monthly") return true;
  const mid = row.monthly_invoice_id;
  if (mid != null && String(mid).trim() !== "") return true;
  return false;
}

function visitDayYmd(booking: { date?: string | null }): string | null {
  if (typeof booking.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(booking.date)) {
    return booking.date;
  }
  return null;
}

/** Late admin completion: visit week differs from completion week (bulk backfill). */
function bookingBackfilledAcrossWeeks(booking: WeeklyBatchDayBooking): boolean {
  const visit = visitDayYmd(booking);
  if (!visit || typeof booking.completed_at !== "string" || booking.completed_at.length < 10) return false;
  const completed = booking.completed_at.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(completed)) return false;
  const visitWeek = getUtcWeekBoundsContainingYmd(visit);
  const completedWeek = getUtcWeekBoundsContainingYmd(completed);
  return visitWeek.periodStart !== completedWeek.periodStart;
}

/**
 * Day used to assign a booking to a weekly `cleaner_payouts` batch.
 * Invoice / monthly recurring rows use visit `date` so bulk completion backfills
 * do not sweep May visits into a June-labelled batch. Prepaid rows follow
 * `completed_at` unless the visit and completion fall in different UTC weeks.
 */
export function weeklyBatchDayYmd(booking: WeeklyBatchDayBooking): string | null {
  const visit = visitDayYmd(booking);
  if (bookingUsesVisitDateForWeeklyBatch(booking) && visit) {
    return visit;
  }
  if (visit && bookingBackfilledAcrossWeeks(booking)) {
    return visit;
  }
  return completionDayYmd(booking);
}

export function isYmdInInclusiveRange(ymd: string, start: string, end: string): boolean {
  return ymd >= start && ymd <= end;
}

/** UTC Mon–Sun window containing `ymd` (YYYY-MM-DD). */
export function getUtcWeekBoundsContainingYmd(ymd: string): { periodStart: string; periodEnd: string } {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = d.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { periodStart: fmt(monday), periodEnd: fmt(sunday) };
}
