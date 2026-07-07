/**
 * Read-only audit: Shalean DB vs Zoho Books invoices.
 * Run: npm run audit:zoho-invoices
 */

import { createClient } from "@supabase/supabase-js";

import { isShaleanSystemLoginEmail } from "../lib/zoho/shaleanBillingContactEmail";
import { zohoBooksClient } from "../lib/zoho/zohoBooksClient";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

type ZohoInv = {
  invoice_id: string;
  invoice_number?: string;
  reference_number?: string;
  status?: string;
  customer_name?: string;
  date?: string;
  total?: number;
};

async function listAllZohoInvoices(): Promise<ZohoInv[]> {
  const all: ZohoInv[] = [];
  let page = 1;
  for (;;) {
    const res = await zohoBooksClient.get<{
      invoices?: ZohoInv[];
      page_context?: { has_more_page?: boolean };
    }>(`/invoices?page=${page}&per_page=200&sort_column=created_time&sort_order=D`);
    all.push(...(res.invoices ?? []));
    if (!res.page_context?.has_more_page) break;
    page += 1;
  }
  return all;
}

async function main() {
  if (!url || !key) {
    console.error("Missing Supabase env.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: bookings } = await admin
    .from("bookings")
    .select("id, zoho_invoice_id, date, is_monthly_billing_booking, payment_status, customer_email")
    .not("zoho_invoice_id", "is", null);

  const { data: monthly } = await admin
    .from("monthly_invoices")
    .select("id, zoho_invoice_id, month, status, amount_paid_cents, total_amount_cents")
    .not("zoho_invoice_id", "is", null);

  const linkedIds = new Set<string>();
  const linkedByZoho = new Map<string, { kind: string; id: string; extra: string }>();

  for (const b of bookings ?? []) {
    const zid = String((b as { zoho_invoice_id?: string }).zoho_invoice_id ?? "").trim();
    if (!zid) continue;
    linkedIds.add(zid);
    linkedByZoho.set(zid, {
      kind: "booking",
      id: String((b as { id: string }).id),
      extra: `date=${(b as { date?: string }).date} monthly=${(b as { is_monthly_billing_booking?: boolean }).is_monthly_billing_booking} pay=${(b as { payment_status?: string }).payment_status}`,
    });
  }

  for (const m of monthly ?? []) {
    const zid = String((m as { zoho_invoice_id?: string }).zoho_invoice_id ?? "").trim();
    if (!zid) continue;
    linkedIds.add(zid);
    linkedByZoho.set(zid, {
      kind: "monthly",
      id: String((m as { id: string }).id),
      extra: `month=${(m as { month?: string }).month} status=${(m as { status?: string }).status} paid=${(m as { amount_paid_cents?: number }).amount_paid_cents}`,
    });
  }

  console.log("=== Shalean DB links ===");
  console.log(`Bookings linked: ${bookings?.length ?? 0}`);
  console.log(`Monthly linked: ${monthly?.length ?? 0}`);
  console.log(`Unique Zoho ids: ${linkedIds.size}`);

  const juneMonthly = (monthly ?? []).filter((m) => String((m as { month?: string }).month).startsWith("2026-06"));
  const juneMonthlyLinked = juneMonthly.filter((m) => (m as { zoho_invoice_id?: string }).zoho_invoice_id);
  console.log(`June 2026 monthly in DB: ${juneMonthly.length}, with zoho link: ${juneMonthlyLinked.length}`);
  for (const m of juneMonthly) {
    const row = m as { id: string; status?: string; zoho_invoice_id?: string | null };
    console.log(`  ${row.id.slice(0, 8)} status=${row.status} zoho=${row.zoho_invoice_id ?? "none"}`);
  }

  const allZoho = await listAllZohoInvoices();
  console.log(`\n=== Zoho org total invoices: ${allZoho.length} ===`);

  const orphans = allZoho.filter((inv) => !linkedIds.has(inv.invoice_id));
  const linked = allZoho.filter((inv) => linkedIds.has(inv.invoice_id));

  console.log(`Linked in Zoho: ${linked.length}`);
  console.log(`Orphans (not in Shalean DB): ${orphans.length}`);

  const cleanerLinked = linked.filter((inv) =>
    /@(cleaner|walkin)\.shalean\.com/i.test(String(inv.customer_name ?? "")),
  );
  const cleanerOrphans = orphans.filter((inv) =>
    /@(cleaner|walkin)\.shalean\.com/i.test(String(inv.customer_name ?? "")),
  );

  console.log(`\nLinked invoices with cleaner/walkin customer name: ${cleanerLinked.length}`);
  for (const inv of cleanerLinked.slice(0, 10)) {
    const db = linkedByZoho.get(inv.invoice_id);
    console.log(`  ${inv.invoice_number} ${inv.reference_number} → ${inv.customer_name} [${db?.kind} ${db?.id.slice(0, 8)}]`);
  }

  console.log(`Orphan invoices with cleaner/walkin customer name: ${cleanerOrphans.length}`);

  const junePaidLinked = linked.filter((inv) => {
    const db = linkedByZoho.get(inv.invoice_id);
    if (!db) return false;
    const isJune =
      db.extra.includes("month=2026-06") ||
      (db.kind === "booking" && db.extra.includes("date=2026-06"));
    return isJune && String(inv.status ?? "").toLowerCase() === "paid";
  });

  console.log(`\nJune-related linked Zoho invoices marked paid: ${junePaidLinked.length}`);
  for (const inv of junePaidLinked) {
    const db = linkedByZoho.get(inv.invoice_id)!;
    console.log(
      `  ${inv.invoice_number} ref=${inv.reference_number} customer=${inv.customer_name} status=${inv.status} [${db.kind} ${db.extra}]`,
    );
  }

  const paidOrphans = orphans.filter((inv) => String(inv.status ?? "").toLowerCase() === "paid");
  console.log(`\nPaid orphan invoices (noise from old repairs): ${paidOrphans.length}`);

  const juneOrphansPaid = orphans.filter(
    (inv) => String(inv.date ?? "").startsWith("2026-06") && String(inv.status ?? "").toLowerCase() === "paid",
  );
  console.log(`Paid orphan invoices dated June 2026: ${juneOrphansPaid.length}`);
  for (const inv of juneOrphansPaid.slice(0, 8)) {
    console.log(`  ${inv.invoice_number} ref=${inv.reference_number} ${inv.customer_name} ${inv.date}`);
  }

  // Bookings with system email still linked
  const badBookingEmails = (bookings ?? []).filter((b) =>
    isShaleanSystemLoginEmail(String((b as { customer_email?: string }).customer_email ?? "")),
  );
  console.log(`\nDB bookings with zoho link + system login email on row: ${badBookingEmails.length}`);
  for (const b of badBookingEmails) {
    const row = b as { id: string; zoho_invoice_id?: string; customer_email?: string };
    const zid = String(row.zoho_invoice_id ?? "").trim();
    if (!zid) continue;
    try {
      const detail = await zohoBooksClient.get<{ invoice?: ZohoInv }>(`/invoices/${encodeURIComponent(zid)}`);
      const inv = detail.invoice;
      console.log(
        `  booking ${row.id.slice(0, 8)} row_email=${row.customer_email} → Zoho ${inv?.invoice_number} customer=${inv?.customer_name}`,
      );
    } catch {
      console.log(`  booking ${row.id.slice(0, 8)} fetch failed`);
    }
  }

  console.log("\nSample orphan invoices with cleaner/walkin customer name:");
  for (const inv of cleanerOrphans.slice(0, 12)) {
    console.log(`  ${inv.invoice_number} ref=${inv.reference_number} ${inv.customer_name} ${inv.status} ${inv.date}`);
  }
}

void main();
