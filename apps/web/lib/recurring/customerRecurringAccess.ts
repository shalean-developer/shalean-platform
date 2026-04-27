import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function getRecurringRowForCustomer(
  admin: SupabaseClient,
  recurringId: string,
  customerId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin
    .from("recurring_bookings")
    .select("*")
    .eq("id", recurringId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Record<string, unknown>;
}
