/**
 * Diagnose Resend invoice email (with optional PDF attachment).
 *
 * Usage (from apps/web):
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/diagnoseResendInvoiceEmail.ts
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/diagnoseResendInvoiceEmail.ts --apply --to=you@example.com
 */
import { createClient } from "@supabase/supabase-js";

import { sendMonthlyInvoiceEmail } from "../lib/monthlyInvoice/sendMonthlyInvoiceEmail";
import { getDefaultFromAddress } from "../lib/email/resendFrom";
import { trustMonthlyInvoicePayPageUrl } from "../lib/pay/trustPayPageUrl";

const apply = process.argv.includes("--apply");
const toArg = process.argv.find((a) => a.startsWith("--to="));
const to = toArg?.slice("--to=".length).trim() || "delivered@resend.dev";
const invoiceId = "01564f22-57bf-4fb8-abbe-d699889a3387";

async function main() {
  const key = process.env.RESEND_API_KEY?.trim() ?? "";
  console.log("RESEND_API_KEY:", key ? `set (${key.length} chars, ${key.slice(0, 7)}…)` : "MISSING");
  console.log("RESEND_FROM:", getDefaultFromAddress());

  const domainsRes = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  });
  console.log("GET /domains:", domainsRes.status, (await domainsRes.text()).slice(0, 120));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing Supabase env.");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: inv } = await admin
    .from("monthly_invoices")
    .select("id, month, due_date, payment_link, paystack_reference, balance_cents, zoho_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!inv) {
    console.error("Invoice not found");
    process.exit(1);
  }

  const row = inv as {
    month: string;
    due_date: string | null;
    payment_link: string | null;
    paystack_reference: string | null;
    balance_cents: number | null;
    zoho_invoice_id: string | null;
  };

  const paymentUrl = trustMonthlyInvoicePayPageUrl(
    invoiceId,
    String(row.paystack_reference ?? ""),
    String(row.payment_link ?? ""),
  );

  console.log("Invoice:", {
    month: row.month,
    zoho_invoice_id: row.zoho_invoice_id,
    balance_cents: row.balance_cents,
    paymentUrl: paymentUrl.slice(0, 80),
  });

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply --to=your@email.com to send.");
    return;
  }

  const result = await sendMonthlyInvoiceEmail({
    to,
    monthLabel: "June 2026",
    month: row.month,
    totalZar: Math.round(Number(row.balance_cents ?? 0)) / 100,
    paymentUrl,
    paystackPaymentUrl: String(row.payment_link ?? ""),
    dueDateLabel: String(row.due_date ?? ""),
    zohoInvoiceId: row.zoho_invoice_id,
  });

  console.log("\nSend result:", JSON.stringify(result, null, 2));
  process.exit(result.sent ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
