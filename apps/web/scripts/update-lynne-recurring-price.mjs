import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(__dir, "../.env.local"), "utf8");
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PLAN_ID = "a053ea81-185e-4434-9851-9619ee79f1a2";
const INVOICE_ID = "8ca2273e-e523-4fb0-b71e-d9a73902f893";
/** Authoritative per-visit rate (2 cleaners). */
const VISIT_PRICE_ZAR = 609.62;
/** bookings.total_paid_zar is integer — nearest whole ZAR for invoice line cents. */
const VISIT_TOTAL_PAID_ZAR = Math.round(VISIT_PRICE_ZAR);

function buildPriceSnapshot() {
  return {
    v: 1,
    service_type: "standard",
    base_price: VISIT_PRICE_ZAR,
    extras: [],
    total_price: VISIT_PRICE_ZAR,
    version: "admin_recurring_repricing",
    repriced_at: new Date().toISOString(),
    repriced_by: "ops_script",
  };
}

function patchBookingSnapshot(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const snap = structuredClone(raw);
  if (snap.locked && typeof snap.locked === "object") {
    snap.locked.finalPrice = VISIT_PRICE_ZAR;
    snap.locked.price = VISIT_PRICE_ZAR;
  }
  snap.total_zar = VISIT_PRICE_ZAR;
  return snap;
}

async function main() {
  const { data: plan, error: planErr } = await admin
    .from("recurring_bookings")
    .select("booking_snapshot_template, status")
    .eq("id", PLAN_ID)
    .single();
  if (planErr || !plan) throw new Error(planErr?.message ?? "Plan not found");

  const template = patchBookingSnapshot(plan.booking_snapshot_template);
  const { error: planUpdateErr } = await admin
    .from("recurring_bookings")
    .update({ price: VISIT_PRICE_ZAR, booking_snapshot_template: template })
    .eq("id", PLAN_ID);
  if (planUpdateErr) throw new Error(planUpdateErr.message);

  const { data: bookings, error: bkErr } = await admin
    .from("bookings")
    .select("id, date, status, booking_snapshot, cleaner_line_earnings_finalized_at, monthly_invoice_id")
    .eq("recurring_id", PLAN_ID)
    .eq("is_recurring_generated", true)
    .gte("date", "2026-06-01")
    .order("date");
  if (bkErr) throw new Error(bkErr.message);

  let updated = 0;
  for (const b of bookings ?? []) {
    if (b.cleaner_line_earnings_finalized_at) {
      console.log(`Skip finalized ${b.date}`);
      continue;
    }

    const booking_snapshot = patchBookingSnapshot(b.booking_snapshot);
    const { error } = await admin
      .from("bookings")
      .update({
        total_paid_zar: VISIT_TOTAL_PAID_ZAR,
        price_snapshot: buildPriceSnapshot(),
        booking_snapshot,
        cleaner_count: 2,
        cleaner_mode: "individual_cleaners",
      })
      .eq("id", b.id);

    if (error) {
      console.error(`Failed ${b.date}:`, error.message);
      continue;
    }
    console.log(`Updated ${b.date} → R ${VISIT_PRICE_ZAR} (total_paid_zar ${VISIT_TOTAL_PAID_ZAR})`);
    updated++;
  }

  const { error: recomputeErr } = await admin.rpc("recompute_monthly_invoice_totals", {
    p_invoice_id: INVOICE_ID,
  });
  if (recomputeErr) console.error("Invoice recompute:", recomputeErr.message);

  const { data: inv } = await admin
    .from("monthly_invoices")
    .select("total_bookings, total_amount_cents, balance_cents, status")
    .eq("id", INVOICE_ID)
    .single();

  console.log(`\nPlan price set to ${VISIT_PRICE_ZAR}. Updated ${updated} June booking(s).`);
  console.log(
    "June invoice:",
    inv,
    `(expected ~${(bookings?.length ?? 0) * VISIT_TOTAL_PAID_ZAR * 100} cents at R${VISIT_TOTAL_PAID_ZAR}/visit integer lines)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
