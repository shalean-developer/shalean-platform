import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CANONICAL_TEAM_POOL_DISPLAY_CENTS, resolveCanonicalCleanerPayout, isLegacyPayoutEngineEnabled } from "@/lib/payout/canonicalCleanerPayout";

type ComputeBookingEarningsInput = {
  servicePriceCents: number;
  serviceId: string;
  cleanerId?: string;
  isTeamJob: boolean;
  /** Booking appointment instant (ISO UTC), e.g. from {@link bookingAppointmentIsoUtc}. */
  bookingDate: string;
  /** Active cleaners on a team job (canonical: N × R250 total internal). Ignored when not `isTeamJob`. */
  teamCleanerCount?: number | null;
};

type ServiceCap = {
  cap_cents: number;
};

type Cleaner = {
  id: string;
  joined_at: string;
};

export type ComputeBookingEarningsOutput = {
  display_earnings_cents: number;
  payout_earnings_cents: number;
  internal_earnings_cents: number;
  earnings_model_version: string;
  earnings_percentage_applied?: number;
  earnings_cap_cents_applied?: number;
  earnings_tenure_months_at_assignment?: number;
};

const EARNINGS_MODEL_VERSION_LEGACY = "v1_2026_earnings";

function monthsBetween(start: string, end: string): number {
  const d1 = new Date(start);
  const d2 = new Date(end);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) {
    return 0;
  }

  let months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (d2.getDate() < d1.getDate()) {
    months -= 1;
  }
  return Math.max(months, 0);
}

