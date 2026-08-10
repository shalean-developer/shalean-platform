import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves a customer's contractual monthly invoice due date.
 * A due_day of 10 means the invoice for YYYY-MM is due on the 10th
 * of the following calendar month. Returns null when no active override exists.
 */
export async function resolveCustomerMonthlyDueDate(
  admin: SupabaseClient,
  params: { customerId: string; month: string },
): Promise<string | null> {
  const month = String(params.month ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return null;

  const { data, error } = await admin
    .from("customer_monthly_billing_terms")
    .select("due_day, active")
    .eq("customer_id", params.customerId)
    .maybeSingle();

  if (error || !data || data.active === false) return null;

  const dueDay = Math.max(1, Math.min(28, Math.trunc(Number(data.due_day ?? 0))));
  if (!dueDay) return null;

  const [year, monthNum] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNum, 1));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dueDay).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
