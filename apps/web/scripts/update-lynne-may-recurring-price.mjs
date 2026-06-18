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
/** Authoritative per-visit rate (2 cleaners). */
const VISIT_PRICE_ZAR = 609.62;

function buildPriceSnapshot() {
  return {
    v: 1,
    service_type: "standard",
    base_price: VISIT_PRICE_ZAR,
    extras: [],
    total_price: VISIT_PRICE_ZAR,
    version: "admin_recurring_repricing_may",
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
  const { data: bookings, error: bkErr } = await admin
    .from("bookings")
    .select("id, date, total_paid_zar, amount_paid_cents, booking_snapshot, monthly_invoice_id")
    .eq("recurring_id", PLAN_ID)
    .eq("is_recurring_generated", true)
    .gte("date", "2026-05-01")
    .lte("date", "2026-05-31")
    .order("date");
  if (bkErr) throw new Error(bkErr.message);
  if (!bookings?.length) throw new Error("No May recurring bookings found");

  let updated = 0;
  for (const b of bookings) {
    const booking_snapshot = patchBookingSnapshot(b.booking_snapshot);
    const { error } = await admin
      .from("bookings")
      .update({
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
    console.log(
      `Updated ${b.date} snapshots → R ${VISIT_PRICE_ZAR} (paid R ${(b.amount_paid_cents ?? 0) / 100}; total_paid_zar ${b.total_paid_zar} locked on paid invoice)`,
    );
    updated++;
  }

  console.log(`\nUpdated ${updated} May booking snapshot(s) to R ${VISIT_PRICE_ZAR}/visit.`);
  console.log("May invoice already paid — no June adjustment needed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
