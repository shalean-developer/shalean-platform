/**
 * A02-03-02A/B1/B2/B3 — bounded historical team booking_line_items repair.
 *
 * Default is dry-run. Writes require BOTH:
 *   --apply
 *   A02_03_02_APPLY=YES
 *
 * B1/B2/B3 extend the bounded allowlist one audited booking at a time.
 * Team cleaner payouts are NOT recomputed or mutated.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildHistoricalTeamFinancialLedger } from "../lib/booking/buildHistoricalTeamFinancialLedger";
import type { BookingLineItemInsert } from "../lib/booking/bookingLineItemTypes";

const TARGET_IDS = new Set([
  "d860554e-c132-477b-bf15-557fb9c88a5e",
  "f6b2316e-2518-4f43-b6e8-b050c6d07483",
  "e865f74b-33af-481f-a12e-576e1e0ed227",
  "d2cfcb8d-118f-48cc-90c7-420ffe122c9b",
  "c1bd1fc8-03e9-4f2c-a597-e0ac395c841a",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const B3_C1BD_ID = "c1bd1fc8-03e9-4f2c-a597-e0ac395c841a";

const B3_C1BD_AUDITED_FIXTURE = {
  bookingId: B3_C1BD_ID,
  totalPaidZar: 1819,
  amountPaidCents: 181900,
  bookingSnapshot: {
    pricingSummary: {
      lineItems: [
        { label: "Deep Cleaning (base)", amountZar: 1200 },
        { label: "3 bedrooms", amountZar: 450 },
        { label: "2 bathrooms", amountZar: 400 },
        { label: "Inside cabinets", amountZar: 25 },
        { label: "Interior walls", amountZar: 35 },
        { label: "Service fee", amountZar: 30 },
        { label: "15% discount", amountZar: -321 },
      ],
      selected_extras: [
        { name: "Inside cabinets", price: 25, extra_id: "inside-cabinets" },
        { name: "Interior walls", price: 35, extra_id: "interior-walls" },
      ],
    },
  },
} as const;


function parseArgs(argv: string[]): { apply: boolean; fixtureCheck: boolean; requestedIds: string[] } {
  let apply = false;
  let fixtureCheck = false;
  const requestedIds: string[] = [];

  for (const arg of argv.slice(2)) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--fixture-check") {
      fixtureCheck = true;
      continue;
    }
    if (arg.startsWith("--booking-id=")) {
      const id = arg.slice("--booking-id=".length).trim().toLowerCase();
      if (!UUID_RE.test(id)) {
        throw new Error(`Invalid --booking-id value: ${id || "<empty>"}`);
      }
      requestedIds.push(id);
      continue;
    }
    if (arg === "--booking-id") {
      throw new Error("Use --booking-id=<uuid>; spaced --booking-id values are not accepted.");
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { apply, fixtureCheck, requestedIds: [...new Set(requestedIds)] };
}

const { apply, fixtureCheck, requestedIds } = parseArgs(process.argv);

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
    {
      bookingId: "e865f74b-33af-481f-a12e-576e1e0ed227",
      totalPaidZar: 2530,
      amountPaidCents: 253000,
      bookingSnapshot: {
        pricingSummary: {
          lineItems: [
            { label: "Deep Cleaning (base)", amountZar: 1200 },
            { label: "2 bedrooms", amountZar: 300 },
            { label: "2 bathrooms", amountZar: 400 },
            { label: "Property condition", amountZar: 100 },
            { label: "Balcony cleaning", amountZar: 50 },
            { label: "Ceiling cleaning", amountZar: 100 },
            { label: "Outside windows", amountZar: 350 },
            { label: "Service fee", amountZar: 30 },
          ],
          selected_extras: [
            { name: "Balcony cleaning", price: 50, extra_id: "balcony-cleaning" },
            { name: "Ceiling cleaning", price: 100, extra_id: "ceiling-cleaning" },
            { name: "Outside windows", price: 350, extra_id: "outside-windows" },
          ],
        },
      },
    },
    {
      bookingId: "d2cfcb8d-118f-48cc-90c7-420ffe122c9b",
      totalPaidZar: 1950,
      amountPaidCents: 195000,
      bookingSnapshot: {
        pricingSummary: {
          lineItems: [
            { label: "Moving Cleaning (base)", amountZar: 1200 },
            { label: "2 bedrooms", amountZar: 200 },
            { label: "3 bathrooms", amountZar: 450 },
            { label: "Furnished property", amountZar: 50 },
            { label: "Inside oven", amountZar: 20 },
            { label: "Service fee", amountZar: 30 },
          ],
          selected_extras: [{ name: "Inside oven", price: 20, extra_id: "inside-oven" }],
        },
      },
    },
    {
      bookingId: "c1bd1fc8-03e9-4f2c-a597-e0ac395c841a",
      totalPaidZar: 1819,
      amountPaidCents: 181900,
      bookingSnapshot: {
        pricingSummary: {
          lineItems: [
            { label: "Deep Cleaning (base)", amountZar: 1200 },
            { label: "3 bedrooms", amountZar: 450 },
            { label: "2 bathrooms", amountZar: 400 },
            { label: "Inside cabinets", amountZar: 25 },
            { label: "Interior walls", amountZar: 35 },
            { label: "Service fee", amountZar: 30 },
            { label: "15% discount", amountZar: -321 },
          ],
          selected_extras: [
            { name: "Inside cabinets", price: 25, extra_id: "inside-cabinets" },
            { name: "Interior walls", price: 35, extra_id: "interior-walls" },
          ],
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
  console.log("A02-03-02A/B1/B2/B3 fixture check PASS");
}

type PreparedTarget = {
  bookingId: string;
  rosterCount: number;
  payoutCount: number;
  alreadyRepaired: boolean;
  built: Extract<ReturnType<typeof buildHistoricalTeamFinancialLedger>, { ok: true }>;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value != null && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    return `{${Object.keys(rec)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(rec[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function auditedPricingProjection(snapshot: unknown): unknown {
  if (snapshot == null || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const pricing = (snapshot as Record<string, unknown>).pricingSummary;
  if (pricing == null || typeof pricing !== "object" || Array.isArray(pricing)) return null;
  const p = pricing as Record<string, unknown>;
  return {
    lineItems: Array.isArray(p.lineItems) ? p.lineItems : null,
    selected_extras: Array.isArray(p.selected_extras) ? p.selected_extras : [],
  };
}

function assertB3AuditedFixtureUnchanged(
  bookingId: string,
  liveSnapshot: unknown,
  built: Extract<ReturnType<typeof buildHistoricalTeamFinancialLedger>, { ok: true }>,
): void {
  if (bookingId !== B3_C1BD_ID) return;

  const expectedBuilt = buildHistoricalTeamFinancialLedger(B3_C1BD_AUDITED_FIXTURE);
  if (!expectedBuilt.ok) {
    throw new Error(`${bookingId}: internal audited fixture is invalid: ${expectedBuilt.error}`);
  }

  const liveProjection = auditedPricingProjection(liveSnapshot);
  const expectedProjection = auditedPricingProjection(B3_C1BD_AUDITED_FIXTURE.bookingSnapshot);
  if (canonicalJson(liveProjection) !== canonicalJson(expectedProjection)) {
    throw new Error(`${bookingId}: audited fixture mismatch; live pricing snapshot changed since B3 audit`);
  }

  if (
    built.declaredPayableCents !== expectedBuilt.declaredPayableCents ||
    built.sourceLineTotalCents !== expectedBuilt.sourceLineTotalCents ||
    canonicalJson(built.items) !== canonicalJson(expectedBuilt.items)
  ) {
    throw new Error(`${bookingId}: audited fixture mismatch; reconstructed payload changed since B3 audit`);
  }
}

async function readPersistedRepairState(
  admin: SupabaseClient,
  bookingId: string,
  expectedItems: readonly BookingLineItemInsert[],
  expectedTotalCents: number,
): Promise<{ ok: true; valid: boolean; count: number; total: number } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("booking_line_items")
    .select("item_type, slug, name, quantity, unit_price_cents, total_price_cents, pricing_source, metadata, earns_cleaner")
    .eq("booking_id", bookingId);
  if (error) return { ok: false, error: error.message };

  const rows = data ?? [];
  const total = rows.reduce((sum, row) => sum + Number(row.total_price_cents ?? 0), 0);

  const expectedByIndex = new Map(
    expectedItems.map((item) => [Number((item.metadata as Record<string, unknown> | undefined)?.sourceLineIndex), item]),
  );
  const seen = new Set<number>();
  let exact = rows.length === expectedItems.length && total === expectedTotalCents;

  for (const row of rows) {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const sourceLineIndex = Number(metadata.sourceLineIndex);
    const expected = expectedByIndex.get(sourceLineIndex);
    if (!Number.isInteger(sourceLineIndex) || sourceLineIndex < 0 || !expected || seen.has(sourceLineIndex)) {
      exact = false;
      break;
    }
    seen.add(sourceLineIndex);

    const expectedMetadata = expected.metadata ?? {};
    if (
      row.item_type !== expected.item_type ||
      (row.slug ?? null) !== (expected.slug ?? null) ||
      row.name !== expected.name ||
      Number(row.quantity) !== Number(expected.quantity) ||
      Number(row.unit_price_cents) !== Number(expected.unit_price_cents) ||
      Number(row.total_price_cents) !== Number(expected.total_price_cents) ||
      row.pricing_source !== "historical_team_snapshot_v1" ||
      row.earns_cleaner !== false ||
      canonicalJson(metadata) !== canonicalJson(expectedMetadata)
    ) {
      exact = false;
      break;
    }
  }

  if (seen.size !== expectedItems.length) exact = false;
  return { ok: true, valid: exact, count: rows.length, total };
}

async function preflightTarget(admin: SupabaseClient, bookingId: string): Promise<PreparedTarget> {
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

  // B3 is a one-booking financial repair: pin the live immutable pricing projection and
  // resulting persisted payload to the exact audited fixture, not merely the same total.
  assertB3AuditedFixtureUnchanged(bookingId, booking.booking_snapshot, built);

  const existing = await readPersistedRepairState(
    admin,
    bookingId,
    built.items,
    built.declaredPayableCents,
  );
  if (!existing.ok) throw new Error(`${bookingId}: ${existing.error}`);
  if (existing.count > 0 && !existing.valid) {
    throw new Error(`${bookingId}: existing booking_line_items conflict with bounded repair`);
  }

  return {
    bookingId,
    rosterCount: rosterCount ?? 0,
    payoutCount: payoutCount ?? 0,
    alreadyRepaired: existing.valid,
    built,
  };
}

async function main() {
  if (fixtureCheck) {
    runFixtureCheck();
    return;
  }

  const ids = requestedIds.length > 0 ? requestedIds : [...TARGET_IDS];
  for (const id of ids) {
    if (!TARGET_IDS.has(id)) throw new Error(`Booking ${id} is outside the bounded A02-03-02A/B1/B2/B3 allowlist.`);
  }

  if (apply && requestedIds.length !== 1) {
    throw new Error("Apply requires exactly one explicit --booking-id=<uuid> target.");
  }
  if (apply && process.env.A02_03_02_APPLY !== "YES") {
    throw new Error("Apply blocked. Set A02_03_02_APPLY=YES and pass --apply.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase URL/service role configuration.");

  const admin = createClient(url, key, { auth: { persistSession: false } });

  // Validate and build every requested target before any write occurs.
  const prepared: PreparedTarget[] = [];
  for (const bookingId of ids) {
    prepared.push(await preflightTarget(admin, bookingId));
  }

  for (const target of prepared) {
    console.log(
      JSON.stringify({
        mode: apply ? "apply" : "dry-run",
        bookingId: target.bookingId,
        rosterCount: target.rosterCount,
        payoutCount: target.payoutCount,
        alreadyRepaired: target.alreadyRepaired,
        declaredPayableCents: target.built.declaredPayableCents,
        sourceLineTotalCents: target.built.sourceLineTotalCents,
        lineCount: target.built.items.length,
      }),
    );
  }

  if (!apply) return;

  for (const target of prepared) {
    const { bookingId, built } = target;
    if (target.alreadyRepaired) {
      console.log(JSON.stringify({ mode: "apply", bookingId, result: "already_repaired" }));
      continue;
    }

    const lineRows = built.items.map((item) => ({
      item_type: item.item_type,
      slug: item.slug ?? null,
      name: item.name,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      total_price_cents: item.total_price_cents,
      pricing_source: item.pricing_source,
      metadata: item.metadata ?? {},
      earns_cleaner: false,
    }));

    const { data: rpcResult, error: rpcError } = await admin.rpc("repair_a02_03_02_team_line_items", {
      p_booking_id: bookingId,
      p_line_items: lineRows,
      p_expected_total_cents: built.declaredPayableCents,
    });

    if (rpcError) {
      // PostgREST can report an error after the DB committed if the response is lost.
      // Read back the source-marked ledger before deciding the repair failed.
      const recovered = await readPersistedRepairState(
        admin,
        bookingId,
        built.items,
        built.declaredPayableCents,
      );
      if (recovered.ok && recovered.valid) {
        console.log(JSON.stringify({ mode: "apply", bookingId, result: "recovered_after_ambiguous_rpc_error" }));
        continue;
      }
      const recoveryDetail = recovered.ok
        ? `persisted_count=${recovered.count} persisted_total=${recovered.total}`
        : `readback_error=${recovered.error}`;
      throw new Error(`${bookingId}: RPC failed: ${rpcError.message}; ${recoveryDetail}`);
    }

    const result = String(rpcResult ?? "");
    if (!["inserted", "already_repaired"].includes(result)) {
      throw new Error(`${bookingId}: unexpected RPC result ${result || "<empty>"}`);
    }

    const verified = await readPersistedRepairState(
      admin,
      bookingId,
      built.items,
      built.declaredPayableCents,
    );
    if (!verified.ok) {
      throw new Error(`${bookingId}: verification read failed; safe to retry: ${verified.error}`);
    }
    if (!verified.valid) {
      throw new Error(
        `${bookingId}: atomic RPC returned ${result} but persisted ledger failed verification (count=${verified.count}, total=${verified.total})`,
      );
    }

    console.log(JSON.stringify({ mode: "apply", bookingId, result }));
  }
}

void main();
