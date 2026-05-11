import { NextResponse } from "next/server";
import type { AvailableCleanerDto } from "@/lib/booking/cleanerMarketingDto";
import { cleanerAccountEligibleForCustomerBooking } from "@/lib/booking/cleanerSlotEligibility";
import { getSupabaseAdmin, supabaseAdminNotConfiguredBody } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Marketing / browse roster only — **not** slot-aware; never use for booking
 * eligibility. Kept module-local because Next.js 16 forbids non-handler
 * exports from `route.ts` files (see the OmitWithTag type-check error). The
 * `AvailableCleanerDto` type lives in `@/lib/booking/cleanerMarketingDto`;
 * import it directly from there.
 */
const CLEANERS_AVAILABLE_NOT_SLOT_AWARE =
  "This endpoint is not slot-aware. Use GET /api/booking/cleaners with date, time, duration, locationId, and service for scheduling.";

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json(supabaseAdminNotConfiguredBody(), { status: 503 });

  const { data, error } = await admin
    .from("cleaners")
    .select("id, full_name, rating, jobs_completed, status, is_active, is_available")
    .eq("is_active", true)
    .eq("is_available", true)
    .order("rating", { ascending: false })
    .limit(5);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cleaners: AvailableCleanerDto[] = (Array.isArray(data) ? data : [])
    .filter((row) =>
      cleanerAccountEligibleForCustomerBooking(
        row as { is_active?: boolean | null; is_available?: boolean | null; status?: string | null },
      ),
    )
    .map((row) => {
      const r = row as {
        id?: string;
        full_name?: string | null;
        rating?: number | null;
        jobs_completed?: number | null;
      };
      const id = typeof r.id === "string" ? r.id : "";
      const name = typeof r.full_name === "string" && r.full_name.trim() ? r.full_name.trim() : "Cleaner";
      const ratingNum = r.rating != null && Number.isFinite(Number(r.rating)) ? Number(r.rating) : 0;
      const jobs =
        r.jobs_completed != null && Number.isFinite(Number(r.jobs_completed)) ? Math.max(0, Math.floor(Number(r.jobs_completed))) : 0;
      const recommendPct = Math.min(100, Math.max(0, Math.round((ratingNum / 5) * 100)));
      return { id, name, rating: ratingNum, jobs, recommendPct, image: null as string | null };
    })
    .filter((c) => c.id.length > 0);

  const res = NextResponse.json({
    cleaners,
    /** Machine-readable guardrail for API consumers */
    notSlotAware: true as const,
    schedulingEndpoint: "/api/booking/cleaners",
    warning: CLEANERS_AVAILABLE_NOT_SLOT_AWARE,
  });
  res.headers.set("X-Shalean-Cleaners-Available", "not-slot-aware");
  return res;
}
