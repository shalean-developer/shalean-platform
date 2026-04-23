import { NextResponse } from "next/server";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { quoteCheckoutZar } from "@/lib/pricing/pricingEngine";
import { normalizeVipTier } from "@/lib/pricing/vipTier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeTime(t: string): string {
  return t.trim().slice(0, 5);
}

/** Prefer plain `YYYY-MM-DD`; otherwise normalise via ISO date part. */
function normalizeDateYmd(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0] ?? null;
}

function toMinutes(hm: string): number | null {
  const n = normalizeTime(hm);
  if (!/^\d{2}:\d{2}$/.test(n)) return null;
  const [h, m] = n.split(":").map(Number);
  return h * 60 + m;
}

function bookingRowDateYmd(row: {
  date?: string | null;
  booking_date?: string | null;
}): string | null {
  const a = row.booking_date?.trim() ?? "";
  const b = row.date?.trim() ?? "";
  return normalizeDateYmd(a || b) || null;
}

function bookingWindowMinutes(row: {
  time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}): { start: number; end: number } | null {
  const startRaw = row.start_time ?? row.time ?? null;
  if (!startRaw || typeof startRaw !== "string") return null;
  const start = toMinutes(startRaw);
  if (start == null) return null;
  const endRaw = row.end_time;
  if (endRaw && typeof endRaw === "string") {
    const end = toMinutes(endRaw);
    if (end != null && end > start) return { start, end };
  }
  return { start, end: start + 120 };
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return bStart < aEnd && bEnd > aStart;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Pre-pay: same cleaner has no overlapping `pending` / `confirmed` booking on that date.
 * Does not re-run roster / availability — avoids false negatives from format or engine drift.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ valid: false, reason: "bad_json" }, { status: 400 });
  }

  const lockedPayload = [body.locked, body.locked_booking].find(isRecord) ?? null;

  const cleanerFromLock =
    lockedPayload && typeof lockedPayload.cleaner_id === "string"
      ? lockedPayload.cleaner_id.trim()
      : lockedPayload && typeof lockedPayload.cleanerId === "string"
        ? (lockedPayload.cleanerId as string).trim()
        : "";

  const cleanerFromRoot =
    typeof body.cleaner_id === "string"
      ? body.cleaner_id.trim()
      : typeof body.cleanerId === "string"
        ? body.cleanerId.trim()
        : "";

  const cleanerId = cleanerFromLock || cleanerFromRoot;

  const dateRaw =
    (lockedPayload && typeof lockedPayload.date === "string" ? lockedPayload.date : null) ??
    (typeof body.date === "string" ? body.date : "") ??
    "";
  const timeRaw =
    (lockedPayload && typeof lockedPayload.time === "string" ? lockedPayload.time : null) ??
    (typeof body.time === "string" ? body.time : "") ??
    "";

  let durationMinutes = 120;
  const lockedParsed = lockedPayload ? parseLockedBookingFromUnknown(lockedPayload) : null;
  if (
    lockedParsed &&
    typeof lockedParsed.time === "string" &&
    lockedParsed.time.trim() &&
    typeof lockedParsed.rooms === "number" &&
    typeof lockedParsed.bathrooms === "number"
  ) {
    const tier = normalizeVipTier(lockedParsed.vipTier);
    const dyn =
      typeof lockedParsed.dynamicSurgeFactor === "number" &&
      lockedParsed.dynamicSurgeFactor >= 0.8 &&
      lockedParsed.dynamicSurgeFactor <= 1.2
        ? lockedParsed.dynamicSurgeFactor
        : 1;
    const q = quoteCheckoutZar(
      {
        service: lockedParsed.service,
        serviceType: lockedParsed.service_type,
        rooms: lockedParsed.rooms,
        bathrooms: lockedParsed.bathrooms,
        extraRooms: lockedParsed.extraRooms,
        extras: lockedParsed.extras,
      },
      lockedParsed.time.trim().slice(0, 5),
      tier,
      {
        dynamicAdjustment: dyn,
        cleanersCount: lockedParsed.cleanersCount,
      },
    );
    durationMinutes = Math.max(30, Math.round(q.hours * 60));
  } else {
    const durationRaw = Number(body.duration_minutes ?? body.durationMinutes ?? 120);
    durationMinutes = Number.isFinite(durationRaw) ? Math.max(30, Math.round(durationRaw)) : 120;
  }

  const normalizedDate = normalizeDateYmd(dateRaw);
  const normalizedTime = timeRaw ? normalizeTime(timeRaw) : "";

  if (!normalizedDate || !normalizedTime) {
    console.log({
      cleaner_id: cleanerId,
      date: dateRaw,
      time: timeRaw,
      reason: "validation_result",
      detail: "missing_fields",
    });
    return NextResponse.json({ valid: false, reason: "missing_fields" }, { status: 400 });
  }

  const selectedStart = toMinutes(normalizedTime);
  if (selectedStart == null) {
    console.log({
      cleaner_id: cleanerId,
      date: normalizedDate,
      time: timeRaw,
      reason: "validation_result",
      detail: "bad_time",
    });
    return NextResponse.json({ valid: false, reason: "bad_time" }, { status: 400 });
  }
  const selectedEnd = selectedStart + durationMinutes;

  /** Auto-assign checkout — no cleaner to check for calendar conflicts. */
  if (!cleanerId) {
    console.log({
      date: normalizedDate,
      time: normalizedTime,
      reason: "validation_result",
      valid: true,
      detail: "no_cleaner_skipped_overlap",
    });
    return NextResponse.json({ valid: true, reason: "no_cleaner_skipped_overlap" });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ valid: false, reason: "unavailable" }, { status: 503 });
  }

  try {
    const { data: cleanerRow, error: cleanerErr } = await admin
      .from("cleaners")
      .select("id")
      .eq("id", cleanerId)
      .maybeSingle();

    if (cleanerErr || !cleanerRow) {
      console.log({
        cleaner_id: cleanerId,
        date: normalizedDate,
        time: normalizedTime,
        reason: "validation_result",
        detail: "cleaner_not_found",
      });
      return NextResponse.json({ valid: false, reason: "cleaner_not_found" });
    }

    const { data: bookingRows, error: bookErr } = await admin
      .from("bookings")
      .select("id, status, date, booking_date, time, start_time, end_time, cleaner_id")
      .eq("cleaner_id", cleanerId)
      .in("status", ["confirmed", "pending"]);

    if (bookErr) {
      console.error("[api/booking/validate] bookings query", bookErr.message);
      console.log({
        cleaner_id: cleanerId,
        date: normalizedDate,
        time: normalizedTime,
        reason: "validation_result",
        detail: "bookings_query_failed",
      });
      return NextResponse.json({ valid: true });
    }

    const rows = (bookingRows ?? []) as Array<{
      id: string;
      status: string | null;
      date?: string | null;
      booking_date?: string | null;
      time?: string | null;
      start_time?: string | null;
      end_time?: string | null;
    }>;

    let conflict = false;
    for (const row of rows) {
      const rowDate = bookingRowDateYmd(row);
      if (!rowDate || rowDate !== normalizedDate) continue;

      const win = bookingWindowMinutes(row);
      if (!win) continue;

      if (overlaps(selectedStart, selectedEnd, win.start, win.end)) {
        conflict = true;
        break;
      }
    }

    const valid = !conflict;

    console.log({
      cleaner_id: cleanerId,
      date: normalizedDate,
      time: normalizedTime,
      reason: "validation_result",
      valid,
      bookingsChecked: rows.length,
    });

    return NextResponse.json({ valid });
  } catch (e) {
    console.error("[api/booking/validate]", e);
    console.log({
      cleaner_id: cleanerId,
      date: normalizedDate,
      time: normalizedTime,
      reason: "validation_result",
      detail: "exception",
    });
    return NextResponse.json({ valid: true });
  }
}
