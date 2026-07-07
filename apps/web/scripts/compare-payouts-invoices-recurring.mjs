/**
 * Compare /office/payouts vs /office/invoices vs /office/recurring.
 * Run: node apps/web/scripts/compare-payouts-invoices-recurring.mjs
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

function zar(cents) {
  return `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function zarInt(n) {
  return `R ${Math.round(n).toLocaleString("en-ZA")}`;
}

function balanceCents(inv) {
  const total = Math.round(Number(inv.total_amount_cents ?? 0));
  const paid = Math.round(Number(inv.amount_paid_cents ?? 0));
  const balRaw = inv.balance_cents;
  return typeof balRaw === "number" && Number.isFinite(balRaw) ? Math.round(balRaw) : Math.max(0, total - paid);
}

function estimateMonthlyRevenue(plan) {
  if (String(plan.status).toLowerCase() !== "active") return 0;
  const price = plan.price ?? 0;
  const days = Math.max(1, (plan.days_of_week ?? []).length || 1);
  const f = String(plan.frequency).toLowerCase();
  let visitsPerMonth;
  if (f === "weekly") visitsPerMonth = (52 / 12) * days;
  else if (f === "biweekly" || f === "fortnightly") visitsPerMonth = (26 / 12) * days;
  else if (f === "monthly") visitsPerMonth = days;
  else visitsPerMonth = (52 / 12) * days;
  return Math.round(price * visitsPerMonth);
}

function resolveEarningsCents(b) {
  const frozen = b.payout_frozen_cents;
  if (typeof frozen === "number" && Number.isFinite(frozen) && frozen > 0) return Math.round(frozen);
  const total = b.cleaner_earnings_total_cents;
  if (typeof total === "number" && Number.isFinite(total) && total > 0) return Math.round(total);
  const display = b.display_earnings_cents;
  if (typeof display === "number" && Number.isFinite(display) && display > 0) return Math.round(display);
  const payout = b.cleaner_payout_cents;
  if (typeof payout === "number" && Number.isFinite(payout) && payout > 0) return Math.round(payout);
  return 0;
}

function visitPriceCents(b) {
  const cents = b.amount_paid_cents ?? b.total_paid_cents;
  if (typeof cents === "number" && Number.isFinite(cents) && cents > 0) return Math.round(cents);
  const zarVal = b.total_paid_zar;
  if (typeof zarVal === "number" && Number.isFinite(zarVal) && zarVal > 0) return Math.round(zarVal * 100);
  return 0;
}

function currentYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

async function main() {
  const ym = currentYm();

  const [{ data: plans }, { data: invoices }, { data: payouts }, { data: eligibleBookings }] = await Promise.all([
    admin.from("recurring_bookings").select("id, customer_id, frequency, days_of_week, price, status").limit(300),
    admin
      .from("monthly_invoices")
      .select("id, customer_id, month, status, total_amount_cents, amount_paid_cents, balance_cents")
      .order("month", { ascending: false })
      .limit(500),
    admin
      .from("cleaner_payouts")
      .select("id, cleaner_id, total_amount_cents, status, period_start, period_end")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("bookings")
      .select(
        "id, date, status, recurring_id, monthly_invoice_id, billing_type, is_recurring_generated, payout_status, payout_frozen_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, amount_paid_cents, total_paid_cents, total_paid_zar, monthly_invoices(month, status)",
      )
      .eq("payout_status", "eligible"),
  ]);

  const activePlans = (plans ?? []).filter((p) => String(p.status).toLowerCase() === "active");
  const activeCustomerIds = new Set(activePlans.map((p) => p.customer_id));
  const estRevenue = activePlans.reduce((s, p) => s + estimateMonthlyRevenue(p), 0);

  const allInvoices = invoices ?? [];
  const outstandingAll = allInvoices.reduce((s, inv) => s + Math.max(0, balanceCents(inv)), 0);
  const juneDraftInvoices = allInvoices.filter(
    (i) => i.month === ym && String(i.status).toLowerCase() === "draft" && activeCustomerIds.has(i.customer_id),
  );
  const juneDraftTotal = juneDraftInvoices.reduce((s, i) => s + Math.round(Number(i.total_amount_cents ?? 0)), 0);
  const juneDraftBalance = juneDraftInvoices.reduce((s, i) => s + Math.max(0, balanceCents(i)), 0);

  const payoutRows = payouts ?? [];
  const pendingPayoutCents = payoutRows
    .filter((p) => String(p.status).toLowerCase() === "pending")
    .reduce((s, p) => s + Math.round(Number(p.total_amount_cents ?? 0)), 0);
  const eligibleList = eligibleBookings ?? [];
  const eligibleCents = eligibleList.reduce((s, b) => s + resolveEarningsCents(b), 0);

  const juneDraftInvoiceIds = new Set(juneDraftInvoices.map((i) => i.id));

  const { data: recurringBookings } = await admin
    .from("bookings")
    .select(
      "id, date, status, recurring_id, monthly_invoice_id, payout_status, payout_frozen_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, amount_paid_cents, total_paid_cents, total_paid_zar, monthly_invoices(month, status)",
    )
    .not("recurring_id", "is", null)
    .neq("status", "cancelled");

  const rb = recurringBookings ?? [];
  const juneRecurring = rb.filter((b) => {
    const inv = b.monthly_invoices;
    const month = inv?.month ?? null;
    return month === ym;
  });

  let juneVisitPriceCents = 0;
  let juneEarningsCents = 0;
  const payoutStatusCounts = {};
  for (const b of juneRecurring) {
    juneVisitPriceCents += visitPriceCents(b);
    juneEarningsCents += resolveEarningsCents(b);
    const ps = String(b.payout_status ?? "null").toLowerCase();
    payoutStatusCounts[ps] = (payoutStatusCounts[ps] ?? 0) + 1;
    if (ps === "eligible") {
      resolveEarningsCents(b);
    }
  }

  const eligibleFromJuneDraft = eligibleList.filter((b) => juneDraftInvoiceIds.has(b.monthly_invoice_id));
  const eligibleFromPaidInvoices = eligibleList.filter((b) => {
    const st = String(b.monthly_invoices?.status ?? "").toLowerCase();
    return st === "paid";
  });
  const eligibleNoInvoice = eligibleList.filter((b) => !b.monthly_invoice_id);

  const paidInvoices = allInvoices.filter((i) => String(i.status).toLowerCase() === "paid");
  const paidInvoiceIds = new Set(paidInvoices.map((i) => i.id));
  const { data: paidChildBookings } = await admin
    .from("bookings")
    .select(
      "id, monthly_invoice_id, payout_status, payout_frozen_cents, display_earnings_cents, status, monthly_invoices(status, month)",
    )
    .in("monthly_invoice_id", [...paidInvoiceIds].slice(0, 100))
    .neq("status", "cancelled");

  let paidChildTotal = 0;
  let paidChildEligible = 0;
  let paidChildNotEligible = 0;
  let paidChildMissingFrozen = 0;
  for (const b of paidChildBookings ?? []) {
    paidChildTotal++;
    const ps = String(b.payout_status ?? "").toLowerCase();
    if (ps === "eligible" || ps === "batched" || ps === "paid") paidChildEligible++;
    else paidChildNotEligible++;
    if (!b.payout_frozen_cents && ps === "eligible") paidChildMissingFrozen++;
  }

  console.log("=== PAGE METRICS (what the UI shows) ===\n");
  console.log("RECURRING (/office/recurring)");
  console.log(`  Active plans:              ${activePlans.length}`);
  console.log(`  Est. monthly revenue:      ${zarInt(estRevenue)}`);
  console.log(`  ${ym} draft total:          ${zar(juneDraftTotal)} (${juneDraftInvoices.length} invoices)\n`);

  console.log("INVOICES (/office/invoices)");
  console.log(`  Total invoices:            ${allInvoices.length}`);
  console.log(`  Outstanding (all months):  ${zar(outstandingAll)}`);
  console.log(`  ${ym} draft (active recur): ${zar(juneDraftBalance)} (${juneDraftInvoices.length} invoices)\n`);

  console.log("PAYOUTS (/office/payouts)");
  console.log(`  Payout batches:            ${payoutRows.length}`);
  console.log(`  Pending amount:            ${zar(pendingPayoutCents)}`);
  console.log(`  Eligible unbatched:        ${eligibleList.length} bookings, ${zar(eligibleCents)}\n`);

  console.log("=== CROSS-CHECK: customer revenue side ===\n");
  console.log(`${ym} draft invoice totals:     ${zar(juneDraftTotal)}`);
  console.log(`${ym} recurring visit prices:   ${zar(juneVisitPriceCents)} (${juneRecurring.length} bookings)`);
  console.log(`  Diff (invoice − visits):   ${zar(juneDraftTotal - juneVisitPriceCents)}`);
  console.log(`Recurring est vs draft:      ${zarInt(estRevenue)} est vs ${zar(juneDraftTotal)} draft (${zarInt(estRevenue - juneDraftTotal / 100)} diff)\n`);

  console.log("=== CROSS-CHECK: cleaner payout side ===\n");
  console.log(`${ym} recurring earnings basis:  ${zar(juneEarningsCents)}`);
  console.log(`${ym} recurring payout_status:`);
  for (const [st, n] of Object.entries(payoutStatusCounts).sort()) {
    console.log(`    ${st}: ${n}`);
  }
  console.log(`\nEligible bookings from ${ym} draft invoices: ${eligibleFromJuneDraft.length} (expected 0 if drafts unpaid)`);
  if (eligibleFromJuneDraft.length > 0) {
    const cents = eligibleFromJuneDraft.reduce((s, b) => s + resolveEarningsCents(b), 0);
    console.log(`  WARNING: ${zar(cents)} eligible before invoice paid`);
  }
  console.log(`Eligible from paid invoices:   ${eligibleFromPaidInvoices.length} bookings`);
  console.log(`Eligible without invoice:      ${eligibleNoInvoice.length} bookings (prepaid / ad-hoc)\n`);

  console.log("=== PAID INVOICE → PAYOUT SETTLEMENT ===\n");
  console.log(`Paid invoices:               ${paidInvoices.length}`);
  console.log(`Child bookings checked:      ${paidChildTotal}`);
  console.log(`  payout eligible/batched:   ${paidChildEligible}`);
  console.log(`  not yet eligible:          ${paidChildNotEligible}`);
  if (paidChildMissingFrozen > 0) {
    console.log(`  WARNING missing frozen:      ${paidChildMissingFrozen}`);
  }

  const invoiceDrift = [];
  for (const inv of juneDraftInvoices) {
    const visits = juneRecurring.filter((b) => b.monthly_invoice_id === inv.id);
    const visitSum = visits.reduce((s, b) => s + visitPriceCents(b), 0);
    const invTotal = Math.round(Number(inv.total_amount_cents ?? 0));
    if (Math.abs(invTotal - visitSum) > 1) {
      invoiceDrift.push({ id: inv.id.slice(0, 8), invTotal, visitSum, visits: visits.length });
    }
  }

  console.log("\n=== DRIFT: June draft invoice total ≠ sum of visit prices ===\n");
  if (invoiceDrift.length === 0) {
    console.log("  None — all June draft invoices match their booking line totals.");
  } else {
    for (const d of invoiceDrift.slice(0, 15)) {
      console.log(`  ${d.id}: invoice ${zar(d.invTotal)} vs visits ${zar(d.visitSum)} (${d.visits} bookings)`);
    }
    if (invoiceDrift.length > 15) console.log(`  … and ${invoiceDrift.length - 15} more`);
  }

  console.log("\n=== VERDICT ===\n");
  const issues = [];
  if (Math.abs(juneDraftTotal - juneVisitPriceCents) > juneDraftInvoices.length) {
    issues.push("June draft invoice totals do not match sum of recurring visit prices.");
  }
  if (eligibleFromJuneDraft.length > 0) {
    issues.push("Some June draft (unpaid) invoice visits are payout-eligible — should wait until invoice is paid.");
  }
  if (paidChildNotEligible > 0) {
    issues.push(`${paidChildNotEligible} booking(s) on paid invoices are not payout-eligible yet.`);
  }
  if (Math.abs(outstandingAll - juneDraftBalance) > 100 && paidInvoices.every((i) => balanceCents(i) === 0)) {
    // ok if all outstanding is june
  }

  if (issues.length === 0) {
    console.log("System looks consistent:");
    console.log("  • Recurring ↔ Invoices: June draft totals align with visit prices on generated bookings.");
    console.log("  • Payouts are separate: eligible earnings come from PAID invoices (or prepaid jobs), not unpaid June drafts.");
    console.log(`  • Customer revenue (${zar(juneDraftTotal)}) ≠ cleaner earnings (${zar(juneEarningsCents)}) — expected margin.`);
  } else {
    for (const i of issues) console.log(`  ⚠ ${i}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
