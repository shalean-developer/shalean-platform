import "server-only";

import { createNotificationConfigBreaker } from "@/lib/email/notificationConfigBreaker";
import { finalizeAndSendMonthlyInvoice } from "@/lib/monthlyInvoice/finalizeAndSendMonthlyInvoice";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type FinalizeMonthlyInvoicesResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  today?: string;
  finalized?: number;
  errors?: string[];
};

/**
 * Idempotent finalize when a draft monthly invoice is ready to collect:
 * - Fixed recurring plans: every expected visit for the billing month is on the invoice, and
 *   today is on or after the last scheduled visit in that month.
 * - On-demand / ad-hoc monthly (no active recurring plan for the month): wait until the
 *   Johannesburg calendar month has ended (so Airbnb turnovers can still attach).
 *
 * **Schedule (ops):** run **daily** — recommended **23:55 Africa/Johannesburg**.
 *
 * **Collection:** Paystack hosted payment link + email. `due_date` is stamped to `today` at finalize.
 *
 * **Zero balance:** `total_amount_cents === 0` → snapshot + mark `paid` with `closure_reason: zero_amount`.
 */
export async function finalizeDueMonthlyInvoices(): Promise<FinalizeMonthlyInvoicesResult> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, reason: "supabase_admin_missing" };

  const today = todayJohannesburg();
  const todayYm = today.slice(0, 7);
  const errors: string[] = [];
  let finalized = 0;
  let skippedNotReady = 0;

  const emailBreaker = createNotificationConfigBreaker({
    source: "cron/finalize-monthly-invoices",
    channel: "email",
  });

  const { data: draftRows, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, due_date, status")
    .eq("status", "draft")
    .lte("month", todayYm);

  if (error) {
    await reportOperationalIssue("error", "cron/finalize-monthly-invoices", error.message);
    return { ok: false, reason: error.message, today };
  }

  for (const raw of draftRows ?? []) {
    const inv = raw as { id: string; customer_id: string; month: string };
    const result = await finalizeAndSendMonthlyInvoice(admin, {
      invoiceId: inv.id,
      customerId: inv.customer_id,
      month: inv.month,
      todayYmd: today,
      source: "cron/finalize-monthly-invoices",
      emailBreaker,
    });

    if (result.ok) {
      finalized += 1;
      continue;
    }
    if ("skipped" in result) {
      skippedNotReady += 1;
      continue;
    }
    errors.push(`${inv.id}: ${result.error}`);
  }

  await logSystemEvent({
    level: "info",
    source: "cron/finalize-monthly-invoices",
    message: "finalize_monthly_invoices_done",
    context: {
      today,
      todayYm,
      draft_candidates: (draftRows ?? []).length,
      skipped_not_ready: skippedNotReady,
      finalized,
      error_count: errors.length,
      email_breaker: emailBreaker.snapshot(),
    },
  });

  return { ok: true, today, finalized, errors: errors.length ? errors : undefined };
}
