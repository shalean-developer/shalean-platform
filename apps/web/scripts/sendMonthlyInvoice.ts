/**
 * Send a draft monthly invoice to the customer (finalize + Paystack + email).
 *
 * Usage (from apps/web):
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/sendMonthlyInvoice.ts --invoice-id=<uuid>
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/sendMonthlyInvoice.ts --invoice-id=<uuid> --apply
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { finalizeAndSendMonthlyInvoice } from "../lib/monthlyInvoice/finalizeAndSendMonthlyInvoice";
import { syncDraftMonthlyInvoiceToZohoAfterRecompute } from "../lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks";
import { todayJohannesburg } from "../lib/recurring/johannesburgCalendar";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const apply = process.argv.includes("--apply");
const invoiceIdArg = process.argv.find((a) => a.startsWith("--invoice-id="));
const invoiceId = invoiceIdArg?.slice("--invoice-id=".length).trim() ?? "";

async function main() {
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (!invoiceId) {
    console.error("Pass --invoice-id=<uuid>");
    process.exit(1);
  }

  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

  const { data: inv, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, status, due_date, total_amount_cents, zoho_invoice_id, payment_link, sent_at, is_closed")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    console.error("load failed:", error.message);
    process.exit(1);
  }
  if (!inv) {
    console.error("Invoice not found.");
    process.exit(1);
  }

  const row = inv as {
    customer_id: string;
    month: string;
    status: string | null;
    due_date: string | null;
    total_amount_cents: number | null;
    zoho_invoice_id: string | null;
    payment_link: string | null;
    sent_at: string | null;
    is_closed: boolean | null;
  };

  const { data: userRes } = await admin.auth.admin.getUserById(row.customer_id);
  const email = userRes.user?.email ?? "(missing)";

  console.log(apply ? "Mode: APPLY (will send)" : "Mode: DRY-RUN");
  console.log({
    id: invoiceId,
    month: row.month,
    status: row.status,
    due_date: row.due_date,
    total_amount_cents: row.total_amount_cents,
    zoho_invoice_id: row.zoho_invoice_id,
    payment_link: row.payment_link ? "(set)" : null,
    sent_at: row.sent_at,
    customer_email: email,
  });

  if (!apply) {
    console.log("Re-run with --apply to send.");
    return;
  }

  if (row.is_closed) {
    console.error("Invoice month is closed.");
    process.exit(1);
  }
  if (String(row.status ?? "").toLowerCase() !== "draft") {
    console.error(`Invoice status is ${row.status}; only draft can be sent.`);
    process.exit(1);
  }

  await syncDraftMonthlyInvoiceToZohoAfterRecompute(admin, invoiceId);

  const result = await finalizeAndSendMonthlyInvoice(admin, {
    invoiceId,
    customerId: row.customer_id,
    month: row.month,
    todayYmd: todayJohannesburg(),
    forceEarlySend: true,
    actor: "script/send-monthly-invoice",
    source: "script/send-monthly-invoice",
  });

  console.log("result:", JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exit(1);
  }

  const { data: after } = await admin
    .from("monthly_invoices")
    .select("status, payment_link, sent_at, finalized_at, zoho_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();
  console.log("after:", after);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
