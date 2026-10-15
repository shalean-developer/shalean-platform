import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { normalizePayoutVisitDate, PAYOUT_PROCESSING_START_YMD } from "@/lib/payout/payoutProcessingCutoff";

/** Reporting/payment readiness is separate from closed-month processing permission. */
export function payoutGenerationAvailability(from: string, to: string, now = new Date()) {
  const start = normalizePayoutVisitDate(from);
  const end = normalizePayoutVisitDate(to);
  const monthStart = `${johannesburgCalendarYmd(now).slice(0, 7)}-01`;
  const hasClosedProcessingMonth = monthStart > PAYOUT_PROCESSING_START_YMD;
  const rangeCanGenerate = Boolean(start && end && start <= end && start >= PAYOUT_PROCESSING_START_YMD && end < monthStart);
  const singleOpenMonth = Boolean(start && end && start.slice(0, 7) === end.slice(0, 7) && end >= monthStart);
  const monthLabel = singleOpenMonth && start
    ? new Intl.DateTimeFormat("en-ZA", { month: "long", timeZone: "Africa/Johannesburg" }).format(new Date(`${start}T12:00:00Z`))
    : null;
  return { hasClosedProcessingMonth, rangeCanGenerate, monthLabel };
}
