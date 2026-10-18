import { z } from "zod";

const cents = z.number().int().nonnegative().safe();
const money = cents.nullable();
const count = z.number().int().nonnegative().safe();
export const earningsWorkspaceSchema = z.object({
  version: z.literal(1),
  as_of: z.string().datetime(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  months: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)),
  period: z.object({
    earned_cents: money,
    completed_visits: count,
    unavailable_visits: count,
    unbatched_cents: money,
    preparing_cents: cents,
    approved_cents: cents,
    recorded_payments_cents: money,
    payment_review_count: count,
    payment_issue_count: count,
  }),
  today_cents: money,
  week_cents: money,
  week_start: z.string(),
  undated_visits: count,
  unassigned_payment_records: count,
  lifetime: z.object({ earned_cents: money, completed_visits: count }),
  historical: z.object({ unreviewed_cents: money, completed_visits: count }),
  bank_details_ready: z.boolean(),
  earnings: z.array(
    z.object({
      id: z.string(),
      date: z.string().nullable(),
      service: z.string(),
      reference: z.string(),
      amount_cents: money,
      bonus_cents: cents,
      base_cents: money,
      deduction_cents: money,
      state: z.enum([
        "month_open",
        "awaiting_review",
        "preparing",
        "approved",
        "paid",
        "historical_review",
        "needs_review",
      ]),
    }),
  ),
  payments: z.array(
    z.object({
      id: z.string(),
      paid_at: z.string().datetime(),
      amount_cents: cents,
      reference: z.string(),
      method: z.enum(["Bank transfer", "Recorded transfer"]),
      earning_period: z.string().nullable(),
    }),
  ),
});

export type EarningsWorkspace = z.infer<typeof earningsWorkspaceSchema>;
export type WorkspaceEarning = EarningsWorkspace["earnings"][number];
export type WorkspacePayment = EarningsWorkspace["payments"][number];

export const EARNING_STATE_LABEL: Record<WorkspaceEarning["state"], string> = {
  month_open: "Month open",
  awaiting_review: "Awaiting review",
  preparing: "Payment being prepared",
  approved: "Approved for payment",
  paid: "Payment recorded",
  historical_review: "Historical review",
  needs_review: "Needs review",
};

export function earningsMonth(value: string | null): string | null {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(`${month}-01T12:00:00+02:00`));
}

/** Instants are converted; civil service dates remain civil dates. */
export function earningsDateLabel(
  value: string | null,
  paymentInstant = false,
): string {
  if (!value) return "Date unavailable";
  const date = new Date(
    paymentInstant ? value : `${value.slice(0, 10)}T12:00:00+02:00`,
  );
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}
