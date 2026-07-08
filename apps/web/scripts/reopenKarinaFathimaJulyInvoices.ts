/**
 * Ops one-off: reopen Karina + Fathima July 2026 monthly invoices to draft
 * after premature on-demand finalize.
 *
 * Usage (from apps/web):
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/reopenKarinaFathimaJulyInvoices.ts
 */
import { createClient } from "@supabase/supabase-js";

import { reopenMonthlyInvoiceToDraft } from "../lib/monthlyInvoice/reopenMonthlyInvoiceToDraft";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const targets = [
    {
      name: "Karina Bahryi",
      invoiceId: "04e5eac5-5da6-4b86-b2af-3b6b7fe2cec1",
    },
    {
      name: "Fathima Doc",
      invoiceId: "2b48747e-96e1-4d68-8a38-91bc05f03344",
    },
  ] as const;

  for (const t of targets) {
    console.log(`\nReopening ${t.name} ${t.invoiceId}…`);
    const result = await reopenMonthlyInvoiceToDraft(admin, {
      invoiceId: t.invoiceId,
      actor: "ops:cursor",
      source: "scripts/reopenKarinaFathimaJulyInvoices",
      reason: "on_demand_month_end_fix_premature_send",
      attachOrphanBookingsInMonth: true,
    });
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      process.exitCode = 1;
      continue;
    }

    const { data: inv } = await admin
      .from("monthly_invoices")
      .select(
        "id, status, due_date, sent_at, finalized_at, payment_link, paystack_reference, zoho_invoice_id, total_bookings, total_amount_cents, initial_invoice_email_dispatch_claimed",
      )
      .eq("id", t.invoiceId)
      .single();
    console.log("after", JSON.stringify(inv, null, 2));

    const { data: books } = await admin
      .from("bookings")
      .select("id, date, status, monthly_invoice_id, total_paid_zar")
      .eq("monthly_invoice_id", t.invoiceId)
      .order("date");
    console.log(
      "bookings",
      (books ?? []).map((b) => `${b.date} ${b.status} R${b.total_paid_zar}`),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
