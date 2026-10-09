/**
 * A02-03-02A — bounded historical team booking_line_items repair.
 *
 * Default is dry-run. Writes require BOTH:
 *   --apply
 *   A02_03_02_APPLY=YES
 *
 * This first bounded stage only permits the two audited production booking IDs.
 * Team cleaner payouts are NOT recomputed or mutated.
 */
import { createClient } from "@supabase/supabase-js";
import { buildHistoricalTeamFinancialLedger } from "../lib/booking/buildHistoricalTeamFinancialLedger";

const TARGET_IDS = new Set([
  "d860554e-c132-477b-bf15-557fb9c88a5e",
  "f6b2316e-2518-4f43-b6e8-b050c6d07483",
]);

const apply = process.argv.includes("--apply");
const fixtureCheck = process.argv.includes("--fixture-check");
const requestedIds = process.argv
  .filter((arg) => arg.startsWith("--booking-id="))
  .map((arg) => arg.slice("--booking-id=".length).trim().toLowerCase())
  .filter(Boolean);

function runFixtureCheck(): void {
  const fixtures = [
    {
      bookingId: "d860554e-c132-477b-bf15-557fb9c88a5e",
      totalPaidZar: 2420,
      amountPaidCents: 242000,
      bookingSnapshot: {
        pricingSummary: {
          lineItems: [
            { label: "Deep Cleaning (base)", amountZar: 1200 },
            { label: "2 bedrooms", amountZar: 300 },
            { label: "2 bathrooms", amountZar: 400 },
            { label: "3 extra rooms", amountZar: 360 },
            { label: "Property condition", amountZar: 100 },
            { label: "Service fee", amountZar: 60 },
          ],
          selected_extras: [],
        },
      },
    },
    {
      bookingId: "f6b2316e-2518-4f43-b6e8-b050c6d07483",
      totalPaidZar: 2730,
      amountPaidCents: 273000,
      bookingSnapshot: {
        pricingSummary: {
          lineItems: [
            { label: "Deep Cleaning (base)", amountZar: 1200 },
            { label: "1 bedroom", amountZar: 150 },
            { label: "3 bathrooms", amountZar: 600 },
            { label: "3 extra rooms", amountZar: 360 },
            { label: "Property condition", amountZar: 40 },
            { label: "Outside windows", amountZar: 350 },
            { label: "Service fee", amountZar: 30 },
          ],
          selected_extras: [{ name: "Outside windows", price: 350, extra_id: "outside-windows" }],
        },
      },
    },
  ] as const;

  for (const fixture of fixtures) {
    const built = buildHistoricalTeamFinancialLedger(fixture);
    if (!built.ok) throw new Error(`${fixture.bookingId}: ${built.error}`);
    if (built.sourceLineTotalCents !== built.declaredPayableCents) {
      throw new Error(`${fixture.bookingId}: fixture total mismatch`);
    }
    if (built.items.some((line) => line.earns_cleaner !== false)) {
      throw new Error(`${fixture.bookingId}: reconstructed team line may affect cleaner earnings`);
    }
  }
  console.log("A02-03-02A fixture check PASS");
}

