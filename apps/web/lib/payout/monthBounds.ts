import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { MONTHLY_PAYOUT_START_YMD } from "@/lib/payout/payoutPeriodConfig";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Calendar month (1st–last day) in Johannesburg containing `ymd`. */
export function getJohannesburgMonthBoundsContainingYmd(ymd: string): { periodStart: string; periodEnd: string } {
  if (!YMD_RE.test(ymd)) throw new Error(`Invalid YMD: ${ymd}`);
  const monthKey = ymd.slice(0, 7);
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  const lastDay = new Date(y, m, 0).getDate();
  return { periodStart: `${monthKey}-01`, periodEnd: `${monthKey}-${pad2(lastDay)}` };
}

/** Previous complete calendar month in Johannesburg. */
export function getPreviousMonthDateBoundsJhb(now: Date = new Date()): { periodStart: string; periodEnd: string } {
  const todayYmd = johannesburgCalendarYmd(now);
  const y = Number(todayYmd.slice(0, 4));
  const m = Number(todayYmd.slice(5, 7));
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const ym = `${prevY}-${pad2(prevM)}`;
  const lastDay = new Date(prevY, prevM, 0).getDate();
  return { periodStart: `${ym}-01`, periodEnd: `${ym}-${pad2(lastDay)}` };
}

/** True when a payout batch period falls on or after the monthly payout epoch. */
export function isMonthlyPayoutPeriod(periodStart: string): boolean {
  return periodStart >= MONTHLY_PAYOUT_START_YMD;
}
