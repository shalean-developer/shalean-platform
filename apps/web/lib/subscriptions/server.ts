import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionFrequency = "weekly" | "biweekly" | "monthly";

export function nextDateFrom(startYmd: string, frequency: SubscriptionFrequency): string {
  const base = new Date(`${startYmd}T00:00:00`);
  const days = frequency === "weekly" ? 7 : frequency === "biweekly" ? 14 : 30;
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function createSubscriptionFromBooking(params: {
  admin: SupabaseClient;
  userId: string;
  serviceType: string;
  frequency: SubscriptionFrequency;
  dateYmd: string;
  timeSlot: string;
  address: string;
  pricePerVisit: number;
  cityId?: string | null;
  paystackCustomerCode?: string | null;
  authorizationCode?: string | null;
  paymentDate?: string | null;
}): Promise<void> {
  const nextBookingDate = nextDateFrom(params.dateYmd, params.frequency);
  const { data: existing } = await params.admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", params.userId)
    .eq("service_type", params.serviceType)
    .eq("frequency", params.frequency)
    .eq("time_slot", params.timeSlot)
    .eq("address", params.address)
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = {
    user_id: params.userId,
    service_type: params.serviceType,
    frequency: params.frequency,
    day_of_week: new Date(`${params.dateYmd}T00:00:00`).getDay(),
    time_slot: params.timeSlot,
    address: params.address,
    city_id: params.cityId ?? null,
    price_per_visit: Math.max(0, Math.round(params.pricePerVisit)),
    status: "active",
    next_booking_date: nextBookingDate,
    paystack_customer_code: params.paystackCustomerCode ?? null,
    authorization_code: params.authorizationCode ?? null,
    last_payment_date: params.paymentDate?.slice(0, 10) ?? params.dateYmd,
    payment_status: "success",
    retry_count: 0,
    last_payment_error: null,
  };

  if (existing?.id) {
    await params.admin.from("subscriptions").update(payload).eq("id", existing.id);
    return;
  }

  await params.admin.from("subscriptions").insert(payload);
}
