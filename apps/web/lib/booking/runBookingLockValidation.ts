import { extrasSnapshotAligned } from "@/lib/booking/extrasSnapshot";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import { quoteCheckoutZarWithSnapshot } from "@/lib/pricing/pricingEngineSnapshot";
import { normalizeVipTier } from "@/lib/pricing/vipTier";

function normalizeTime(t: string): string {
  return t.trim().slice(0, 5);
}

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

export type RunBookingLockValidationResult =
  | { valid: true; reason?: string }
  | { valid: false; reason: string; httpStatus: number };

/**
 * Shared pre-payment lock validation (slot overlap, extras, date/time). Used by `/api/booking/validate` and `/api/booking/revalidate-lock`.
 */
export async function runBookingLockValidation(body: Record<string, unknown>): Promise<RunBookingLockValidationResult> {
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
  if (lockedParsed && !extrasSnapshotAligned(lockedParsed)) {
    return { valid: false, reason: "extras_mismatch", httpStatus: 400 };
  }
  if (
    lockedParsed &&
    typeof lockedParsed.time === "string" &&
    lockedParsed.time.trim() &&
    typeof lockedParsed.rooms === "number" &&
    typeof lockedParsed.bathrooms === "number"
  ) {
    const admin = getSupabaseAdmin();
    const snap = admin ? await buildPricingRatesSnapshotFromDb(admin) : null;
    if (snap) {
      const tier = normalizeVipTier(lockedParsed.vipTier);
      const dyn =
        typeof lockedParsed.dynamicSurgeFactor === "number" &&
        lockedParsed.dynamicSurgeFactor >= 0.8 &&
        lockedParsed.dynamicSurgeFactor <= 1.2
          ? lockedParsed.dynamicSurgeFactor
          : 1;
      const q = quoteCheckoutZarWithSnapshot(
        snap,
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
    }
  } else {
    const durationRaw = Number(body.duration_minutes ?? body.durationMinutes ?? 120);
    durationMinutes = Number.isFinite(durationRaw) ? Math.max(30, Math.round(durationRaw)) : 120;
  }

  const normalizedDate = normalizeDateYmd(dateRaw);
  const normalizedTime = timeRaw ? normalizeTime(timeRaw) : "";

  if (!normalizedDate || !normalizedTime) {
    return { valid: false, reason: "missing_fields", httpStatus: 400 };
  }

  const selectedStart = toMinutes(normalizedTime);
  if (selectedStart == null) {
    return { valid: false, reason: "bad_time", httpStatus: 400 };
  }
  const selectedEnd = selectedStart + durationMinutes;

  if (!cleanerId) {
    return { valid: true, reason: "no_cleaner_skipped_overlap" };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { valid: false, reason: "unavailable", httpStatus: 503 };
  }

  try {
    const { data: cleanerRow, error: cleanerErr } = await admin
      .from("cleaners")
      .select("id")
      .eq("id", cleanerId)
      .maybeSingle();

    if (cleanerErr || !cleanerRow) {
      return { valid: false, reason: "cleaner_not_found", httpStatus: 200 };
    }

    const { data: bookingRows, error: bookErr } = await admin
      .from("bookings")
      .select("id, status, date, booking_date, time, start_time, end_time, cleaner_id")
      .eq("cleaner_id", cleanerId)
      .in("status", ["confirmed", "pending"]);

    if (bookErr) {
      console.error("[LOCK VALIDATION FAILED]", bookErr.message);
      return { valid: false, reason: "availability_check_failed", httpStatus: 503 };
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

    if (conflict) {
      return { valid: false, reason: "slot_conflict", httpStatus: 200 };
    }
    return { valid: true as const };
  } catch (e) {
    console.error("[LOCK VALIDATION FAILED]", e);
    return { valid: false, reason: "availability_check_failed", httpStatus: 503 };
  }
}
