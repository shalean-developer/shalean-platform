/**
 * OFFICE-BILLING-E2E-07B — bounded cleanup for four orphan monthly drafts.
 *
 * Dry-run by default.
 * Apply requires --apply --confirm=OFFICE-BILLING-E2E-07B
 *
 * Deletes only monthly_invoices that are:
 * - frozen in TARGET_IDS
 * - status=draft
 * - total/balance/paid all zero
 * - not closed
 * - no Paystack or Zoho state
 * - no invoice events/adjustments/idempotency/dedup rows
 * - all attached bookings are cancelled
 *
 * bookings.monthly_invoice_id is ON DELETE SET NULL, so booking history remains.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const PROD_REF = "paqjwfulwywtsyyvdxrq";
const CONFIRM = "OFFICE-BILLING-E2E-07B";
const TARGET_IDS = [
  "195950ef-c46e-4977-8a91-e2e7684703bb",
  "b022a98a-53c0-4f31-8a81-1da8499b3afb",
  "bd510d4c-3a41-4790-a940-3c05e6b686b9",
  "f4ad4b8a-e870-4ec5-b583-c561bbe4d6c7"
] as const;

function fail(message: string): never {
  console.error(`PRECHECK_FAIL: ${message}`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
  const apply = process.argv.includes("--apply");
  const confirm = process.argv.find((x) => x.startsWith("--confirm="))?.slice("--confirm=".length);

  if (!url || !key) fail("missing Supabase service environment");
  if (!url.includes(`${PROD_REF}.supabase.co`)) fail("refusing non-production Supabase URL");
  if (String(process.env.SHALEAN_APP_ENV ?? "").trim().toLowerCase() !== "production") {
    fail("SHALEAN_APP_ENV must be production");
  }
  if (apply && confirm !== CONFIRM) fail(`apply requires --confirm=${CONFIRM}`);

  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error } = await admin
    .from("monthly_invoices")
    .select("id, status, total_amount_cents, amount_paid_cents, balance_cents, paystack_reference, payment_link, zoho_invoice_id, zoho_invoice_number, sent_at, finalized_at, closure_reason, is_closed, initial_invoice_email_dispatch_claimed")
    .in("id", [...TARGET_IDS]);

  if (error) fail(error.message);
  if ((rows ?? []).length !== TARGET_IDS.length) {
    fail(`expected ${TARGET_IDS.length} invoice rows; found ${rows?.length ?? 0}`);
  }

  const byId = new Map((rows ?? []).map((r) => [String(r.id), r as Record<string, unknown>]));

  for (const id of TARGET_IDS) {
    const row = byId.get(id);
    if (!row) fail(`missing invoice ${id}`);
    if (String(row.status ?? "").toLowerCase() !== "draft") fail(`${id} status=${row.status}`);
    if (Math.round(Number(row.total_amount_cents ?? 0)) !== 0) fail(`${id} total is non-zero`);
    if (Math.round(Number(row.amount_paid_cents ?? 0)) !== 0) fail(`${id} paid amount is non-zero`);
    if (Math.round(Number(row.balance_cents ?? 0)) !== 0) fail(`${id} balance is non-zero`);
    if (Boolean(row.is_closed)) fail(`${id} is already closed`);
    if (String(row.paystack_reference ?? "").trim()) fail(`${id} has Paystack reference`);
    if (String(row.payment_link ?? "").trim()) fail(`${id} has payment link`);
    if (String(row.zoho_invoice_id ?? "").trim()) fail(`${id} has Zoho invoice`);
    if (String(row.zoho_invoice_number ?? "").trim()) fail(`${id} has Zoho invoice number`);
    if (row.sent_at || row.finalized_at) fail(`${id} has sent/finalized timestamp`);
    if (row.initial_invoice_email_dispatch_claimed === true) fail(`${id} has email claim`);

    const [
      { data: bookings, error: bookingsErr },
      { count: eventCount, error: eventsErr },
      { count: adjustmentCount, error: adjustmentsErr },
      { count: idempotencyCount, error: idemErr },
      { count: dedupCount, error: dedupErr },
    ] = await Promise.all([
      admin.from("bookings").select("id, status").eq("monthly_invoice_id", id),
      admin.from("monthly_invoice_events").select("id", { count: "exact", head: true }).eq("invoice_id", id),
      admin.from("invoice_adjustments").select("id", { count: "exact", head: true }).eq("applied_to_invoice_id", id),
      admin.from("admin_api_idempotency").select("id", { count: "exact", head: true }).eq("invoice_id", id),
      admin.from("monthly_invoice_paystack_charge_dedup").select("charge_reference", { count: "exact", head: true }).eq("invoice_id", id),
    ]);

    if (bookingsErr) fail(`${id} bookings query failed: ${bookingsErr.message}`);
    if (eventsErr) fail(`${id} events query failed: ${eventsErr.message}`);
    if (adjustmentsErr) fail(`${id} adjustments query failed: ${adjustmentsErr.message}`);
    if (idemErr) fail(`${id} idempotency query failed: ${idemErr.message}`);
    if (dedupErr) fail(`${id} dedup query failed: ${dedupErr.message}`);

    if ((bookings ?? []).length === 0) fail(`${id} has no attached bookings`);
    const nonCancelled = (bookings ?? []).filter((b) => String(b.status ?? "").toLowerCase() !== "cancelled");
    if (nonCancelled.length > 0) fail(`${id} has ${nonCancelled.length} non-cancelled booking(s)`);

    if ((eventCount ?? 0) !== 0) fail(`${id} has ${eventCount} event(s)`);
    if ((adjustmentCount ?? 0) !== 0) fail(`${id} has ${adjustmentCount} adjustment(s)`);
    if ((idempotencyCount ?? 0) !== 0) fail(`${id} has ${idempotencyCount} idempotency row(s)`);
    if ((dedupCount ?? 0) !== 0) fail(`${id} has ${dedupCount} Paystack dedup row(s)`);

    console.log(`READY ${id.slice(0,8)} cancelled_bookings=${bookings!.length}`);
  }

  console.log(`PRECHECK_PASS targets=${TARGET_IDS.length} zero_value=${TARGET_IDS.length} cancelled_only=${TARGET_IDS.length} external_state=0 email_state=0`);
  console.log(apply ? "MODE=APPLY_DELETE_ORPHANS" : "MODE=DRY_RUN_DELETE_ORPHANS");

  if (!apply) {
    for (const id of TARGET_IDS) {
      console.log(`[dry-run] would delete orphan monthly invoice ${id.slice(0,8)}; cancelled bookings retained with monthly_invoice_id=NULL`);
    }
    console.log("OFFICE_BILLING_E2E_07B_DRY_RUN_COMPLETE");
    return;
  }

  let deleted = 0;
  for (const id of TARGET_IDS) {
    const { data: deletedRows, error: deleteErr } = await admin
      .from("monthly_invoices")
      .delete()
      .eq("id", id)
      .eq("status", "draft")
      .eq("total_amount_cents", 0)
      .eq("amount_paid_cents", 0)
      .eq("balance_cents", 0)
      .is("paystack_reference", null)
      .is("payment_link", null)
      .is("zoho_invoice_id", null)
      .select("id");

    if (deleteErr) fail(`${id} delete failed: ${deleteErr.message}`);
    if (!deletedRows?.length) fail(`${id} delete guard matched no row`);

    const { data: linkedBookings, error: verifyErr } = await admin
      .from("bookings")
      .select("id")
      .eq("monthly_invoice_id", id);
    if (verifyErr) fail(`${id} post-delete booking verification failed: ${verifyErr.message}`);
    if ((linkedBookings ?? []).length !== 0) fail(`${id} still has linked bookings after delete`);

    deleted += 1;
    console.log(`DELETED ${id}`);
  }

  console.log(`SUMMARY deleted=${deleted} customer_emails_sent=0 paystack_created=0 zoho_created=0`);
  console.log("OFFICE_BILLING_E2E_07B_APPLY_COMPLETE");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
