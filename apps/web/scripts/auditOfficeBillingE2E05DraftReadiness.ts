/**
 * OFFICE-BILLING-E2E-05 — read-only draft monthly invoice readiness audit.
 *
 * No writes. Classifies every current draft as:
 * - ZERO_CANCELLED_ONLY
 * - OPEN_BOOKINGS
 * - NOT_READY:<reason>
 * - CONTACT_BLOCKED:<reason>
 * - READY
 */

import { createClient } from "@supabase/supabase-js";

import { assessMonthlyInvoiceFinalizeReadiness } from "../lib/monthlyInvoice/isMonthlyInvoiceReadyToFinalize";
import { todayJohannesburg } from "../lib/recurring/johannesburgCalendar";
import { resolveZohoCustomerContactForMonthlyInvoice } from "../lib/zoho/resolveZohoCustomerContact";

const PROD_REF = "paqjwfulwywtsyyvdxrq";

function fail(message: string): never {
  console.error(`AUDIT_FAIL: ${message}`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";

  if (!url || !key) fail("missing Supabase service environment");
  if (!url.includes(`${PROD_REF}.supabase.co`)) fail(`refusing non-production Supabase URL: ${url}`);

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const today = todayJohannesburg();

  const { data: drafts, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, status, total_amount_cents, amount_paid_cents, zoho_invoice_id, is_closed")
    .eq("status", "draft")
    .order("month", { ascending: true })
    .order("id", { ascending: true });

  if (error) fail(`draft query failed: ${error.message}`);

  let ready = 0;
  let zeroCancelledOnly = 0;
  let openBookings = 0;
  let contactBlocked = 0;
  let notReady = 0;

  console.log("OFFICE_BILLING_E2E_05_DRAFT_READINESS");
  console.log(`TODAY_JHB=${today}`);
  console.log(`DRAFTS=${drafts?.length ?? 0}`);

  for (const raw of drafts ?? []) {
    const row = raw as {
      id: string;
      customer_id: string;
      month: string;
      total_amount_cents: number | null;
      amount_paid_cents: number | null;
      zoho_invoice_id: string | null;
      is_closed: boolean | null;
    };

    if (String(row.zoho_invoice_id ?? "").trim()) {
      fail(`draft ${row.id} unexpectedly already linked to Zoho`);
    }

    const { data: bookings, error: bookingError } = await admin
      .from("bookings")
      .select("id, date, status")
      .eq("monthly_invoice_id", row.id)
      .order("date", { ascending: true });

    if (bookingError) fail(`booking query failed for ${row.id}: ${bookingError.message}`);

    const bookingRows = bookings ?? [];
    const cancelled = bookingRows.filter(
      (b) => String((b as { status?: string }).status ?? "").toLowerCase() === "cancelled",
    ).length;
    const completed = bookingRows.filter(
      (b) => String((b as { status?: string }).status ?? "").toLowerCase() === "completed",
    ).length;
    const open = bookingRows.length - cancelled - completed;
    const totalCents = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0)));

    let classification = "";
    let reason: string | null = null;
    let resolvedContact = false;

    if (totalCents === 0 && bookingRows.length > 0 && cancelled === bookingRows.length) {
      classification = "ZERO_CANCELLED_ONLY";
      zeroCancelledOnly += 1;
    } else if (open > 0) {
      classification = "OPEN_BOOKINGS";
      reason = `open_bookings=${open}`;
      openBookings += 1;
    } else if (totalCents <= 0) {
      classification = "NOT_READY";
      reason = "non_positive_total";
      notReady += 1;
    } else {
      const readiness = await assessMonthlyInvoiceFinalizeReadiness(admin, {
        invoiceId: row.id,
        customerId: row.customer_id,
        month: row.month,
        todayYmd: today,
      });

      if (!readiness.ready) {
        classification = "NOT_READY";
        reason = readiness.reason ?? "unknown";
        notReady += 1;
      } else {
        const contact = await resolveZohoCustomerContactForMonthlyInvoice(admin, {
          invoiceId: row.id,
          customerId: row.customer_id,
        });
        if (!contact.ok) {
          classification = "CONTACT_BLOCKED";
          reason = contact.error;
          contactBlocked += 1;
        } else {
          classification = "READY";
          resolvedContact = true;
          ready += 1;
        }
      }
    }

    console.log(JSON.stringify({
      id: row.id,
      month: row.month,
      total_cents: totalCents,
      booking_count: bookingRows.length,
      completed_count: completed,
      cancelled_count: cancelled,
      open_count: open,
      classification,
      reason,
      contact_resolved: resolvedContact,
    }));
  }

  console.log(
    `SUMMARY ready=${ready} zero_cancelled_only=${zeroCancelledOnly} open_bookings=${openBookings} contact_blocked=${contactBlocked} not_ready=${notReady}`,
  );
  console.log("READ_ONLY_COMPLETE");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
