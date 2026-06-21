/**
 * Backfill Zoho Books invoices for finalized monthly_invoices that were sent/paid
 * before Zoho sync ran (idempotent — skips rows that already have `zoho_invoice_id`).
 *
 * Does NOT send customer emails or touch Paystack.
 *
 * From `apps/web`:
 *   npm run backfill:zoho-monthly-invoices                 # dry-run
 *   npm run backfill:zoho-monthly-invoices -- --apply      # create + link in Zoho
 *   npm run backfill:zoho-monthly-invoices -- --include-drafts --month=2026-06
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  createZohoInvoice,
  markZohoInvoicePaid,
  todayYmdJhb,
  updateZohoInvoice,
  zohoInvoiceExists,
} from "../lib/zoho/zohoBooksService";
import { resolveZohoCustomerContactForMonthlyInvoice } from "../lib/zoho/resolveZohoCustomerContact";
import { zohoDatesForMonthlyInvoice } from "../lib/monthlyInvoice/monthlyInvoiceBillingDates";
import { lastScheduledVisitYmd } from "../lib/monthlyInvoice/isMonthlyInvoiceReadyToFinalize";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

const apply = process.argv.includes("--apply");
const repairAllContacts = process.argv.includes("--repair-all-contacts");
const includeDrafts = process.argv.includes("--include-drafts");
const monthArg = process.argv.find((a) => a.startsWith("--month="));
const monthFilter = monthArg?.slice("--month=".length) ?? (includeDrafts ? todayYmdJhb().slice(0, 7) : null);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ZOHO_THROTTLE_MS = 400;

const PAYABLE_STATUSES = new Set(["sent", "paid", "partially_paid", "overdue"]);

type Row = {
  id: string;
  customer_id: string;
  month: string;
  due_date: string;
  status: string | null;
  total_amount_cents: number | null;
  amount_paid_cents: number | null;
  paystack_reference: string | null;
  sent_at: string | null;
  finalized_at: string | null;
  zoho_invoice_id: string | null;
};

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map((x) => Number(x));
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function invoiceDateForRow(row: Row): string {
  return zohoDatesForMonthlyInvoice(row.month).invoiceDate;
}

async function dueDateForRow(admin: SupabaseClient, row: Row): Promise<string> {
  const status = String(row.status ?? "").toLowerCase();
  if (status !== "draft") {
    const stored = row.due_date?.slice(0, 10);
    return zohoDatesForMonthlyInvoice(row.month, stored).dueDate;
  }

  const { data: bookings } = await admin
    .from("bookings")
    .select("date")
    .eq("monthly_invoice_id", row.id)
    .neq("status", "cancelled");
  const dates = (bookings ?? []).map((b) => String((b as { date: string }).date));
  const lastVisit = lastScheduledVisitYmd(row.month, dates);
  return zohoDatesForMonthlyInvoice(row.month, lastVisit).dueDate;
}

function isEligibleStatus(row: Row): boolean {
  const status = String(row.status ?? "").toLowerCase();
  if (PAYABLE_STATUSES.has(status)) return true;
  if (status === "draft" && includeDrafts) {
    if (!monthFilter || row.month === monthFilter) return true;
  }
  return false;
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
  if (includeDrafts) {
    console.log(`Including draft monthly invoices for month=${monthFilter ?? "any"}`);
  }

  if (repairAllContacts && apply) {
    const { data } = await admin.from("monthly_invoices").select("id").not("zoho_invoice_id", "is", null);
    for (const row of data ?? []) {
      await admin.from("monthly_invoices").update({ zoho_invoice_id: null }).eq("id", row.id);
    }
    console.log(`All monthly Zoho links cleared for contact repair: ${data?.length ?? 0}`);
  }

  const { data, error } = await admin
    .from("monthly_invoices")
    .select(
      "id, customer_id, month, due_date, status, total_amount_cents, amount_paid_cents, paystack_reference, sent_at, finalized_at, zoho_invoice_id",
    )
    .is("zoho_invoice_id", null)
    .order("month", { ascending: true });

  if (error) {
    console.error("list monthly_invoices failed:", error.message);
    process.exit(1);
  }

  let scanned = 0;
  let eligible = 0;
  let created = 0;
  let markedPaid = 0;
  let failed = 0;
  let skippedDraft = 0;

  for (const raw of data ?? []) {
    scanned += 1;
    const row = raw as Row;
    const status = String(row.status ?? "").toLowerCase();
    if (!isEligibleStatus(row)) {
      if (status === "draft") skippedDraft += 1;
      continue;
    }

    const totalCents = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0)));
    if (totalCents <= 0) {
      continue;
    }

    const contactRes = await resolveZohoCustomerContactForMonthlyInvoice(admin, {
      invoiceId: row.id,
      customerId: row.customer_id,
    });
    if (!contactRes.ok) {
      failed += 1;
      console.error(`monthly ${row.id}: contact resolution failed — ${contactRes.error}`);
      continue;
    }
    const contact = contactRes.contact;

    eligible += 1;
    const balanceZar = totalCents / 100;
    const paidCents = Math.max(0, Math.round(Number(row.amount_paid_cents ?? 0)));
    const paidZar = paidCents / 100;
    const invoiceDate = invoiceDateForRow(row);
    const monthLabel = formatMonthLabel(row.month);
    const isDraft = status === "draft";

    if (!apply) {
      const payNote = isDraft
        ? " (draft, unpaid)"
        : paidZar > 0
          ? ` + mark paid R${paidZar}`
          : status === "sent"
            ? " (unpaid)"
            : "";
      console.log(
        `[dry-run] would invoice ${row.id.slice(0, 8)} — ${monthLabel} — R${balanceZar} — ${contact.name} <${contact.email ?? "no-email"}>${payNote}`,
      );
      continue;
    }

    const createRes = await createZohoInvoice({
      referenceId: row.id,
      orderKind: "monthly",
      customerEmail: contact.email,
      customerName: contact.name,
      customerPhone: contact.phone,
      invoiceDate,
      dueDate: await dueDateForRow(admin, row),
      lineItems: [
        {
          name: `Shalean Cleaning — ${monthLabel}`,
          description: `Monthly cleaning invoice for ${monthLabel}`,
          rate: balanceZar,
          quantity: 1,
        },
      ],
      notes: isDraft
        ? `Draft Shalean monthly invoice ${row.id}.`
        : `Backfilled Shalean monthly invoice ${row.id}.`,
      currencyCode: "ZAR",
    });

    if (!createRes.ok) {
      failed += 1;
      console.error(`monthly ${row.id}: create failed — ${createRes.error}`);
      continue;
    }

    const { error: upErr } = await admin
      .from("monthly_invoices")
      .update({ zoho_invoice_id: createRes.zohoInvoiceId })
      .eq("id", row.id);
    if (upErr) {
      failed += 1;
      console.error(
        `monthly ${row.id}: Zoho ${createRes.zohoInvoiceId} created but DB update failed — ${upErr.message}`,
      );
      continue;
    }

    created += 1;
    console.log(
      `monthly ${row.id.slice(0, 8)}: linked Zoho ${createRes.invoiceNumber} (${createRes.zohoInvoiceId})${isDraft ? " [draft]" : ""}`,
    );

    if (!isDraft && paidZar > 0) {
      const payRes = await markZohoInvoicePaid({
        zohoInvoiceId: createRes.zohoInvoiceId,
        amountZar: paidZar,
        paymentDate: invoiceDate,
        reference: row.paystack_reference ?? row.id,
        customerEmail: contact.email,
        customerName: contact.name,
      });
      if (!payRes.ok) {
        failed += 1;
        console.error(`monthly ${row.id}: mark paid failed — ${payRes.error}`);
        continue;
      }
      markedPaid += 1;
    }

    await sleep(ZOHO_THROTTLE_MS);
  }

  // Repair rows that reference a Zoho id that no longer exists in Books.
  if (apply) {
    const { data: linked } = await admin
      .from("monthly_invoices")
      .select("id, zoho_invoice_id")
      .not("zoho_invoice_id", "is", null);

    let repaired = 0;
    for (const row of linked ?? []) {
      const zid = String((row as { zoho_invoice_id?: string }).zoho_invoice_id ?? "").trim();
      if (!zid) continue;
      const exists = await zohoInvoiceExists(zid);
      if (exists === "unknown" || exists) continue;
      await admin.from("monthly_invoices").update({ zoho_invoice_id: null }).eq("id", row.id);
      repaired += 1;
      console.log(`monthly ${row.id.slice(0, 8)}: cleared stale zoho_invoice_id ${zid}`);
    }
    if (repaired > 0) {
      console.log(`Repaired ${repaired} monthly invoice(s) with stale Zoho ids — re-run if needed.`);
    }

    if (includeDrafts && monthFilter) {
      const { data: linkedDrafts } = await admin
        .from("monthly_invoices")
        .select(
          "id, customer_id, month, status, total_amount_cents, zoho_invoice_id",
        )
        .eq("status", "draft")
        .eq("month", monthFilter)
        .not("zoho_invoice_id", "is", null);

      let datesUpdated = 0;
      for (const raw of linkedDrafts ?? []) {
        const row = raw as Row;
        const zid = String(row.zoho_invoice_id ?? "").trim();
        const exists = zid ? await zohoInvoiceExists(zid) : false;
        if (!zid || exists === false || exists === "unknown") continue;

        const totalCents = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0)));
        if (totalCents <= 0) continue;

        const contactRes = await resolveZohoCustomerContactForMonthlyInvoice(admin, {
          invoiceId: row.id,
          customerId: row.customer_id,
        });
        if (!contactRes.ok) continue;

        const balanceZar = totalCents / 100;
        const monthLabel = formatMonthLabel(row.month);
        const invoiceDate = invoiceDateForRow(row);
        const dueDate = await dueDateForRow(admin, row);

        const updateRes = await updateZohoInvoice({
          zohoInvoiceId: zid,
          customerEmail: contactRes.contact.email,
          customerName: contactRes.contact.name,
          customerPhone: contactRes.contact.phone,
          invoiceDate,
          dueDate,
          lineItems: [
            {
              name: `Shalean Cleaning — ${monthLabel}`,
              description: `Monthly cleaning invoice for ${monthLabel}`,
              rate: balanceZar,
              quantity: 1,
            },
          ],
          notes: `Draft Shalean monthly invoice ${row.id}.`,
          currencyCode: "ZAR",
        });
        if (!updateRes.ok) {
          console.error(`monthly ${row.id.slice(0, 8)}: date refresh failed — ${updateRes.error}`);
          continue;
        }
        datesUpdated += 1;
        console.log(`monthly ${row.id.slice(0, 8)}: refreshed Zoho dates → ${invoiceDate} due ${dueDate}`);
        await sleep(ZOHO_THROTTLE_MS);
      }
      if (datesUpdated > 0) {
        console.log(`Refreshed Zoho dates on ${datesUpdated} linked draft(s).`);
      }
    }
  }

  console.log(
    `Done. scanned=${scanned} eligible=${eligible} created=${created} markedPaid=${markedPaid} failed=${failed} skippedDraft=${skippedDraft}${apply ? "" : " (dry-run)"}`,
  );
}

void main();
