import { normalizePayoutVisitDate } from "@/lib/payout/payoutProcessingCutoff";
import { isMonthlyPayoutBatchPeriod } from "@/lib/payout/monthBounds";
import { addFrequencyToDate, type RecurringExpenseFrequency } from "@/lib/admin/expenses/recurringExpenses";

export type ForecastRow = Record<string, unknown> & { id: string };
export type CashForecastItem = {
  id: string;
  source: "invoice" | "payout" | "recurring";
  description: string;
  date: string | null;
  basis: string;
  amount_cents: number;
  bucket: "period" | "earlier" | "undated";
};
export type CashFlowForecast = {
  income_cents: number;
  expenses_cents: number;
  earlier_income_cents: number;
  earlier_expenses_cents: number;
  undated_income_cents: number;
  undated_expenses_cents: number;
  issues: string[];
  items: CashForecastItem[];
};

/** Same policy as payoutFundingAlerts: the configured day in the following month. */
export function expectedPayoutDate(periodEnd: string, payoutDay: number): string {
  const d = new Date(`${periodEnd}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, payoutDay);
  return d.toISOString().slice(0, 10);
}
export function configuredMonthlyPayoutDay(): number {
  const raw = Number(process.env.SHALEAN_MONTHLY_PAYOUT_DAY);
  return Number.isFinite(raw) && raw >= 1 && raw <= 28 ? Math.floor(raw) : 5;
}

/** Read model only. No invoices, payout states or recurring schedules are changed. */
export function buildCashFlowForecast(
  from: string, to: string,
  invoices: ForecastRow[], payouts: ForecastRow[], recurring: ForecastRow[], generated: ForecastRow[],
  payoutDay: number,
): CashFlowForecast {
  const result: CashFlowForecast = {
    income_cents: 0, expenses_cents: 0, earlier_income_cents: 0, earlier_expenses_cents: 0,
    undated_income_cents: 0, undated_expenses_cents: 0, issues: [], items: [],
  };
  const issues = new Set<string>();
  const seen = new Set<string>();
  function add(source: CashForecastItem["source"], id: string, description: string, date: string | null, basis: string, value: unknown) {
    const amount = Number(value);
    if (value == null || !Number.isSafeInteger(amount) || amount < 0) {
      issues.add("Invalid amounts require review; affected records are excluded.");
      return;
    }
    if (amount === 0 || (date && date > to)) return;
    const key = `${source}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    const bucket = !date ? "undated" : date < from ? "earlier" : "period";
    const side = source === "invoice" ? "income" : "expenses";
    const field = bucket === "period" ? `${side}_cents` : `${bucket}_${side}_cents`;
    result[field as "income_cents"] += amount;
    result.items.push({ id, source, description, date, basis, amount_cents: amount, bucket });
  }
  for (const row of invoices) {
    if (!["sent", "partially_paid", "overdue"].includes(String(row.status)) || row.is_closed === true) continue;
    if (row.currency_code !== "ZAR") {
      issues.add("Invoices without confirmed ZAR currency are excluded; review their source records.");
      continue;
    }
    const promised = row.payment_arrangement_active === true ? normalizePayoutVisitDate(row.promised_payment_date) : null;
    const due = normalizePayoutVisitDate(row.due_date);
    add("invoice", row.id, `Monthly invoice ${String(row.month ?? "")}`, promised ?? due,
      promised ? "Agreed payment date" : due ? "Invoice due date" : "Missing due date", row.balance_cents);
  }
  for (const row of payouts) {
    if (!["pending", "frozen", "approved"].includes(String(row.status))) continue;
    if (row.payment_status === "paid" || row.paid_at) continue;
    const start = normalizePayoutVisitDate(row.period_start);
    const end = normalizePayoutVisitDate(row.period_end);
    const date = start && end && isMonthlyPayoutBatchPeriod(start, end) ? expectedPayoutDate(end, payoutDay) : null;
    add("payout", row.id, `Cleaner payout ${start ?? "?"} to ${end ?? "?"}`, date,
      date ? `Monthly policy: day ${payoutDay} of following month (estimate)` : "Missing or non-monthly payout period", row.total_amount_cents);
  }
  // Generated occurrences replace their template occurrence, including already approved outflows.
  const occurrences = new Map<string, ForecastRow[]>();
  for (const row of generated) {
    const date = normalizePayoutVisitDate(row.expense_date);
    if (!date || !row.recurring_expense_id || row.status === "rejected") continue;
    const key = `${row.recurring_expense_id}:${date}`;
    occurrences.set(key, [...(occurrences.get(key) ?? []), row]);
    if (row.status === "pending") add("recurring", row.id, String(row.description ?? "Generated recurring expense"), date,
      "Generated expense awaiting approval", row.amount_cents);
  }
  for (const rows of occurrences.values()) {
    if (rows.length > 1) issues.add("Multiple generated expenses share a recurring schedule and date; review for duplicates.");
  }
  for (const row of recurring) {
    if (row.status !== "active") continue;
    let date = normalizePayoutVisitDate(row.next_run_date);
    const description = String(row.description ?? "Recurring expense");
    if (!date) {
      add("recurring", row.id, description, null, "Missing next run date", row.amount_cents);
      continue;
    }
    if (!["daily", "weekly", "monthly", "quarterly", "yearly"].includes(String(row.frequency))) {
      issues.add("Unsupported recurring frequency requires review; future occurrences are excluded.");
      continue;
    }
    // Bounded calendar projection; mirror the existing generator's date advancement exactly.
    let count = 0;
    while (date <= to) {
      if (++count > 20000) throw new Error("Recurring forecast exceeds its safety limit; review the schedule start date.");
      const key = `${row.id}:${date}`;
      if (!occurrences.has(key)) add("recurring", key, description, date, "Recurring schedule estimate", row.amount_cents);
      date = addFrequencyToDate(date, row.frequency as RecurringExpenseFrequency);
    }
  }
  result.issues = [...issues];
  result.items.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.id.localeCompare(b.id));
  return result;
}
