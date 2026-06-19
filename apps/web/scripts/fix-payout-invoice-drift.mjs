/**
 * Repair stuck paid-invoice child settlements + recompute Lankyem June draft.
 * Run: node apps/web/scripts/fix-payout-invoice-drift.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dir, "../.env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
);

function positiveCents(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

function allocateMonthlyChildPaymentCents(row) {
  const lineCents = Math.max(0, Math.round(Number(row.total_paid_zar ?? 0) * 100));
  if (Number.isFinite(lineCents) && lineCents > 0) return lineCents;
  const existing = Number(row.amount_paid_cents ?? 0);
  if (Number.isFinite(existing) && existing > 0) return Math.max(0, Math.round(existing));
  return 0;
}

function frozenForSettlement(row) {
  const d = positiveCents(row.display_earnings_cents);
  if (d != null) return d;
  const c = positiveCents(row.cleaner_payout_cents);
  if (c != null) return c;
  return null;
}

function visitPriceCents(b) {
  const cents = b.amount_paid_cents ?? b.total_paid_cents;
  if (typeof cents === "number" && Number.isFinite(cents) && cents > 0) return Math.round(cents);
  const zarVal = b.total_paid_zar;
  if (typeof zarVal === "number" && Number.isFinite(zarVal) && zarVal > 0) return Math.round(zarVal * 100);
  return 0;
}

async function settleBooking(booking) {
  const frozen = frozenForSettlement(booking);
  if (frozen == null) return { ok: false, error: "missing_earnings_basis" };
  const amountPaidCents = allocateMonthlyChildPaymentCents(booking);
  const paymentCompletedAt =
    (typeof booking.payment_completed_at === "string" && booking.payment_completed_at.trim()) ||
    (typeof booking.paid_at === "string" && booking.paid_at.trim()) ||
    (typeof booking.completed_at === "string" && booking.completed_at.trim()) ||
    new Date().toISOString();

  const { error } = await admin
    .from("bookings")
    .update({
      payment_status: "success",
      amount_paid_cents: amountPaidCents,
      payout_status: "eligible",
      payout_frozen_cents: frozen,
      payment_completed_at: paymentCompletedAt,
    })
    .eq("id", booking.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, frozen, amountPaidCents };
}

async function main() {
  console.log("=== 1. Repair stuck paid-invoice child settlements ===\n");

  const { data: paidInvoices } = await admin.from("monthly_invoices").select("id").eq("status", "paid");
  const paidIds = (paidInvoices ?? []).map((i) => i.id);

  const { data: stuck, error: stuckErr } = await admin
    .from("bookings")
    .select(
      "id, date, customer_name, status, payment_status, payout_status, payout_frozen_cents, total_paid_zar, amount_paid_cents, display_earnings_cents, cleaner_payout_cents, completed_at, paid_at, payment_completed_at, is_team_job, team_id, monthly_invoice_id",
    )
    .in("monthly_invoice_id", paidIds)
    .eq("status", "completed")
    .eq("payout_status", "pending");

  if (stuckErr) {
    console.error(stuckErr.message);
    process.exit(1);
  }

  let repaired = 0;
  const failures = [];
  for (const b of stuck ?? []) {
    if (b.is_team_job || b.team_id) {
      failures.push({ id: b.id, error: "skipped_team_job" });
      continue;
    }
    const res = await settleBooking(b);
    if (res.ok) {
      repaired++;
      console.log(`  OK ${b.customer_name} ${b.date} frozen=R ${(res.frozen / 100).toFixed(2)}`);
    } else {
      failures.push({ id: b.id, error: res.error });
      console.log(`  FAIL ${b.customer_name} ${b.date}: ${res.error}`);
    }
  }
  console.log(`\nRepaired ${repaired}, failed ${failures.length}`);

  console.log("\n=== 2. Recompute Lankyem June 2026 draft invoice ===\n");

  const { data: profiles } = await admin.from("user_profiles").select("id, full_name").ilike("full_name", "%Lankyem%");
  const lankyem = (profiles ?? []).find((p) => String(p.full_name ?? "").toLowerCase().includes("lankyem"));
  if (!lankyem?.id) {
    console.error("Lankyem profile not found");
    process.exit(1);
  }

  const { data: juneInv, error: invErr } = await admin
    .from("monthly_invoices")
    .select("id, total_amount_cents, balance_cents")
    .eq("customer_id", lankyem.id)
    .eq("month", "2026-06")
    .eq("status", "draft")
    .maybeSingle();

  if (invErr || !juneInv?.id) {
    console.error("June draft not found:", invErr?.message);
    process.exit(1);
  }

  const beforeTotal = Math.round(Number(juneInv.total_amount_cents ?? 0));
  const { error: rpcErr } = await admin.rpc("recompute_monthly_invoice_totals", { p_invoice_id: juneInv.id });
  if (rpcErr) {
    console.error("Recompute failed:", rpcErr.message);
    process.exit(1);
  }

  const { data: afterInv } = await admin
    .from("monthly_invoices")
    .select("total_amount_cents, balance_cents")
    .eq("id", juneInv.id)
    .maybeSingle();

  const { data: visits } = await admin
    .from("bookings")
    .select("id, date, status, amount_paid_cents, total_paid_zar, total_paid_cents")
    .eq("monthly_invoice_id", juneInv.id)
    .neq("status", "cancelled");

  const visitSum = (visits ?? []).reduce((s, b) => s + visitPriceCents(b), 0);
  const afterTotal = Math.round(Number(afterInv?.total_amount_cents ?? 0));

  console.log(`Invoice ${juneInv.id.slice(0, 8)}…`);
  console.log(`  Before: R ${(beforeTotal / 100).toFixed(2)}`);
  console.log(`  After:  R ${(afterTotal / 100).toFixed(2)} (balance R ${(Number(afterInv?.balance_cents ?? 0) / 100).toFixed(2)})`);
  console.log(`  Visits: R ${(visitSum / 100).toFixed(2)} (${visits?.length ?? 0} bookings)`);

  console.log("\n=== 3. Updated totals ===\n");

  const { data: eligible } = await admin
    .from("bookings")
    .select("payout_frozen_cents, display_earnings_cents")
    .eq("payout_status", "eligible");

  let eligibleCents = 0;
  for (const b of eligible ?? []) {
    eligibleCents += positiveCents(b.payout_frozen_cents) ?? positiveCents(b.display_earnings_cents) ?? 0;
  }
  console.log(`Eligible unbatched: ${eligible?.length ?? 0} bookings, R ${(eligibleCents / 100).toFixed(2)}`);

  const { data: juneDrafts } = await admin
    .from("monthly_invoices")
    .select("total_amount_cents")
    .eq("month", "2026-06")
    .eq("status", "draft");
  const juneDraftTotal = (juneDrafts ?? []).reduce((s, i) => s + Math.round(Number(i.total_amount_cents ?? 0)), 0);
  console.log(`June draft invoices total: R ${(juneDraftTotal / 100).toFixed(2)} (${juneDrafts?.length ?? 0} invoices)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
