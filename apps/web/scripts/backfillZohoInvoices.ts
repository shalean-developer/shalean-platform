/**
 * Backfill Zoho Books invoices for already-paid per-visit bookings that were
 * settled before Zoho sync was configured (idempotent — skips rows that already
 * have `zoho_invoice_id`).
 *
 * This has SIDE EFFECTS in Zoho (creates + marks invoices paid), so it runs in
 * dry-run mode unless you pass `--apply`.
 *
 * From `apps/web` (server-only imports require the react-server condition):
 *   npm run backfill:zoho-invoices                 # dry-run (no writes)
 *   npm run backfill:zoho-invoices -- --apply      # create + link invoices
 *
 * Requires ZOHO_* and Supabase service-role env (loaded from .env.local via the
 * npm script's --env-file flag).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createZohoInvoice, markZohoInvoicePaid, todayYmdJhb } from "../lib/zoho/zohoBooksService";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

const apply = process.argv.includes("--apply");

type Row = {
  id: string;
  customer_email: string | null;
  service: string | null;
  date: string | null;
  location: string | null;
  suburb: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  paystack_reference: string | null;
  payment_status: string | null;
  is_monthly_billing_booking: boolean | null;
  zoho_invoice_id: string | null;
};

function isPaidPerVisit(r: Row): boolean {
  if (r.zoho_invoice_id) return false;
  if (!r.customer_email) return false;
  if (r.is_monthly_billing_booking === true) return false;
  if (String(r.payment_status ?? "").toLowerCase() === "pending_monthly") return false;
  const totalZar = r.total_paid_zar ?? (r.amount_paid_cents ?? 0) / 100;
  return totalZar > 0;
}

async function main() {
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN) {
    console.error("Missing ZOHO_CLIENT_ID / ZOHO_REFRESH_TOKEN — Zoho sync is not configured.");
    process.exit(1);
  }

  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

  console.log(apply ? "Mode: APPLY (will write to Zoho + Supabase)" : "Mode: DRY-RUN (no writes)");

  let scanned = 0;
  let eligible = 0;
  let created = 0;
  let failed = 0;

  const pageSize = 200;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("bookings")
      .select(
        "id, customer_email, service, date, location, suburb, total_paid_zar, amount_paid_cents, paystack_reference, payment_status, is_monthly_billing_booking, zoho_invoice_id",
      )
      .is("zoho_invoice_id", null)
      .not("payment_completed_at", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("list bookings failed:", error.message);
      break;
    }

    const rows = (data ?? []) as Row[];
    for (const r of rows) {
      scanned += 1;
      if (!isPaidPerVisit(r)) continue;
      eligible += 1;

      const totalZar = r.total_paid_zar ?? (r.amount_paid_cents ?? 0) / 100;
      const reference = r.paystack_reference ?? r.id;

      if (!apply) {
        console.log(`[dry-run] would invoice booking ${r.id} — ${r.service ?? "service"} — R${totalZar}`);
        continue;
      }

      const today = todayYmdJhb();
      const locationLabel = [r.location, r.suburb].filter(Boolean).join(", ");
      const createRes = await createZohoInvoice({
        referenceId: r.id,
        customerEmail: r.customer_email!,
        customerName: r.customer_email!,
        invoiceDate: today,
        dueDate: today,
        lineItems: [
          {
            name: r.service ?? "Shalean Cleaning Service",
            description: [r.date, locationLabel].filter(Boolean).join(" · ") || `Booking ref: ${reference}`,
            rate: totalZar,
            quantity: 1,
          },
        ],
        notes: `Backfilled. Paystack ref: ${reference}`,
        currencyCode: "ZAR",
      });

      if (!createRes.ok) {
        failed += 1;
        console.error(`booking ${r.id}: create failed — ${createRes.error}`);
        continue;
      }

      await markZohoInvoicePaid({
        zohoInvoiceId: createRes.zohoInvoiceId,
        amountZar: totalZar,
        paymentDate: today,
        reference,
        customerEmail: r.customer_email!,
      });

      const { error: upErr } = await admin
        .from("bookings")
        .update({ zoho_invoice_id: createRes.zohoInvoiceId })
        .eq("id", r.id);
      if (upErr) {
        failed += 1;
        console.error(`booking ${r.id}: invoice ${createRes.zohoInvoiceId} created but DB update failed — ${upErr.message}`);
        continue;
      }

      created += 1;
      console.log(`booking ${r.id}: linked Zoho invoice ${createRes.invoiceNumber} (${createRes.zohoInvoiceId})`);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  console.log(
    `Done. scanned=${scanned} eligible=${eligible} created=${created} failed=${failed}${apply ? "" : " (dry-run)"}`,
  );
}

void main();
