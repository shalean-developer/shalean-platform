import { getSupabaseAdmin } from "@/lib/supabase/admin";

type ComputeBookingEarningsInput = {
  servicePriceCents: number;
  serviceId: string;
  cleanerId?: string;
  isTeamJob: boolean;
  bookingDate: string;
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

const EARNINGS_MODEL_VERSION = "v1_2026_earnings";
const TEAM_MEMBER_PAYOUT_CENTS = 25_000;

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

export async function computeBookingEarnings({
  servicePriceCents,
  serviceId,
  cleanerId,
  isTeamJob,
  bookingDate,
}: ComputeBookingEarningsInput): Promise<ComputeBookingEarningsOutput> {
  /** When this is 0, all returned *_cents are 0 — ensure {@link persistCleanerPayout} passes paid `payoutBaseCents`, not missing totals. */
  const normalizedServicePriceCents = Math.max(0, Math.floor(servicePriceCents));

  if (isTeamJob) {
    return {
      display_earnings_cents: TEAM_MEMBER_PAYOUT_CENTS,
      payout_earnings_cents: TEAM_MEMBER_PAYOUT_CENTS,
      internal_earnings_cents: TEAM_MEMBER_PAYOUT_CENTS,
      earnings_model_version: EARNINGS_MODEL_VERSION,
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
      earnings_model_version: EARNINGS_MODEL_VERSION,
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
    earnings_model_version: EARNINGS_MODEL_VERSION,
    earnings_percentage_applied: percentage,
    earnings_cap_cents_applied: cap.cap_cents,
    earnings_tenure_months_at_assignment: tenureMonths,
  };
}
