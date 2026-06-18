import { NextResponse } from "next/server";
import { loadBookingV2Catalog } from "@/lib/booking-v2/loadBookingV2Catalog";

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
  const { catalog, feesConfig } = await loadBookingV2Catalog();
  return NextResponse.json({ catalog, feesConfig });
}
