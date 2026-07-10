import { describe, expect, it } from "vitest";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import { buildAdminStatusTransitionUpdates } from "@/lib/admin/buildAdminStatusTransitionUpdates";
import { toCanonicalBookingLifecycleSurface } from "@/lib/booking/readModels/bookingReadModel";
import {
  buildAuthoritativeQuotePersistPatch,
  resolvePersistedBookingDurationMinutes,
} from "@/lib/booking/quote/bookingQuotePersistence";
import { resolveBookingV2Quote } from "@/lib/booking/quote/resolveBookingQuote";
import {
  assertV2ConfirmQuoteIntegrity,
} from "@/lib/booking/quote/validateBookingV2Quote";
import {
  CLEANER_COMPLETION_MIN_ELAPSED_RATIO,
  evaluateCleanerJobCompletionGate,
} from "@/lib/cleaner/cleanerJobCompletionGate";
import { CLEANER_LIFECYCLE_CODE } from "@/lib/cleaner/cleanerLifecycleErrors";
import { isCompletableDisplayEarningsCents } from "@/lib/payout/bookingEarningsIntegrity";

const BOOKING_ID = "00000000-0000-4000-8000-0000000000e2";
const CLEANER_ID = "00000000-0000-4000-8000-0000000000c1";
const SCHEDULE = { date: "2026-07-15", time: "10:00" } as const;
const STARTED_AT = "2026-07-15T08:00:00.000Z";

type QuoteInput = Parameters<typeof resolveBookingV2Quote>[0];

function baseQuoteInput(): QuoteInput {
  return {
    serviceSlug: "regular-cleaning",
    serviceLabel: "Regular Cleaning",
    serviceDetails: { bedrooms: "2", bathrooms: "1" },
    selectedExtras: [] as string[],
    cleanerMode: "individual_cleaners",
    cleanerCount: 1,
    bookingType: "once_off",
    recurringFrequency: "",
    catalog: {
      basePrice: 500,
      pricePerBedroom: 50,
      pricePerBathroom: 40,
      pricePerExtraRoom: 30,
      pricePerExtraCleaner: 200,
      estimatedDurationHours: 3,
      minDurationHours: 3.5,
      maxDurationHours: 8,
      extras: [],
    },
    feesConfig: defaultBookingV2FeesConfig(),
  };
}

type MutableBookingRow = Record<string, unknown>;

function mapCompletionGateToCleanerResponse(gate: ReturnType<typeof evaluateCleanerJobCompletionGate>) {
  if (gate.ok) return { status: 200 as const, allowed: true as const };
  const code =
    gate.code === "missing_persisted_duration"
      ? CLEANER_LIFECYCLE_CODE.COMPLETION_MISSING_DURATION
      : gate.code === "quote_signature_missing"
        ? CLEANER_LIFECYCLE_CODE.COMPLETION_QUOTE_SIGNATURE_MISSING
        : CLEANER_LIFECYCLE_CODE.COMPLETION_MINIMUM_DURATION_NOT_ELAPSED;
  return {
    status: 422 as const,
    allowed: false as const,
    code,
    gate_code: gate.code,
    remaining_minutes: gate.remainingMinutes ?? null,
  };
}

function confirmQuoteBooking(): {
  quoteInput: QuoteInput;
  quote: ReturnType<typeof resolveBookingV2Quote>;
  persistPatch: Record<string, unknown>;
  booking: MutableBookingRow;
} {
  const quoteInput = baseQuoteInput();
  const quote = resolveBookingV2Quote(quoteInput);
  const integrity = assertV2ConfirmQuoteIntegrity({
    serverBreakdown: quote.breakdown,
    catalogLoaded: true,
    clientPricingSummary: quote.breakdown,
    quoteInput,
  });
  expect(integrity.ok).toBe(true);

  const persistPatch = buildAuthoritativeQuotePersistPatch({
    breakdown: quote.breakdown,
    schedule: SCHEDULE,
  });

  const booking: MutableBookingRow = {
    id: BOOKING_ID,
    status: "pending_payment",
    date: SCHEDULE.date,
    time: SCHEDULE.time,
    dispatch_status: "searching",
    ...persistPatch,
  };

  return { quoteInput, quote, persistPatch, booking };
}

function assignBooking(booking: MutableBookingRow, displayEarningsCents: number): MutableBookingRow {
  return {
    ...booking,
    status: "assigned",
    cleaner_id: CLEANER_ID,
    dispatch_status: "assigned",
    cleaner_response_status: "accepted",
    display_earnings_cents: displayEarningsCents,
    assigned_at: "2026-07-14T12:00:00.000Z",
    payment_completed_at: "2026-07-14T12:00:00.000Z",
  };
}

function startBooking(booking: MutableBookingRow): MutableBookingRow {
  return {
    ...booking,
    status: "in_progress",
    started_at: STARTED_AT,
    cleaner_response_status: "started",
    en_route_at: "2026-07-15T07:30:00.000Z",
  };
}

/**
 * Phase 8 success criteria:
 * 1. Confirm persists authoritative quote + duration (signature, minutes, version).
 * 2. Assign + start leave row eligible for completion gate evaluation.
 * 3. Cleaner complete blocked before 90% quoted duration elapsed.
 * 4. Admin complete records gate-override audit when completing early.
 * 5. After 90% elapsed, cleaner gate passes; lifecycle surfaces show completed.
 */
