import { NextResponse } from "next/server";
import { loadCachedBookingV2Catalog } from "@/lib/booking-v2/loadBookingV2Catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type {
  LiveExtra,
  LiveServiceConfig,
  ServicesCatalog,
  BookingV2CatalogPayload,
} from "@/lib/booking-v2/loadBookingV2Catalog";
export type { BookingV2FeesConfig } from "@/lib/booking-v2/types";

export async function GET() {
  const startedAt = performance.now();
  const { catalog, feesConfig, scheduling, activeServiceSlugs } = await loadCachedBookingV2Catalog();
  return NextResponse.json(
    { catalog, feesConfig, scheduling, activeServiceSlugs },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        "Server-Timing": `catalog;dur=${(performance.now() - startedAt).toFixed(1)}`,
      },
    },
  );
}
