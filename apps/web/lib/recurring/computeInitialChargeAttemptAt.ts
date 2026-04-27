import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { priorPaymentConversionBucketForCustomer } from "@/lib/pay/priorPaymentConversionBucket";
import { recurringSmartChargeDeferHoursForBucket, recurringSmartChargeEnabled } from "@/lib/recurring/autoChargeRetryPolicy";

/**
 * First `recurring_next_charge_attempt_at` for a newly generated recurring booking (smart delay optional).
 */
export async function computeInitialRecurringChargeAttemptAt(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    customerEmail: string;
    customerPhone: string | null;
  },
): Promise<string | null> {
  if (!recurringSmartChargeEnabled()) return null;

  const cache = new Map();
  const bucket = await priorPaymentConversionBucketForCustomer(
    admin,
    {
      emailRaw: params.customerEmail,
      phoneRaw: params.customerPhone,
      excludeBookingId: params.bookingId,
    },
    cache,
  );

  const hours = recurringSmartChargeDeferHoursForBucket(bucket);
  if (hours <= 0) return null;

  return new Date(Date.now() + hours * 3600_000).toISOString();
}
