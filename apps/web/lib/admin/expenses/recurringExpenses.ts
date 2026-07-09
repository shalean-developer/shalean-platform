import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type RecurringExpenseFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
export type RecurringExpenseStatus = "active" | "paused" | "cancelled";

export type RecurringExpenseRow = {
  id: string;
  description: string;
  category_id: string;
  vendor_id: string | null;
  branch_id: string;
  amount_cents: number;
  payment_method: string;
  paid_from_account_id: string | null;
  frequency: RecurringExpenseFrequency;
  next_run_date: string;
  last_generated_at: string | null;
  status: RecurringExpenseStatus;
  auto_approve: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export function addFrequencyToDate(ymd: string, frequency: RecurringExpenseFrequency): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  switch (frequency) {
    case "daily":
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case "yearly":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
  }
  return d.toISOString().slice(0, 10);
}

export async function generateDueRecurringExpenses(
  admin: SupabaseClient,
  asOfDate?: string,
): Promise<{ generated: number; errors: string[] }> {
  const today = asOfDate ?? new Date().toISOString().slice(0, 10);
  const errors: string[] = [];
  let generated = 0;

  const { data: due, error } = await admin
    .from("recurring_expenses")
    .select("*")
    .eq("status", "active")
    .lte("next_run_date", today);

  if (error) return { generated: 0, errors: [error.message] };

  for (const rec of (due ?? []) as RecurringExpenseRow[]) {
    const now = new Date().toISOString();
    const expenseStatus = rec.auto_approve ? "approved" : "pending";
    const approvalStage = rec.auto_approve ? "complete" : "finance";

    const { error: insErr } = await admin.from("expenses").insert({
      expense_date: rec.next_run_date,
      category_id: rec.category_id,
      description: `[Recurring] ${rec.description}`,
      amount_cents: rec.amount_cents,
      payment_method: rec.payment_method,
      paid_from_account_id: rec.paid_from_account_id,
      vendor_id: rec.vendor_id,
      branch_id: rec.branch_id,
      notes: rec.notes,
      status: expenseStatus,
      approval_stage: approvalStage,
      recurring_expense_id: rec.id,
      approved_at: rec.auto_approve ? now : null,
      created_by: rec.created_by,
    });

    if (insErr) {
      errors.push(`${rec.id}: ${insErr.message}`);
      continue;
    }

    const nextRun = addFrequencyToDate(rec.next_run_date, rec.frequency);
    await admin
      .from("recurring_expenses")
      .update({
        next_run_date: nextRun,
        last_generated_at: now,
        updated_at: now,
      })
      .eq("id", rec.id);

    generated += 1;
  }

  return { generated, errors };
}
