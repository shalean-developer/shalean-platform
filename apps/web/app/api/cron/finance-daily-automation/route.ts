import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { checkBudgetAlerts } from "@/lib/admin/expenses/loadBudgets";
import { notifyFinanceUsers } from "@/lib/admin/expenses/financeNotifications";
import { persistBusinessHealthScore } from "@/lib/admin/expenses/businessHealthScore";
import { backfillPaystackPaymentTransactions } from "@/lib/payments/backfillPaystackPaymentTransactions";
import { processAccountingSyncQueue } from "@/lib/accounting/processAccountingSyncQueue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const lockResult = await withCronLock(
    admin,
    { jobName: CRON_LOCK_KEYS.financeDailyAutomation, leaseSeconds: 600 },
    async () => {
      const health = await persistBusinessHealthScore(admin);
      const budgetAlerts = await checkBudgetAlerts(admin);

      for (const alert of budgetAlerts) {
        await notifyFinanceUsers(admin, {
          type: "budget_alert",
          title: "Budget alert",
          body: alert.message,
          link: `/office/budgets?id=${alert.budget_id}`,
          entityType: "budget",
          entityId: alert.budget_id,
        });
      }

      const { data: pendingExpenses } = await admin
        .from("expenses")
        .select("id, description, amount_cents")
        .eq("status", "pending")
        .limit(50);

      if ((pendingExpenses ?? []).length > 0) {
        await notifyFinanceUsers(admin, {
          type: "pending_approval",
          title: "Expenses pending approval",
          body: `${pendingExpenses!.length} expense(s) awaiting approval.`,
          link: "/office/expenses?status=pending",
        });
      }

      const paystackBackfill = await backfillPaystackPaymentTransactions(admin, {
        limit: 75,
        verifyWithPaystack: true,
      });

      const accountingSync = await processAccountingSyncQueue(admin, 50);

      return {
        health_score: health.overall_score,
        budget_alerts: budgetAlerts.length,
        paystack_backfill: paystackBackfill,
        accounting_sync: accountingSync,
      };
    },
  );

  if (lockResult.skipped) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason });
  }
  return NextResponse.json({ ok: true, ...lockResult.ranIt });
}