async function main() {
  if (fixtureCheck) {
    runFixtureCheck();
    return;
  }

  const ids = requestedIds.length > 0 ? requestedIds : [...TARGET_IDS];
  for (const id of ids) {
    if (!TARGET_IDS.has(id)) throw new Error(`Booking ${id} is outside the bounded A02-03-02A allowlist.`);
  }

  if (apply && process.env.A02_03_02_APPLY !== "YES") {
    throw new Error("Apply blocked. Set A02_03_02_APPLY=YES and pass --apply.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase URL/service role configuration.");

  const admin = createClient(url, key, { auth: { persistSession: false } });

  for (const bookingId of ids) {
    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id, is_team_job, payment_status, billing_type, total_paid_zar, amount_paid_cents, booking_snapshot")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError || !booking) throw new Error(`${bookingId}: ${bookingError?.message ?? "booking not found"}`);

    if (booking.is_team_job !== true) throw new Error(`${bookingId}: team booking required`);
    if (!["success", "paid"].includes(String(booking.payment_status ?? "").trim().toLowerCase())) {
      throw new Error(`${bookingId}: paid booking required`);
    }
    if (String(booking.billing_type ?? "").trim().toLowerCase() !== "prepaid") {
      throw new Error(`${bookingId}: prepaid billing_type required for this bounded repair`);
    }

    const { count: existingLineCount, error: lineCountError } = await admin
      .from("booking_line_items")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId);
    if (lineCountError) throw new Error(`${bookingId}: ${lineCountError.message}`);
    if ((existingLineCount ?? 0) !== 0) throw new Error(`${bookingId}: existing booking_line_items block repair`);

    const { count: rosterCount, error: rosterError } = await admin
      .from("booking_cleaners")
      .select("cleaner_id", { count: "exact", head: true })
      .eq("booking_id", bookingId);
    if (rosterError) throw new Error(`${bookingId}: ${rosterError.message}`);
    if ((rosterCount ?? 0) < 1) throw new Error(`${bookingId}: team roster missing`);

    const { count: payoutCount, error: payoutError } = await admin
      .from("team_job_member_payouts")
      .select("cleaner_id", { count: "exact", head: true })
      .eq("booking_id", bookingId);
    if (payoutError) throw new Error(`${bookingId}: ${payoutError.message}`);
    if ((payoutCount ?? 0) < 1) throw new Error(`${bookingId}: team payout ledger missing`);

    const built = buildHistoricalTeamFinancialLedger({
      bookingId,
      bookingSnapshot: booking.booking_snapshot,
      totalPaidZar: typeof booking.total_paid_zar === "number" ? booking.total_paid_zar : Number(booking.total_paid_zar),
      amountPaidCents:
        typeof booking.amount_paid_cents === "number" ? booking.amount_paid_cents : Number(booking.amount_paid_cents),
    });
    if (!built.ok) throw new Error(`${bookingId}: ${built.error}`);

    console.log(
      JSON.stringify({
        mode: apply ? "apply" : "dry-run",
        bookingId,
        rosterCount,
        payoutCount,
        declaredPayableCents: built.declaredPayableCents,
        sourceLineTotalCents: built.sourceLineTotalCents,
        lineCount: built.items.length,
      }),
    );

    if (!apply) continue;

    // Re-check immediately before insert. Explicit allowlist + dual apply gate keep this
    // bounded; the second count prevents accidental reruns in normal operations.
    const { count: beforeInsertCount, error: beforeInsertError } = await admin
      .from("booking_line_items")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId);
    if (beforeInsertError) throw new Error(`${bookingId}: ${beforeInsertError.message}`);
    if ((beforeInsertCount ?? 0) !== 0) throw new Error(`${bookingId}: concurrent/existing line items block insert`);

    const rows = built.items.map((item) => ({ ...item, booking_id: bookingId }));
    const { error: insertError } = await admin.from("booking_line_items").insert(rows);
    if (insertError) throw new Error(`${bookingId}: ${insertError.message}`);

    const { data: persisted, error: verifyError } = await admin
      .from("booking_line_items")
      .select("total_price_cents, earns_cleaner, pricing_source")
      .eq("booking_id", bookingId);
    if (verifyError) throw new Error(`${bookingId}: ${verifyError.message}`);
    const persistedRows = persisted ?? [];
    const persistedTotal = persistedRows.reduce((sum, row) => sum + Number(row.total_price_cents ?? 0), 0);
    const safe =
      persistedRows.length === built.items.length &&
      persistedTotal === built.declaredPayableCents &&
      persistedRows.every(
        (row) => row.earns_cleaner === false && row.pricing_source === "historical_team_snapshot_v1",
      );
    if (!safe) {
      await admin
        .from("booking_line_items")
        .delete()
        .eq("booking_id", bookingId)
        .eq("pricing_source", "historical_team_snapshot_v1");
      throw new Error(`${bookingId}: verification failed; inserted repair rows rolled back by source marker`);
    }
  }
}

void main();
