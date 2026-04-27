import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { evaluateCustomerRetentionState } from "@/lib/growth/customerRetention";
import { calculateCustomerLTV } from "@/lib/growth/customerLTV";
import { segmentCustomer } from "@/lib/growth/customerSegment";

export type CustomerGrowthContext = {
  userId: string;
  email: string | null;
  phone: string | null;
  bookingCount: number;
  totalSpentCents: number;
  primaryCityId: string | null;
  hasActiveSubscription: boolean;
  lastBookingActivityAt: string | null;
  cityActive: boolean | null;
};

export async function loadCustomerGrowthContext(
  admin: SupabaseClient,
  userId: string,
): Promise<CustomerGrowthContext | null> {
  const { data: profile, error: pErr } = await admin
    .from("user_profiles")
    .select("booking_count, total_spent_cents, primary_city_id")
    .eq("id", userId)
    .maybeSingle();
  if (pErr || !profile) return null;

  const bookingCount = Number((profile as { booking_count?: number }).booking_count ?? 0);
  const totalSpentCents = Number((profile as { total_spent_cents?: number }).total_spent_cents ?? 0);
  const primaryCityId = String((profile as { primary_city_id?: string | null }).primary_city_id ?? "").trim() || null;

  let cityActive: boolean | null = null;
  if (primaryCityId) {
    const { data: city } = await admin.from("cities").select("is_active").eq("id", primaryCityId).maybeSingle();
    if (city && typeof city === "object" && "is_active" in city) {
      cityActive = Boolean((city as { is_active: boolean }).is_active);
    }
  }

  // Phase 2A: legacy `subscriptions` removed — use `recurring_bookings` for active plans when wiring LTV/retention.
  const hasActiveSubscription = false;

  let email: string | null = null;
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const emailRaw = authUser?.user?.email?.trim() ?? "";
    if (emailRaw) email = normalizeEmail(emailRaw);
  } catch {
    email = null;
  }

  const { data: lastBooking } = await admin
    .from("bookings")
    .select("date, completed_at, status, customer_phone, customer_email")
    .eq("user_id", userId)
    .neq("status", "pending_payment")
    .neq("status", "payment_expired")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let lastBookingActivityAt: string | null = null;
  let phone: string | null = null;
  if (lastBooking && typeof lastBooking === "object") {
    const completedAt = (lastBooking as { completed_at?: string | null }).completed_at;
    const dateYmd = (lastBooking as { date?: string | null }).date;
    if (typeof completedAt === "string" && completedAt.trim()) {
      lastBookingActivityAt = completedAt.trim();
    } else if (typeof dateYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      lastBookingActivityAt = `${dateYmd}T12:00:00.000Z`;
    }
    const ph = (lastBooking as { customer_phone?: string | null }).customer_phone;
    phone = typeof ph === "string" && ph.trim() ? ph.trim() : null;
    if (!email) {
      const ce = (lastBooking as { customer_email?: string | null }).customer_email;
      if (typeof ce === "string" && ce.trim()) {
        try {
          email = normalizeEmail(ce.trim());
        } catch {
          email = null;
        }
      }
    }
  }

  return {
    userId,
    email,
    phone,
    bookingCount,
    totalSpentCents,
    primaryCityId,
    hasActiveSubscription,
    lastBookingActivityAt,
    cityActive,
  };
}

export async function persistCustomerSegmentRow(
  admin: SupabaseClient,
  ctx: CustomerGrowthContext,
): Promise<void> {
  const retention = evaluateCustomerRetentionState({ lastBookingActivityAt: ctx.lastBookingActivityAt });
  const seg = segmentCustomer({ bookingCount: ctx.bookingCount, retentionState: retention });
  await admin.from("customer_segment").upsert(
    {
      user_id: ctx.userId,
      segment: seg,
      city_id: ctx.primaryCityId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}
