/**
 * Finalize + send June monthly invoices that meet automatic readiness rules only.
 *
 * Usage (from apps/web):
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/sendReadyMonthlyInvoices.ts
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/sendReadyMonthlyInvoices.ts --apply
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/sendReadyMonthlyInvoices.ts --apply --month=2026-06
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { formatMonthLongYearUtc } from "../lib/admin/invoices/invoiceAdminFormatters";
import { finalizeAndSendMonthlyInvoice } from "../lib/monthlyInvoice/finalizeAndSendMonthlyInvoice";
import { assessMonthlyInvoiceFinalizeReadiness } from "../lib/monthlyInvoice/isMonthlyInvoiceReadyToFinalize";
import { todayJohannesburg } from "../lib/recurring/johannesburgCalendar";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const apply = process.argv.includes("--apply");
const monthArg = process.argv.find((a) => a.startsWith("--month="));
const month = monthArg?.slice("--month=".length).trim() || todayJohannesburg().slice(0, 7);

async function loadCustomerName(admin: SupabaseClient, customerId: string): Promise<string> {
  const { data } = await admin.from("user_profiles").select("full_name").eq("id", customerId).maybeSingle();
  return String((data as { full_name?: string | null } | null)?.full_name ?? "").trim() || customerId.slice(0, 8);
}

async function main() {
  if (!url || !key) {
    console.error("Missing Supabase env.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const today = todayJohannesburg();

  const { data: drafts, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, status, is_closed, total_amount_cents")
    .eq("month", month)
    .eq("status", "draft");

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  console.log(apply ? "Mode: APPLY" : "Mode: DRY-RUN");
  console.log(`Month filter: ${month} (${formatMonthLongYearUtc(month)})`);
  console.log(`Today: ${today}`);
  console.log(`Draft invoices in month: ${(drafts ?? []).length}\n`);

  const results: Array<{ name: string; invoiceId: string; outcome: string; detail?: string }> = [];

  for (const raw of drafts ?? []) {
    const inv = raw as {
      id: string;
      customer_id: string;
      month: string;
      is_closed: boolean | null;
      total_amount_cents: number | null;
    };

    if (inv.is_closed) {
      results.push({ name: await loadCustomerName(admin, inv.customer_id), invoiceId: inv.id, outcome: "skipped", detail: "month_closed" });
      continue;
    }

    const readiness = await assessMonthlyInvoiceFinalizeReadiness(admin, {
      invoiceId: inv.id,
      customerId: inv.customer_id,
      month: inv.month,
      todayYmd: today,
    });

    if (!readiness.ready) {
      results.push({
        name: await loadCustomerName(admin, inv.customer_id),
        invoiceId: inv.id,
        outcome: "skipped",
        detail: `${readiness.reason ?? "not_ready"}${readiness.lastVisitYmd ? ` (last visit ${readiness.lastVisitYmd})` : ""}`,
      });
      continue;
    }

    if (!apply) {
      results.push({
        name: await loadCustomerName(admin, inv.customer_id),
        invoiceId: inv.id,
        outcome: "would_send",
        detail: `R ${((inv.total_amount_cents ?? 0) / 100).toLocaleString("en-ZA")}`,
      });
      continue;
    }

    const sent = await finalizeAndSendMonthlyInvoice(admin, {
      invoiceId: inv.id,
      customerId: inv.customer_id,
      month: inv.month,
      todayYmd: today,
      forceEarlySend: false,
      actor: "script/send-ready-monthly-invoices",
      source: "script/send-ready-monthly-invoices",
    });

    if (sent.ok) {
      results.push({
        name: await loadCustomerName(admin, inv.customer_id),
        invoiceId: inv.id,
        outcome: sent.outcome,
        detail: sent.outcome === "sent" ? sent.paymentUrl : undefined,
      });
    } else if ("skipped" in sent) {
      results.push({ name: await loadCustomerName(admin, inv.customer_id), invoiceId: inv.id, outcome: "skipped", detail: sent.reason });
    } else {
      results.push({ name: await loadCustomerName(admin, inv.customer_id), invoiceId: inv.id, outcome: "error", detail: sent.error });
    }
  }

  console.table(results);

  const sentCount = results.filter((r) => r.outcome === "sent" || r.outcome === "paid_zero" || r.outcome === "would_send").length;
  const skipped = results.filter((r) => r.outcome === "skipped").length;
  const errors = results.filter((r) => r.outcome === "error").length;

  console.log(`\nSent/would send: ${sentCount} · Skipped: ${skipped} · Errors: ${errors}`);
  if (!apply) console.log("\nRe-run with --apply to send.");

  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