describe("bookingQuoteLifecycle (Phase 8 E2E)", () => {
  it("chains create → confirm → assign → start → block complete → override → complete", () => {
    const { quote, persistPatch, booking: confirmed } = confirmQuoteBooking();

    expect(persistPatch.quote_calculation_version).toBe(quote.calculation_version);
    expect(persistPatch.duration_minutes).toBe(quote.duration_minutes);
    expect(typeof (persistPatch.pricing_summary as { quote_signature?: string }).quote_signature).toBe("string");
    expect(resolvePersistedBookingDurationMinutes(confirmed)).toBe(quote.duration_minutes);

    const assigned = assignBooking(confirmed, 35_000);
    expect(assigned.status).toBe("assigned");
    expect(isCompletableDisplayEarningsCents(assigned.display_earnings_cents)).toBe(true);

    const inProgress = startBooking(assigned);
    expect(inProgress.status).toBe("in_progress");
    expect(inProgress.started_at).toBe(STARTED_AT);

    const durationMinutes = resolvePersistedBookingDurationMinutes(inProgress)!;
    const tooEarlyMs =
      Date.parse(STARTED_AT) + durationMinutes * CLEANER_COMPLETION_MIN_ELAPSED_RATIO * 60_000 - 5 * 60_000;
    const blockedGate = evaluateCleanerJobCompletionGate(inProgress, tooEarlyMs);
    expect(blockedGate.ok).toBe(false);
    if (!blockedGate.ok) {
      expect(blockedGate.code).toBe("minimum_duration_not_elapsed");
      expect(blockedGate.remainingMinutes).toBeGreaterThan(0);
    }

    const blockedResponse = mapCompletionGateToCleanerResponse(blockedGate);
    expect(blockedResponse.allowed).toBe(false);
    expect(blockedResponse.status).toBe(422);
    expect(blockedResponse.code).toBe(CLEANER_LIFECYCLE_CODE.COMPLETION_MINIMUM_DURATION_NOT_ELAPSED);
    expect(blockedResponse.gate_code).toBe("minimum_duration_not_elapsed");

    const { updates: adminCompleteUpdates } = buildAdminStatusTransitionUpdates(inProgress, "completed", {
      adminEmail: "ops@example.com",
      completionGateOverrideReason: "Customer signed off early",
    });
    const adminCompleted: MutableBookingRow = { ...inProgress, ...adminCompleteUpdates };
    expect(adminCompleted.status).toBe("completed");
    expect(typeof adminCompleted.completed_at).toBe("string");
    expect(adminCompleted.admin_completion_gate_override_by).toBe("ops@example.com");
    expect(adminCompleted.admin_completion_gate_override_reason).toBe("Customer signed off early");
    expect(adminCompleted.admin_completion_gate_override_codes).toContain("minimum_duration_not_elapsed");

    const adminSurface = toCanonicalBookingLifecycleSurface(adminCompleted, "admin");
    const customerSurface = toCanonicalBookingLifecycleSurface(adminCompleted, "customer");
    const cleanerSurface = toCanonicalBookingLifecycleSurface(adminCompleted, "cleaner");
    expect(adminSurface.operationalPhase).toBe("completed");
    expect(customerSurface.operationalPhase).toBe("completed");
    expect(cleanerSurface.operationalPhase).toBe("completed");

    const onTimeMs = Date.parse(STARTED_AT) + durationMinutes * CLEANER_COMPLETION_MIN_ELAPSED_RATIO * 60_000 + 60_000;
    const allowedGate = evaluateCleanerJobCompletionGate(inProgress, onTimeMs);
    expect(allowedGate.ok).toBe(true);
    if (allowedGate.ok) {
      expect(allowedGate.elapsedMinutes).toBeGreaterThanOrEqual(
        durationMinutes * CLEANER_COMPLETION_MIN_ELAPSED_RATIO,
      );
    }

    const allowedResponse = mapCompletionGateToCleanerResponse(allowedGate);
    expect(allowedResponse.allowed).toBe(true);
    expect(allowedResponse.status).toBe(200);
  });

  it("rejects confirm when client quote drifts (create gate)", () => {
    const quoteInput = baseQuoteInput();
    const quote = resolveBookingV2Quote(quoteInput);
    const tampered = { ...quote.breakdown, estimated_total: quote.breakdown.estimated_total + 100 };
    const result = assertV2ConfirmQuoteIntegrity({
      serverBreakdown: quote.breakdown,
      catalogLoaded: true,
      clientPricingSummary: tampered,
      quoteInput,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("quote_price_drift");
  });

  it("blocks cleaner complete when quote_signature is missing even after elapsed time", () => {
    const { booking: confirmed } = confirmQuoteBooking();
    const inProgress = startBooking(assignBooking(confirmed, 35_000));
    const summary = { ...(confirmed.pricing_summary as Record<string, unknown>) };
    delete summary.quote_signature;
    const unsignedRow = { ...inProgress, pricing_summary: summary };

    const gate = evaluateCleanerJobCompletionGate(
      unsignedRow,
      Date.parse(STARTED_AT) + 10 * 60 * 60_000,
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.code).toBe("quote_signature_missing");

    const response = mapCompletionGateToCleanerResponse(gate);
    expect(response.code).toBe(CLEANER_LIFECYCLE_CODE.COMPLETION_QUOTE_SIGNATURE_MISSING);
  });

  it("blocks cleaner complete when authoritative duration is missing after start", () => {
    const { booking: confirmed } = confirmQuoteBooking();
    const inProgress = startBooking(assignBooking(confirmed, 35_000));
    const stripped = {
      ...inProgress,
      duration_minutes: null,
      estimated_duration_minutes: null,
      duration_hours: null,
      pricing_summary: null,
      booking_snapshot: null,
    };

    const gate = evaluateCleanerJobCompletionGate(stripped, Date.parse(STARTED_AT) + 10 * 60 * 60_000);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.code).toBe("missing_persisted_duration");
  });
});
