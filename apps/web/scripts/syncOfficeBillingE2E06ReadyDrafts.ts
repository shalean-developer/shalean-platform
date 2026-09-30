/**
 * OFFICE-BILLING-E2E-06 — bounded finalization/sending of the 18 draft monthly
 * invoices classified READY by the E2E-05 read-only audit.
 *
 * Dry-run by default.
 * Apply requires: --apply --confirm=OFFICE-BILLING-E2E-06
 *
 * The other six drafts are intentionally excluded:
 * - 4 zero-value cancelled-only
 * - 1 with an open booking
 * - 1 recurring-schedule-incomplete
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { resolveZohoCustomerContactForMonthlyInvoice } from "../lib/zoho/resolveZohoCustomerContact";
import { resolveMonthlyInvoiceCustomerEmail } from "../lib/monthlyInvoice/resolveMonthlyInvoiceCustomerEmail";
import { todayJohannesburg } from "../lib/recurring/johannesburgCalendar";

const PROD_REF = "paqjwfulwywtsyyvdxrq";
const CONFIRM = "OFFICE-BILLING-E2E-06";

const TARGET_IDS = [
  "21333f4a-4760-403f-9761-79ededbe8c0c",
  "36c8f4db-ee8b-4357-b856-2c669a66afc2",
  "37e728fa-ad59-4c6b-ad04-9790ba55c96e",
  "3d2ad4ee-cba8-48ac-8177-f0ca71f4a608",
  "49ce355a-ad9d-4c0d-8d28-29c979e1e652",
  "4effde1e-c1c1-41d0-ae8d-76f312642913",
  "61a04a66-106d-4d51-8c49-08fd948ed55b",
  "7d63403e-37b2-42d7-83ee-68d5751e7924",
  "80eaae10-ec1d-45a5-a90d-4c34eda12b33",
  "8960a72b-cd8d-4149-b292-8d375596ffc1",
  "9f4836db-5ad4-43c7-8e19-2f8b5a8c8cdb",
  "b223ce4e-eea9-4bcc-8915-b5f135aa6e21",
  "b7c14219-1443-43fc-93be-0a41f091297a",
  "c347e67d-5ad4-41d6-90f9-1d6d1cfe4c1a",
  "e2c6492b-2324-4d43-baa8-dc52d8688100",
  "ed9ee326-e363-489b-a8fe-aec588946165",
  "f8bfcf5d-efbf-4113-bd26-fd25d56a39d0"
] as const;

function fail(message: string): never {
  console.error(`PRECHECK_FAIL: ${message}`);
  process.exit(1);
}

async function precheck(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, status, total_amount_cents, amount_paid_cents, zoho_invoice_id, is_closed")
    .in("id", [...TARGET_IDS]);

  if (error) fail(`invoice query failed: ${error.message}`);
  if ((data ?? []).length !== TARGET_IDS.length) {
    fail(`expected ${TARGET_IDS.length} target invoices; found ${data?.length ?? 0}`);
  }

  const byId = new Map((data ?? []).map((row) => [String(row.id), row]));

  for (const id of TARGET_IDS) {
    const row = byId.get(id);
    if (!row) fail(`missing invoice ${id}`);
    if (String(row.status ?? "").toLowerCase() !== "draft") fail(`${id} status=${row.status}`);
    if (row.is_closed === true) fail(`${id} is closed`);
    if (String(row.zoho_invoice_id ?? "").trim()) fail(`${id} already linked to Zoho`);

    const cents = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0)));
    if (cents <= 0) fail(`${id} has non-positive total`);
    if (Math.round(Number(row.amount_paid_cents ?? 0)) !== 0) fail(`${id} already has paid amount`);

    const { data: bookings, error: bookingError } = await admin
      .from("bookings")
      .select("id, status")
      .eq("monthly_invoice_id", id);

    if (bookingError) fail(`${id} booking query failed: ${bookingError.message}`);

    const open = (bookings ?? []).filter((booking) => {
      const status = String((booking as { status?: string }).status ?? "").toLowerCase();
      return status !== "completed" && status !== "cancelled";
    });
    if (open.length > 0) fail(`${id} now has ${open.length} open booking(s)`);

    const contact = await resolveZohoCustomerContactForMonthlyInvoice(admin, {
      invoiceId: id,
      customerId: String(row.customer_id),
    });
    if (!contact.ok) fail(`${id} contact resolution failed: ${contact.error}`);

    const outboundEmail = await resolveMonthlyInvoiceCustomerEmail(admin, {
      invoiceId: id,
      customerId: String(row.customer_id),
    });
    if (!outboundEmail) fail(`${id} customer outbound email missing`);
  }

  return byId;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
  const apply = process.argv.includes("--apply");
  const confirmArg = process.argv.find((arg) => arg.startsWith("--confirm="))?.slice("--confirm=".length);

  if (!url || !key) fail("missing Supabase service environment");
  if (!url.includes(`${PROD_REF}.supabase.co`)) fail(`refusing non-production Supabase URL: ${url}`);
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN || !process.env.ZOHO_ORGANIZATION_ID) {
    fail("missing Zoho configuration");
  }
  if (!String(process.env.PAYSTACK_SECRET_KEY ?? "").trim()) {
    fail("PAYSTACK_SECRET_KEY missing");
  }
  if (!String(process.env.RESEND_API_KEY ?? "").trim()) {
    fail("RESEND_API_KEY missing");
  }
  if (apply && confirmArg !== CONFIRM) fail(`apply requires --confirm=${CONFIRM}`);

  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  const byId = await precheck(admin);

  console.log(`PRECHECK_PASS targets=${TARGET_IDS.length} drafts=${TARGET_IDS.length} positive=${TARGET_IDS.length} contacts=${TARGET_IDS.length} outbound_emails=${TARGET_IDS.length} paystack=SET resend=SET`);
  console.log(apply ? "MODE=APPLY" : "MODE=DRY_RUN");

  if (!apply) {
    for (const id of TARGET_IDS) {
      const row = byId.get(id)!;
      console.log(
        `[dry-run] would finalize/send ${id.slice(0, 8)} — ${row.month} — R${(Math.round(Number(row.total_amount_cents ?? 0)) / 100).toFixed(2)}`,
      );
    }
    console.log("OFFICE_BILLING_E2E_06_DRY_RUN_COMPLETE");
    return;
  }

  // Import only on apply. If this server-only path cannot load in the CLI runtime,
  // the process stops before the first invoice mutation.
  const { finalizeAndSendMonthlyInvoice } = await import("../lib/monthlyInvoice/finalizeAndSendMonthlyInvoice");

  let sent = 0;
  let paidZero = 0;
  let skipped = 0;
  let failed = 0;

  for (const id of TARGET_IDS) {
    const row = byId.get(id)!;

    const result = await finalizeAndSendMonthlyInvoice(admin, {
      invoiceId: id,
      customerId: String(row.customer_id),
      month: String(row.month),
      todayYmd: todayJohannesburg(),
      forceEarlySend: false,
      actor: "script/office-billing-e2e-06",
      source: "script/office-billing-e2e-06",
      resumePartialFinalize: true,
    });

    console.log(`${id}: ${JSON.stringify(result)}`);

    if (result.ok) {
      if (result.outcome === "sent") sent += 1;
      else if (result.outcome === "paid_zero") paidZero += 1;
      continue;
    }

    if ("skipped" in result && result.skipped) skipped += 1;
    else failed += 1;
  }

  console.log(`SUMMARY sent=${sent} paid_zero=${paidZero} skipped=${skipped} failed=${failed}`);
  if (skipped > 0 || failed > 0) process.exitCode = 1;
  console.log("OFFICE_BILLING_E2E_06_APPLY_COMPLETE");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
