import "server-only";

import type { PaymentConversionBucket } from "@/lib/booking/paymentConversionBucket";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { metaWhatsAppToDigits } from "@/lib/dispatch/metaWhatsAppSend";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import type { SupabaseClient } from "@supabase/supabase-js";

function parseBucket(raw: unknown): PaymentConversionBucket | null {
  if (!raw || typeof raw !== "object") return null;
  const b = String((raw as { payment_conversion_bucket?: string | null }).payment_conversion_bucket ?? "").trim();
  if (b === "instant" || b === "fast" || b === "medium" || b === "slow") return b;
  return null;
}

/**
 * Prior payment velocity for adaptive reminders: same normalized email first, else same phone digits
 * among recent paid-tagged rows (`payment_conversion_bucket` set). Cache key = `email||digits`.
 */
export async function priorPaymentConversionBucketForCustomer(
  admin: SupabaseClient,
  params: {
    emailRaw: string | null | undefined;
    phoneRaw: string | null | undefined;
    excludeBookingId: string;
  },
  cache: Map<string, PaymentConversionBucket | null>,
): Promise<PaymentConversionBucket | null> {
  const em = normalizeEmail(String(params.emailRaw ?? ""));
  const digits = metaWhatsAppToDigits(String(params.phoneRaw ?? ""));
  const cacheKey = `${em}||${digits}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  if (em) {
    const { data, error } = await admin
      .from("bookings")
      .select("payment_conversion_bucket")
      .eq("customer_email", em)
      .neq("id", params.excludeBookingId)
      .not("payment_conversion_bucket", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      await reportOperationalIssue("warn", "priorPaymentConversionBucket", error.message, { email: em });
    } else {
      const b = parseBucket(data);
      if (b) {
        cache.set(cacheKey, b);
        return b;
      }
    }
  }

  if (digits.length >= 10) {
    const { data: byPhone, error: pErr } = await admin
      .from("bookings")
      .select("payment_conversion_bucket")
      .eq("normalized_phone", digits)
      .neq("id", params.excludeBookingId)
      .not("payment_conversion_bucket", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pErr) {
      await reportOperationalIssue("warn", "priorPaymentConversionBucket", pErr.message, { digitsLen: digits.length });
      cache.set(cacheKey, null);
      return null;
    }

    const b = parseBucket(byPhone);
    if (b) {
      cache.set(cacheKey, b);
      return b;
    }
  }

  cache.set(cacheKey, null);
  return null;
}
