/**
 * AUDIT-02A07 — bounded historical Booking V2 line-item repair.
 *
 * Default mode is read-only dry-run. Apply requires:
 *   --apply
 *   exactly one --booking-id=<uuid>
 *   AUDIT_02A07_APPLY=YES
 *
 * The database RPC independently enforces the same 26-ID allowlist and
 * earnings/payout safety rules.
 */
import { createClient } from "@supabase/supabase-js";
import { buildAudit02A07BookingLineItems } from "../lib/booking/buildAudit02A07BookingLineItems";

const TARGET_IDS = new Set([
  "e8f35a89-8e20-4990-8c9b-7259f9215761",
  "66743961-d167-4bbb-bb07-c22e2bdc61f9",
  "a2b59a39-f929-4f0b-bc3f-c4b1340dbac3",
  "08636b07-a56b-4ad1-987d-ef22306bb72b",
  "1c1efc82-294d-4fca-9e6a-71a6713c527f",
  "100b9bd3-2676-4dd7-91ea-eeea025b2f2e",
  "b9baf110-d5bf-49f9-91f3-46f6a5aa9b68",
  "d44cfffe-6ea7-4e91-81fe-e2869af7f6a0",
  "fb696921-add6-4b31-8b20-4a44ce72dc31",
  "14b6c042-a761-4b14-b96f-2c04b5d70c50",
  "8989c390-d855-447a-a249-fceaac4df75a",
  "2960ebdf-ad04-4210-acc8-28f1c8df1d8e",
  "1e2f0c30-5cba-4e0b-8fec-f744c6cb471d",
  "a6a40c58-f95d-456b-8e59-31d113d4a581",
  "83d906cc-e757-4a41-8afa-881b43989ac2",
  "073947f2-d37d-4852-9a2d-5bdd138d2440",
  "da35fe22-6c69-42ad-9e39-8c8b46f11a7c",
  "089ae00e-f419-4407-a795-4b8c290103f6",
  "229f2f07-0422-44f7-b1bc-c3341e66f770",
  "b69a0b5b-a2a9-4160-9782-3a1ff5ca4702",
  "af54d55d-31e9-4729-bcb0-b1861b6181dd",
  "32af82dd-daaf-4eb8-9cfc-f17fb46875da",
  "6b439d7e-245c-419d-888b-cd58a03836b4",
  "8655ed37-2b2b-4560-8415-dd5b091a9adc",
  "e6a876b3-81fa-4da4-95d5-9f9a467ae970",
  "fc75a013-5858-43e8-b499-3aa2ab047bcf",
]);

const MISMATCH_ID = "e6a876b3-81fa-4da4-95d5-9f9a467ae970";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase URL/service role configuration.");

const apply = process.argv.includes("--apply");
const requested = process.argv
  .filter((arg) => arg.startsWith("--booking-id="))
  .map((arg) => arg.slice("--booking-id=".length).trim().toLowerCase());
const ids = requested.length ? [...new Set(requested)] : [...TARGET_IDS];

if (apply && requested.length !== 1) {
  throw new Error("AUDIT-02A07 apply requires exactly one --booking-id=<uuid>.");
}
if (apply && process.env.AUDIT_02A07_APPLY !== "YES") {
  throw new Error("AUDIT-02A07 apply blocked. Set AUDIT_02A07_APPLY=YES.");
}
for (const id of ids) {
  if (!TARGET_IDS.has(id)) throw new Error(`Booking ${id} is outside the AUDIT-02A07 allowlist.`);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

function bookingFinancialState(booking: Record<string, unknown>) {
  return JSON.stringify({
    cleaner_earnings_total_cents: booking.cleaner_earnings_total_cents ?? null,
    display_earnings_cents: booking.display_earnings_cents ?? null,
    payout_earnings_cents: booking.payout_earnings_cents ?? null,
    internal_earnings_cents: booking.internal_earnings_cents ?? null,
    cleaner_line_earnings_finalized_at: booking.cleaner_line_earnings_finalized_at ?? null,
    payout_status: booking.payout_status ?? null,
    payout_paid_at: booking.payout_paid_at ?? null,
    payout_frozen_cents: booking.payout_frozen_cents ?? null,
  });
}

async function verifyApply(
  bookingId: string,
  beforeFinancialState: string,
  declaredTotalCents: number,
): Promise<void> {
  const { data: bookingAfter, error: bookingAfterError } = await admin
    .from("bookings")
    .select("cleaner_earnings_total_cents, display_earnings_cents, payout_earnings_cents, internal_earnings_cents, cleaner_line_earnings_finalized_at, payout_status, payout_paid_at, payout_frozen_cents")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingAfterError || !bookingAfter) {
    throw new Error(`${bookingId}: post-apply booking read failed`);
  }
  if (bookingFinancialState(bookingAfter as Record<string, unknown>) !== beforeFinancialState) {
    throw new Error(`${bookingId}: earnings/payout state changed during repair`);
  }

  const { data: linesAfter, error: linesAfterError } = await admin
    .from("booking_line_items")
    .select("total_price_cents")
    .eq("booking_id", bookingId);
  if (linesAfterError) throw new Error(`${bookingId}: post-apply line read failed: ${linesAfterError.message}`);
  const total = (linesAfter ?? []).reduce((sum, row) => sum + Number(row.total_price_cents ?? 0), 0);
  if (total !== declaredTotalCents) {
    throw new Error(`${bookingId}: post-apply line total ${total} != declared ${declaredTotalCents}`);
  }
}

