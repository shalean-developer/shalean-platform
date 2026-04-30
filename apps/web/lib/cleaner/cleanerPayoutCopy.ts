import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { addDaysYmd, isoWeekdayFromYmd, parseYmdSast } from "@/lib/recurring/johannesburgCalendar";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";

/** Single copy for missing bank / recipient everywhere cleaner-facing payout UI mentions it. */
export const CLEANER_BANK_DETAILS_FOR_PAYOUT_COPY = "⚠ Add bank details to receive payouts";

const ISO_MON = 1;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Next weekly payout **calendar day** in `Africa/Johannesburg` (`YYYY-MM-DD`),
 * anchored on the upcoming Monday (same Monday if `now` is already Monday in JHB).
 */
export function nextPayoutDayJhb(now = new Date()): string {
  const today = johannesburgCalendarYmd(now);
  const wd = isoWeekdayFromYmd(today);
  return wd === ISO_MON ? today : addDaysYmd(today, 8 - wd);
}

/** Short line for cards and earnings surfaces (Johannesburg calendar; avoids client-locale drift). */
export function nextPayoutMondayShort(now = new Date()): string {
  const ymd = nextPayoutDayJhb(now);
  const d = parseYmdSast(ymd);
  const label = d.toLocaleDateString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    weekday: "long",
    day: "numeric",
    month: "short",
  });
  return `Next payout: ${label}`;
}

/** Calendar days from JHB `todayYmd` to `targetYmd` (inclusive-style delta; same day → 0). */
export function johannesburgCalendarDaysBetween(todayYmd: string, targetYmd: string): number {
  const a = parseYmdSast(todayYmd).getTime();
  const b = parseYmdSast(targetYmd).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * Same weekday label as {@link nextPayoutMondayShort}, plus `"(in N days)"` when the next payout is not today (JHB).
 */
export function nextPayoutMondayWithRelativeDays(now = new Date()): string {
  const today = johannesburgCalendarYmd(now);
  const payout = nextPayoutDayJhb(now);
  const base = nextPayoutMondayShort(now);
  const d = johannesburgCalendarDaysBetween(today, payout);
  if (d <= 0) return base;
  if (d === 1) return `${base} (in 1 day)`;
  return `${base} (in ${d} days)`;
}

/** Compact line for sticky earnings header (weekday + countdown, Johannesburg calendar). */
export function nextPayoutStickySubtitle(now = new Date()): string {
  const today = johannesburgCalendarYmd(now);
  const payoutYmd = nextPayoutDayJhb(now);
  const d = parseYmdSast(payoutYmd);
  const weekday = d.toLocaleDateString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    weekday: "long",
  });
  const days = johannesburgCalendarDaysBetween(today, payoutYmd);
  if (days <= 0) return `Next payout · ${weekday} (today)`;
  if (days === 1) return `Next payout · ${weekday} (tomorrow)`;
  return `Next payout · ${weekday} · in ${days} days`;
}

/** Stronger CTA when there is an eligible balance but no recipient on file. */
export function cleanerBankDetailsPromptWithEligible(eligibleCents: number): string {
  return `⚠ Add bank details to receive ${formatZarFromCents(eligibleCents)}`;
}

/** True when `payout_paid_at` is within the last 7 days (UTC wall delta; fine for “this week” UX). */
export function payoutPaidAtWithinLastWeek(iso: string | null, nowMs = Date.now()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const delta = nowMs - t;
  return delta >= 0 && delta < WEEK_MS;
}

/** One-line explainer for cleaners (completed jobs → weekly payout). */
export function weeklyPayoutExplainerShort(): string {
  return "You'll be paid every Monday for completed jobs once they're processed for payout.";
}

/** High-trust cadence line (Johannesburg weekly payout). Pair with {@link nextPayoutMondayWithRelativeDays}. */
export function paidWeeklyPayoutCadenceLine(): string {
  return "Paid weekly every Monday.";
}
