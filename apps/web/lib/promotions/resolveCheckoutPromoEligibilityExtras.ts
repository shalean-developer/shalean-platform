import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { segmentCustomer, type CustomerMarketingSegment } from "@/lib/growth/customerSegment";
import { evaluateCustomerRetentionState } from "@/lib/growth/customerRetention";

/**
 * Resolve suburb + marketing segments for promo eligibility at checkout.
 * - suburbId: service-area location UUID (matches promotions.suburb_ids when stored as UUIDs)
 * - customerSegments: growth segment (new/repeat/loyal/churned) plus VIP tier tag
 */
export async function resolveCheckoutPromoEligibilityExtras(
  admin: SupabaseClient,
  params: {
    userId: string | null;
    locationId?: string | null;
    completedBookingCount: number;
    lastBookingActivityAt?: string | null;
  },
): Promise<{ suburbId: string | null; customerSegments: string[] }> {
  const suburbId =
    typeof params.locationId === "string" && params.locationId.trim()
      ? params.locationId.trim()
      : null;

  const segments = new Set<string>();

  // First checkout with no history is "new", not "churned" (retention defaults churned when null).
  let derived: CustomerMarketingSegment;
  if (params.completedBookingCount <= 0 && !params.lastBookingActivityAt) {
    derived = "new";
  } else {
    const retention = evaluateCustomerRetentionState({
      lastBookingActivityAt: params.lastBookingActivityAt ?? null,
    });
    derived = segmentCustomer({
      bookingCount: params.completedBookingCount,
      retentionState: retention,
    });
  }
  segments.add(derived);

  const userId = params.userId?.trim() || "";
  if (userId) {
    const { data: segRow } = await admin
      .from("customer_segment")
      .select("segment")
      .eq("user_id", userId)
      .maybeSingle();
    const stored = String((segRow as { segment?: string } | null)?.segment ?? "")
      .trim()
      .toLowerCase();
    if (stored) segments.add(stored);

    const { data: profile } = await admin
      .from("user_profiles")
      .select("tier")
      .eq("id", userId)
      .maybeSingle();
    const tier = String((profile as { tier?: string } | null)?.tier ?? "")
      .trim()
      .toLowerCase();
    if (tier) {
      segments.add(`tier:${tier}`);
      segments.add(tier);
    }
  }

  return { suburbId, customerSegments: [...segments] };
}
