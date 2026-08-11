import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type MonthlyInvoiceCashForecastItem = {
  id: string;
  customer_id: string;
  month: string;
  status: string;
  balance_cents: number;
  expected_collection_date: string | null;
  collection_basis: "promised_payment_date" | "due_date" | "month_end" | "unknown";
  payment_arrangement_active: boolean;
  is_overdue: boolean;
};

export type MonthlyInvoiceCashForecast = {
  as_of: string;
  total_open_cents: number;
  overdue_cents: number;
  due_next_7_days_cents: number;
  due_next_14_days_cents: number;
  due_later_cents: number;
  draft_cents: number;
  unknown_date_cents: number;
  items: MonthlyInvoiceCashForecastItem[];
};

function cents(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function ymdInJohannesburg(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthEndFromMonth(month: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, m, 0, 12));
  return d.toISOString().slice(0, 10);
}

/**
 * Cash forecast for monthly-account customers.
 *
 * Draft invoices are legitimate accruals, not current cash. Their expected collection
 * date defaults to month-end when no due date exists yet. Issued invoices use the
 * promised payment date when an arrangement is active, otherwise the invoice due date.
 */
export async function loadMonthlyInvoiceCashForecast(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<MonthlyInvoiceCashForecast> {
  const { data, error } = await admin
    .from("monthly_invoices")
    .select(
      "id, customer_id, month, status, balance_cents, total_cents, due_date, payment_arrangement_active, promised_payment_date, is_closed",
    )
    .eq("is_closed", false)
    .in("status", ["draft", "sent", "partially_paid", "overdue"])
    .order("month", { ascending: true });

  if (error) throw new Error(error.message);

  const today = ymdInJohannesburg(now);
  const in7 = addDaysYmd(today, 7);
  const in14 = addDaysYmd(today, 14);

  const items: MonthlyInvoiceCashForecastItem[] = [];
  let totalOpen = 0;
  let overdue = 0;
  let due7 = 0;
  let due14 = 0;
  let dueLater = 0;
  let draft = 0;
  let unknown = 0;

  for (const raw of (data ?? []) as Record<string, unknown>[]) {
    const status = String(raw.status ?? "").toLowerCase();
    const balance = cents(raw.balance_cents ?? raw.total_cents);
    if (balance <= 0) continue;

    const arrangementActive = Boolean(raw.payment_arrangement_active);
    const promised = typeof raw.promised_payment_date === "string" ? raw.promised_payment_date.slice(0, 10) : null;
    const due = typeof raw.due_date === "string" ? raw.due_date.slice(0, 10) : null;
    const month = String(raw.month ?? "");

    let expectedDate: string | null = null;
    let basis: MonthlyInvoiceCashForecastItem["collection_basis"] = "unknown";

    if (arrangementActive && promised) {
      expectedDate = promised;
      basis = "promised_payment_date";
    } else if (due) {
      expectedDate = due;
      basis = "due_date";
    } else if (status === "draft") {
      expectedDate = monthEndFromMonth(month);
      basis = expectedDate ? "month_end" : "unknown";
    }

    const isOverdue = status === "overdue" || Boolean(expectedDate && expectedDate < today && status !== "draft");

    totalOpen += balance;
    if (status === "draft") draft += balance;
    if (isOverdue) overdue += balance;

    if (!expectedDate) {
      unknown += balance;
    } else if (expectedDate <= in7) {
      due7 += balance;
    } else if (expectedDate <= in14) {
      due14 += balance;
    } else {
      dueLater += balance;
    }

    items.push({
      id: String(raw.id),
      customer_id: String(raw.customer_id),
      month,
      status,
      balance_cents: balance,
      expected_collection_date: expectedDate,
      collection_basis: basis,
      payment_arrangement_active: arrangementActive,
      is_overdue: isOverdue,
    });
  }

  return {
    as_of: now.toISOString(),
    total_open_cents: totalOpen,
    overdue_cents: overdue,
    due_next_7_days_cents: due7,
    due_next_14_days_cents: due14,
    due_later_cents: dueLater,
    draft_cents: draft,
    unknown_date_cents: unknown,
    items,
  };
}