for (const bookingId of ids) {
  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, status, total_price, booking_snapshot, pricing_summary, price_breakdown, is_team_job, cleaner_earnings_total_cents, display_earnings_cents, payout_earnings_cents, internal_earnings_cents, cleaner_line_earnings_finalized_at, payout_status, payout_paid_at, payout_frozen_cents")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !booking) throw new Error(`${bookingId}: ${error?.message ?? "not found"}`);

  const beforeFinancialState = bookingFinancialState(booking as Record<string, unknown>);
  const { data: existing, error: lineError } = await admin
    .from("booking_line_items")
    .select("id, item_type, name, total_price_cents, pricing_source, earns_cleaner, cleaner_earnings_cents")
    .eq("booking_id", bookingId);
  if (lineError) throw new Error(`${bookingId}: ${lineError.message}`);
  const existingRows = existing ?? [];
  const existingTotalCents = existingRows.reduce((sum, row) => sum + Number(row.total_price_cents ?? 0), 0);
  const declaredTotalCents = Math.round(Number(booking.total_price ?? 0) * 100);

  if (bookingId === MISMATCH_ID) {
    const existingLine = existingRows[0];
    const alreadyRepaired =
      existingRows.length === 2 &&
      existingTotalCents === 48600 &&
      existingRows.some((row) =>
        row.item_type === "base" &&
        row.name === "Recurring service" &&
        row.pricing_source === "exact_source_lines_v1" &&
        row.earns_cleaner === true &&
        Number(row.cleaner_earnings_cents ?? 0) === 30000
      ) &&
      existingRows.some((row) =>
        row.item_type === "adjustment" &&
        Number(row.total_price_cents ?? 0) === 1900 &&
        row.pricing_source === "audit_02a07_historical_reconciliation_v1" &&
        row.earns_cleaner === false
      );

    if (!alreadyRepaired) {
      if (
        existingRows.length !== 1 ||
        existingTotalCents !== 46700 ||
        existingLine?.item_type !== "base" ||
        existingLine?.name !== "Recurring service" ||
        existingLine?.pricing_source !== "exact_source_lines_v1" ||
        existingLine?.earns_cleaner !== true ||
        Number(existingLine?.cleaner_earnings_cents ?? 0) !== 30000 ||
        Number(booking.cleaner_earnings_total_cents ?? 0) !== 30000 ||
        !booking.cleaner_line_earnings_finalized_at
      ) {
        throw new Error(`${bookingId}: audited mismatch earnings before-state changed`);
      }
    }

    const reconciliationCents = declaredTotalCents - (alreadyRepaired ? 46700 : existingTotalCents);
    if (reconciliationCents !== 1900) {
      throw new Error(`${bookingId}: audited mismatch delta changed`);
    }

    console.log(JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      bookingId,
      evidenceKind: "preserve_finalized_earning_line_plus_adjustment",
      beforeCount: existingRows.length,
      beforeTotalCents: existingTotalCents,
      beforeCleanerEarningsCents: 30000,
      plannedInsertCount: alreadyRepaired ? 0 : 1,
      plannedInsertTotalCents: alreadyRepaired ? 0 : 1900,
      plannedInsertEarnsCleaner: false,
      afterCount: 2,
      afterTotalCents: declaredTotalCents,
      declaredTotalCents,
      deltaAfterCents: 0,
      cleanerEarningsDeltaCents: 0,
      historicalSafetyClass: "finalized_solo_mismatch",
    }));

    if (apply) {
      const { data: applied, error: applyError } = await admin.rpc("apply_audit_02a07_historical_line_items", {
        p_booking_id: bookingId,
        p_items: [{
          item_type: "adjustment",
          slug: null,
          name: "Historical total reconciliation",
          quantity: 1,
          unit_price_cents: 1900,
          total_price_cents: 1900,
          metadata: { audit: "AUDIT-02A07", source: "finalized_r19_mismatch" },
          earns_cleaner: false,
        }],
      });
      if (applyError) throw new Error(`${bookingId}: ${applyError.message}`);
      const result = applied as { ok?: unknown; error?: unknown } | null;
      if (result?.ok !== true) throw new Error(`${bookingId}: ${String(result?.error ?? "apply_failed")}`);
      await verifyApply(bookingId, beforeFinancialState, declaredTotalCents);
      console.log(JSON.stringify({ mode: "apply", bookingId, result: applied, reconciliation: "PASS" }));
    }
    continue;
  }

  const alreadyRepaired =
    existingRows.length > 0 &&
    existingTotalCents === declaredTotalCents &&
    existingRows.every((row) => row.pricing_source === "audit_02a07_snapshot_v1" && row.earns_cleaner === false);

  if (!alreadyRepaired && existingRows.length !== 0) {
    throw new Error(`${bookingId}: expected zero existing line items`);
  }

  if (booking.is_team_job !== true) {
    const status = String(booking.status ?? "").trim().toLowerCase();
    const hasEarningsState =
      booking.cleaner_line_earnings_finalized_at != null ||
      Number(booking.cleaner_earnings_total_cents ?? 0) !== 0 ||
      Number(booking.display_earnings_cents ?? 0) !== 0 ||
      Number(booking.payout_earnings_cents ?? 0) !== 0 ||
      Number(booking.internal_earnings_cents ?? 0) !== 0 ||
      String(booking.payout_status ?? "").trim().toLowerCase() !== "pending" ||
      booking.payout_paid_at != null ||
      booking.payout_frozen_cents != null;
    if (status !== "cancelled" || hasEarningsState) {
      throw new Error(
        `${bookingId}: solo historical repair requires cancelled booking with no earnings/payout history`,
      );
    }
  }

  const built = buildAudit02A07BookingLineItems({
    bookingId,
    declaredTotalCents,
    bookingSnapshot: booking.booking_snapshot,
    pricingSummary: booking.pricing_summary,
    priceBreakdown: booking.price_breakdown,
    isTeamJob: booking.is_team_job,
    suppressCleanerEarnings: true,
  });
  if (!built.ok) throw new Error(built.error);
  if (built.items.some((item) => item.earns_cleaner !== false)) {
    throw new Error(`${bookingId}: historical repair line may affect cleaner earnings`);
  }
  const afterTotalCents = built.items.reduce((sum, item) => sum + item.total_price_cents, 0);

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    bookingId,
    evidenceKind: built.evidenceKind,
    beforeCount: existingRows.length,
    beforeTotalCents: existingTotalCents,
    plannedInsertCount: alreadyRepaired ? 0 : built.items.length,
    plannedInsertTotalCents: alreadyRepaired ? 0 : afterTotalCents,
    plannedInsertEarnsCleaner: false,
    afterCount: built.items.length,
    afterTotalCents,
    declaredTotalCents,
    deltaAfterCents: afterTotalCents - declaredTotalCents,
    cleanerEarningsDeltaCents: 0,
    historicalSafetyClass:
      booking.is_team_job === true
        ? "team_existing_payout_history_preserved"
        : "cancelled_solo_no_earnings_history",
  }));

  if (apply) {
    const { data: applied, error: applyError } = await admin.rpc("apply_audit_02a07_historical_line_items", {
      p_booking_id: bookingId,
      p_items: built.items.map((item) => ({
        item_type: item.item_type,
        slug: item.slug ?? null,
        name: item.name,
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
        total_price_cents: item.total_price_cents,
        metadata: item.metadata ?? {},
        earns_cleaner: false,
      })),
    });
    if (applyError) throw new Error(`${bookingId}: ${applyError.message}`);
    const result = applied as { ok?: unknown; error?: unknown } | null;
    if (result?.ok !== true) throw new Error(`${bookingId}: ${String(result?.error ?? "apply_failed")}`);
    await verifyApply(bookingId, beforeFinancialState, declaredTotalCents);
    console.log(JSON.stringify({ mode: "apply", bookingId, result: applied, reconciliation: "PASS" }));
  }
}
