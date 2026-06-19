/**
 * Compare /office/recurring "Est. monthly revenue" vs /office/invoices "Outstanding".
 * Run: node apps/web/scripts/compare-recurring-revenue-vs-outstanding.mjs
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

function balanceCents(inv) {
  const total = Math.round(Number(inv.total_amount_cents ?? 0));
  const paid = Math.round(Number(inv.amount_paid_cents ?? 0));
  const balRaw = inv.balance_cents;
  return typeof balRaw === "number" && Number.isFinite(balRaw) ? Math.round(balRaw) : Math.max(0, total - paid);
}

async function main() {
  const { data: plans } = await admin
    .from("recurring_bookings")
    .select("id, customer_id, frequency, days_of_week, price, status, customer:customer_id")
    .limit(300);

  const { data: profiles } = await admin.from("user_profiles").select("id, full_name, billing_type");
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const { data: invs } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, status, total_amount_cents, amount_paid_cents, balance_cents, is_closed")
    .order("month", { ascending: false })
    .limit(500);

  const activePlans = (plans ?? []).filter((p) => String(p.status).toLowerCase() === "active");
  const estRevenue = activePlans.reduce((s, p) => s + estimateMonthlyRevenue(p), 0);

  const allInvoices = invs ?? [];
  const outstandingAll = allInvoices.reduce((s, inv) => s + Math.max(0, balanceCents(inv)), 0);

  const byStatus = {};
  for (const inv of allInvoices) {
    const st = String(inv.status ?? "draft").toLowerCase();
    byStatus[st] = (byStatus[st] ?? 0) + Math.max(0, balanceCents(inv));
  }

  const draftOutstanding = allInvoices
    .filter((i) => String(i.status).toLowerCase() === "draft")
    .reduce((s, inv) => s + Math.max(0, balanceCents(inv)), 0);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const currentYm = today.slice(0, 7);

  const currentMonthDraftTotal = allInvoices
    .filter((i) => i.month === currentYm && String(i.status).toLowerCase() === "draft")
    .reduce((s, inv) => s + Math.round(Number(inv.total_amount_cents ?? 0)), 0);

  const currentMonthDraftBalance = allInvoices
    .filter((i) => i.month === currentYm && String(i.status).toLowerCase() === "draft")
    .reduce((s, inv) => s + Math.max(0, balanceCents(inv)), 0);

  // Active plan customers: sum their invoice outstanding
  const activeCustomerIds = new Set(activePlans.map((p) => p.customer_id));
  const outstandingActiveCustomers = allInvoices
    .filter((i) => activeCustomerIds.has(i.customer_id))
    .reduce((s, inv) => s + Math.max(0, balanceCents(inv)), 0);

  const outstandingActiveCustomersDraftOnly = allInvoices
    .filter(
      (i) =>
        activeCustomerIds.has(i.customer_id) && String(i.status).toLowerCase() === "draft",
    )
    .reduce((s, inv) => s + Math.max(0, balanceCents(inv)), 0);

  console.log("=== Recurring page metric ===");
  console.log(`Active plans: ${activePlans.length}`);
  console.log(`Est. monthly revenue (sum of formula): R ${estRevenue.toLocaleString("en-ZA")}`);
  console.log("  Formula: price × (52/12 × weekdays) for weekly active plans\n");

  console.log("=== Invoices page metric ===");
  console.log(`Total invoices: ${allInvoices.length}`);
  console.log(`Outstanding (sum of all balances): R ${(outstandingAll / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`);
  console.log("  Includes every invoice with balance > 0 (all months, all statuses)\n");

  console.log("=== Outstanding by invoice status ===");
  for (const [st, cents] of Object.entries(byStatus).sort()) {
    console.log(`  ${st}: R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`);
  }

  console.log("\n=== More meaningful comparisons ===");
  console.log(`Draft invoices outstanding only: R ${(draftOutstanding / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`);
  console.log(
    `Current month (${currentYm}) draft invoice totals: R ${(currentMonthDraftTotal / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`,
  );
  console.log(
    `Current month (${currentYm}) draft balances: R ${(currentMonthDraftBalance / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`,
  );
  console.log(
    `Outstanding for active-plan customers (all invoices): R ${(outstandingActiveCustomers / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`,
  );
  console.log(
    `Draft outstanding for active-plan customers: R ${(outstandingActiveCustomersDraftOnly / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`,
  );

  const diff = estRevenue - outstandingAll / 100;
  console.log(`\n=== Direct diff (est revenue − all outstanding) ===`);
  console.log(`R ${diff.toLocaleString("en-ZA")} (${diff >= 0 ? "est higher" : "outstanding higher"})`);

  console.log("\n=== Per active plan (est vs customer draft outstanding) ===");
  for (const p of activePlans.sort((a, b) => estimateMonthlyRevenue(b) - estimateMonthlyRevenue(a))) {
    const est = estimateMonthlyRevenue(p);
    const custOutstanding = allInvoices
      .filter((i) => i.customer_id === p.customer_id && String(i.status).toLowerCase() === "draft")
      .reduce((s, inv) => s + Math.max(0, balanceCents(inv)), 0);
    const name = (nameById.get(p.customer_id) ?? p.customer_id.slice(0, 8)).trim();
    console.log(
      `  ${name.padEnd(18)} est R${String(est).padStart(5)} | draft owed R${(custOutstanding / 100).toFixed(0).padStart(5)} | ${p.frequency} ×${(p.days_of_week ?? []).length} @ R${p.price}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
