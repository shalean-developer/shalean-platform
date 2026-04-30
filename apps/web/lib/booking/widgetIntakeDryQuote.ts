import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { mapWidgetExtrasToStep1Ids } from "@/lib/booking/bookingWidgetDraft";
import { serverWidgetQuoteFromIntake } from "@/lib/booking/insertWidgetServerBooking";
import type { HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";
import type { WidgetIntakePayload } from "@/lib/booking/bookingWidgetDraft";

export function parseScopeRoomInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  if (r < 1 || r > 20) return null;
  return r;
}

export function parseWidgetServiceKey(v: unknown): HomeWidgetServiceKey | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "standard" || s === "airbnb" || s === "deep" || s === "move" || s === "carpet") return s;
  return null;
}

export type WidgetDryQuoteResult =
  | { ok: true; totalPaidZar: number }
  | { ok: false; error: string; status: number };

/**
 * Server-only ZAR quote for homepage / conversion widget intake (same engine as widget insert).
 */
export async function quoteWidgetIntakeFromRecord(
  admin: SupabaseClient,
  rec: Record<string, unknown>,
): Promise<WidgetDryQuoteResult> {
  const service = parseWidgetServiceKey(rec.service);
  const bedrooms = parseScopeRoomInt(rec.bedrooms ?? rec.rooms);
  const bathrooms = parseScopeRoomInt(rec.bathrooms);
  if (!service || bedrooms == null || bathrooms == null) {
    return {
      ok: false,
      error:
        "Requires service (standard|airbnb|deep|move|carpet), bedrooms or rooms, and bathrooms (1–20 each).",
      status: 400,
    };
  }
  const extraRooms =
    typeof rec.extraRooms === "number" && Number.isFinite(rec.extraRooms)
      ? Math.max(0, Math.min(10, Math.round(rec.extraRooms)))
      : 0;
  const extrasIn = Array.isArray(rec.extras)
    ? (rec.extras as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const date = typeof rec.date === "string" ? rec.date.trim() : "";
  const timeRaw = typeof rec.time === "string" ? rec.time.trim() : "";
  const time = timeRaw.length >= 5 ? timeRaw.slice(0, 5) : timeRaw;
  if (!date || !time) {
    return { ok: false, error: "date and time are required.", status: 400 };
  }
  const intake: WidgetIntakePayload = {
    bedrooms,
    bathrooms,
    extraRooms,
    service,
    extras: mapWidgetExtrasToStep1Ids(extrasIn),
    date,
    time,
    location: typeof rec.location === "string" ? rec.location.trim() : "",
  };
  try {
    const totalPaidZar = await serverWidgetQuoteFromIntake(admin, intake);
    return { ok: true, totalPaidZar };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Quote failed.", status: 500 };
  }
}
