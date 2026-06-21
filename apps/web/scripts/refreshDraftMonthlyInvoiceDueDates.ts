/**
 * Refresh draft monthly_invoices.due_date from last visit in billing month.
 *
 * Usage:
 *   npm run refresh:draft-invoice-due-dates
 *   npm run refresh:draft-invoice-due-dates -- --apply
 *   npm run refresh:draft-invoice-due-dates -- --apply --month=2026-06
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { refreshDraftMonthlyInvoiceDueDate } from "../lib/monthlyInvoice/refreshDraftMonthlyInvoiceDueDate";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apply = process.argv.includes("--apply");
const monthArg = process.argv.find((a) => a.startsWith("--month="));
const monthFilter = monthArg?.slice("--month=".length) || null;

async function main() {
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

  let query = admin.from("monthly_invoices").select("id, month, due_date, status").eq("status", "draft");
  if (monthFilter) query = query.eq("month", monthFilter);

  const { data, error } = await query.order("month", { ascending: true });
  if (error) {
    console.error("list drafts failed:", error.message);
    process.exit(1);
  }

  console.log(apply ? "Mode: APPLY" : "Mode: DRY-RUN");
  if (monthFilter) console.log(`Month filter: ${monthFilter}`);

  let scanned = 0;
  let changed = 0;
  let failed = 0;

  for (const raw of data ?? []) {
    scanned += 1;
    const row = raw as { id: string; month: string; due_date: string };
    if (!apply) {
      const { data: bookings } = await admin
        .from("bookings")
        .select("date")
        .eq("monthly_invoice_id", row.id)
        .neq("status", "cancelled");
      const dates = (bookings ?? []).map((b) => String((b as { date: string }).date));
      const inMonth = dates.filter((d) => d.startsWith(row.month)).sort();
      const lastVisit = inMonth.at(-1) ?? "(no visits)";
      console.log(
        `[dry-run] ${row.id.slice(0, 8)} ${row.month} due ${String(row.due_date).slice(0, 10)} → ${lastVisit}`,
      );
      continue;
    }

    const res = await refreshDraftMonthlyInvoiceDueDate(admin, row.id);
    if (!res.ok) {
      failed += 1;
      console.error(`${row.id}: ${res.error}`);
      continue;
    }
    if (res.changed) {
      changed += 1;
      console.log(`${row.id.slice(0, 8)} ${row.month}: due_date → ${res.dueDateYmd}`);
    }
  }

  console.log({ scanned, changed, failed });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
