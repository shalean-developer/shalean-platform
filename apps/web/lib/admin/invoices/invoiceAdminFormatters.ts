import { compareYmd, parseYmdSast, todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import {
  daysOverdueAfterGrace,
  isMonthlyInvoiceOverdueWithGrace,
} from "@/lib/monthlyInvoice/monthlyInvoiceLateFeePolicy";

const JHB = "Africa/Johannesburg";

/** Whole days after `due_date` (YYYY-MM-DD) relative to today in Johannesburg; 0 if not past due. */
export function daysPastDue(dueYmd: string | null | undefined): number | null {
  if (!dueYmd || !/^\d{4}-\d{2}-\d{2}$/.test(dueYmd)) return null;
  const today = todayJohannesburg();
  if (compareYmd(today, dueYmd) <= 0) return 0;
  const dueMs = parseYmdSast(dueYmd).getTime();
  const todayMs = parseYmdSast(today).getTime();
  return Math.max(0, Math.floor((todayMs - dueMs) / 86400000));
}

/** Overdue for admin display: past due + grace window. */
export function isInvoiceOverdueForDisplay(
  dueYmd: string | null | undefined,
  balanceCents: number,
): boolean {
  if (balanceCents <= 0) return false;
  return isMonthlyInvoiceOverdueWithGrace(dueYmd);
}

/** Days overdue after {@link MONTHLY_INVOICE_PAYMENT_GRACE_DAYS}. */
export function daysOverdueForDisplay(dueYmd: string | null | undefined): number {
  return daysOverdueAfterGrace(dueYmd);
}

/** Display date in Africa/Johannesburg (en-ZA medium). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: JHB }).format(new Date(ms));
}

/** Display date and time in Africa/Johannesburg (en-ZA medium + short). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: JHB,
  }).format(new Date(ms));
}

/** Long month label for emails (matches finalize cron). */
export function formatMonthLongYearUtc(ym: string): string {
  const [y, m] = ym.split("-").map((x) => Number(x));
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** `due_date` column (YYYY-MM-DD) → readable label in Johannesburg. */
export function formatDueDateLabel(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  try {
    const d = new Date(`${ymd}T12:00:00Z`);
    return d.toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: JHB,
    });
  } catch {
    return ymd;
  }
}

/** Format `YYYY-MM` billing bucket for headers. */
export function formatInvoiceMonth(ym: string | null | undefined): string {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym ?? "—";
  const [y, m] = ym.split("-").map((x) => Number(x));
  return new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/**
 * `amountCents` minor units for ISO `currencyCode` (defaults to ZAR).
 * Uses en-ZA grouping; ZAR shows with standard ZAR symbol from Intl.
 */
export function formatCurrency(amountCents: number, currencyCode: string | null | undefined): string {
  const code = (currencyCode || "ZAR").trim().toUpperCase() || "ZAR";
  const major = Number.isFinite(amountCents) ? amountCents / 100 : 0;
  try {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: code }).format(major);
  } catch {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(major);
  }
}

/** Parse admin-entered ZAR amounts (supports en-ZA spacing and grouping). */
export function parseZarInput(input: string): number | null {
  const s = input.trim();
  if (!s) return null;

  let normalized = s.replace(/[\s\u00a0\u202f]/g, "");
  if (normalized.includes(".") && normalized.includes(",")) {
    normalized = normalized.replace(/,/g, "");
  } else if (normalized.includes(",") && !normalized.includes(".")) {
    normalized = normalized.replace(",", ".");
  }

  const n = Number(normalized);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}
