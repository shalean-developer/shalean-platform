import { compareYmd, todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";

/** Calendar days after `due_date` before an invoice is treated as overdue. */
export const MONTHLY_INVOICE_PAYMENT_GRACE_DAYS = 5;

/** Late fee = 5% of invoice total, clamped to [R75, R200]. */
export const MONTHLY_INVOICE_LATE_FEE_PERCENT = 5;
export const MONTHLY_INVOICE_LATE_FEE_MIN_CENTS = 7_500;
export const MONTHLY_INVOICE_LATE_FEE_MAX_CENTS = 20_000;

/** Compute one-time late fee from pre-fee invoice total (minor units). */
export function monthlyInvoiceLateFeeCentsForInvoiceTotal(invoiceTotalCents: number): number {
  const total = Math.max(0, Math.round(invoiceTotalCents));
  const raw = Math.round(total * (MONTHLY_INVOICE_LATE_FEE_PERCENT / 100));
  return Math.min(
    MONTHLY_INVOICE_LATE_FEE_MAX_CENTS,
    Math.max(MONTHLY_INVOICE_LATE_FEE_MIN_CENTS, raw),
  );
}

export function formatMonthlyInvoiceLateFeeZar(amountCents: number): string {
  return (amountCents / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Whole days after due_date (Johannesburg calendar days). */
export function daysPastDueFromYmd(dueYmd: string, todayYmd: string = todayJohannesburg()): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueYmd)) return 0;
  if (compareYmd(todayYmd, dueYmd) <= 0) return 0;
  const dueMs = Date.parse(`${dueYmd}T12:00:00Z`);
  const todayMs = Date.parse(`${todayYmd}T12:00:00Z`);
  return Math.max(0, Math.floor((todayMs - dueMs) / 86400000));
}

/** True once the invoice is past the payment grace window. */
export function isMonthlyInvoiceOverdueWithGrace(
  dueYmd: string | null | undefined,
  todayYmd: string = todayJohannesburg(),
): boolean {
  if (!dueYmd) return false;
  return daysPastDueFromYmd(dueYmd, todayYmd) > MONTHLY_INVOICE_PAYMENT_GRACE_DAYS;
}

/** True when a one-time late fee should be added before collecting payment. */
export function shouldApplyMonthlyInvoiceLateFee(
  dueYmd: string | null | undefined,
  todayYmd: string = todayJohannesburg(),
): boolean {
  return isMonthlyInvoiceOverdueWithGrace(dueYmd, todayYmd);
}

/** Days shown as "overdue" in admin UI (0 during grace). */
export function daysOverdueAfterGrace(
  dueYmd: string | null | undefined,
  todayYmd: string = todayJohannesburg(),
): number {
  if (!dueYmd) return 0;
  const past = daysPastDueFromYmd(dueYmd, todayYmd);
  return Math.max(0, past - MONTHLY_INVOICE_PAYMENT_GRACE_DAYS);
}