async function getCleanerById(cleanerId: string): Promise<Cleaner> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("Supabase admin client unavailable");
  }

  const { data, error } = await admin
    .from("cleaners")
    .select("id, joined_at, created_at")
    .eq("id", cleanerId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Cleaner not found for id=${cleanerId}`);
  }

  const row = data as { id?: string; joined_at?: string | null; created_at?: string | null };
  const joinedAt = String(row.joined_at ?? row.created_at ?? "").trim();
  if (!joinedAt) {
    throw new Error(`Cleaner joined_at missing for id=${cleanerId}`);
  }

  return {
    id: String(row.id ?? cleanerId),
    joined_at: joinedAt,
  };
}

async function getServiceCap(serviceId: string, bookingDate: string): Promise<ServiceCap | null> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("Supabase admin client unavailable");
  }

  const { data, error } = await admin
    .from("service_earning_caps")
    .select("cap_cents, effective_from, effective_to, created_at")
    .eq("service_id", serviceId)
    .eq("is_active", true)
    .order("effective_from", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    console.error("EARNINGS_CAP_MISSING", {
      serviceId,
      bookingDate,
      reason: "query_error",
      message: error.message,
    });
    return null;
  }
  if (!data?.length) return null;

  const bookingAt = new Date(bookingDate).getTime();
  if (Number.isNaN(bookingAt)) {
    console.error("EARNINGS_CAP_MISSING", {
      serviceId,
      bookingDate,
      reason: "invalid_booking_date",
    });
    return null;
  }

  const activeRow = (data as Array<{ cap_cents?: number; effective_from?: string | null; effective_to?: string | null }>).find(
    (row) => {
      const from = row.effective_from ? new Date(row.effective_from).getTime() : null;
      const to = row.effective_to ? new Date(row.effective_to).getTime() : null;
      if (from != null && !Number.isNaN(from) && bookingAt < from) return false;
      if (to != null && !Number.isNaN(to) && bookingAt > to) return false;
      return true;
    },
  );
  if (!activeRow) return null;

  const cap = Math.max(0, Math.floor(Number(activeRow.cap_cents ?? 0)));
  if (!Number.isFinite(cap) || cap <= 0) {
    return null;
  }

  return { cap_cents: cap };
}

async function computeBookingEarningsLegacy({
  servicePriceCents,
  serviceId,
  cleanerId,
  isTeamJob,
  bookingDate,
}: ComputeBookingEarningsInput): Promise<ComputeBookingEarningsOutput> {
  const normalizedServicePriceCents = Math.max(0, Math.floor(servicePriceCents));

  if (isTeamJob) {
    return {
      display_earnings_cents: CANONICAL_TEAM_POOL_DISPLAY_CENTS,
      payout_earnings_cents: CANONICAL_TEAM_POOL_DISPLAY_CENTS,
      internal_earnings_cents: CANONICAL_TEAM_POOL_DISPLAY_CENTS,
      earnings_model_version: EARNINGS_MODEL_VERSION_LEGACY,
    };
  }

  if (!cleanerId) {
    throw new Error("CleanerId required for individual job");
  }

  const cleaner = await getCleanerById(cleanerId);
  const tenureMonths = monthsBetween(cleaner.joined_at, bookingDate);
  const percentage = tenureMonths < 4 ? 0.6 : 0.7;

  const cap = await getServiceCap(serviceId, bookingDate);
  const percentageEarnings = Math.round(normalizedServicePriceCents * percentage);

  if (!cap) {
    console.error("EARNINGS_CAP_MISSING", {
      serviceId,
      bookingDate,
      reason: "no_active_cap",
      percentageEarningsUncapped: percentageEarnings,
    });
    const displayUncapped = percentageEarnings;
    return {
      display_earnings_cents: displayUncapped,
      payout_earnings_cents: displayUncapped,
      internal_earnings_cents: percentageEarnings,
      earnings_model_version: EARNINGS_MODEL_VERSION_LEGACY,
      earnings_percentage_applied: percentage,
      earnings_cap_cents_applied: undefined,
      earnings_tenure_months_at_assignment: tenureMonths,
    };
  }

  const displayEarnings = Math.min(percentageEarnings, cap.cap_cents);
  const internalEarnings = percentageEarnings;

  return {
    display_earnings_cents: displayEarnings,
    payout_earnings_cents: displayEarnings,
    internal_earnings_cents: internalEarnings,
    earnings_model_version: EARNINGS_MODEL_VERSION_LEGACY,
    earnings_percentage_applied: percentage,
    earnings_cap_cents_applied: cap.cap_cents,
    earnings_tenure_months_at_assignment: tenureMonths,
  };
}

function mapCanonicalToEarningsOutput(c: ReturnType<typeof resolveCanonicalCleanerPayout>): ComputeBookingEarningsOutput {
  return {
    display_earnings_cents: c.displayEarningsCents,
    payout_earnings_cents: c.payoutEarningsCents,
    internal_earnings_cents: c.internalEarningsCents,
    earnings_model_version: c.earningsModelVersion,
    earnings_percentage_applied: c.earningsPercentageApplied ?? undefined,
    earnings_cap_cents_applied: c.earningsCapCentsApplied ?? undefined,
    earnings_tenure_months_at_assignment: c.tenureMonths,
  };
}

/**
 * Computes persisted/previewed earnings metadata for a booking.
 * Default path: {@link resolveCanonicalCleanerPayout} (single business rules engine).
 * Set `USE_LEGACY_PAYOUT_ENGINE=true` to restore DB-cap + v1 behaviour for rollback.
 */
export async function computeBookingEarnings(input: ComputeBookingEarningsInput): Promise<ComputeBookingEarningsOutput> {
  const normalizedServicePriceCents = Math.max(0, Math.floor(input.servicePriceCents));

  if (isLegacyPayoutEngineEnabled()) {
    return computeBookingEarningsLegacy(input);
  }

  if (input.isTeamJob) {
    const appt = String(input.bookingDate ?? "").trim();
    const c = resolveCanonicalCleanerPayout({
      serviceId: input.serviceId,
      bookingValueCents: normalizedServicePriceCents,
      isTeamJob: true,
      cleanerJoinedAtIso: null,
      bookingAppointmentIsoUtc: appt.length > 0 ? appt : null,
      teamCleanerCount: input.teamCleanerCount ?? 1,
    });
    return mapCanonicalToEarningsOutput(c);
  }

  if (!input.cleanerId) {
    throw new Error("CleanerId required for individual job");
  }

  const cleaner = await getCleanerById(input.cleanerId);
  const appt = String(input.bookingDate ?? "").trim();
  const c = resolveCanonicalCleanerPayout({
    serviceId: input.serviceId,
    cleanerJoinedAtIso: cleaner.joined_at,
    bookingAppointmentIsoUtc: appt.length > 0 ? appt : null,
    bookingValueCents: normalizedServicePriceCents,
    isTeamJob: false,
  });

  return mapCanonicalToEarningsOutput(c);
}
