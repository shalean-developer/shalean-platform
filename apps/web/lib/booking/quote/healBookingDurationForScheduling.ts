import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBookingServiceId } from "@/components/booking/serviceCategories";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";
import {
  estimatedFinishAtIso,
  resolvePersistedBookingDurationMinutes,
  type BookingDurationRowLike,
} from "@/lib/booking/quote/bookingQuotePersistence";
import {
  durationHoursFromMinutes,
  resolveLegacyJobDurationWorkload,
} from "@/lib/booking/quote/resolveBookingDurationWorkload";
import { MIN_REASONABLE_BOOKING_DURATION_MINUTES } from "@/lib/booking/durationMinutesIntegrity";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type HealableBookingDurationRow = BookingDurationRowLike & {
  id: string;
  date?: string | null;
  time?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  extras?: unknown;
  service?: string | null;
  service_slug?: string | null;
  price_snapshot?: unknown;
  is_team_job?: boolean | null;
  team_member_count_snapshot?: number | null;
  cleaner_count?: number | null;
};

function positiveRoomCount(v: unknown): number | null {
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    v = n;
  }
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  if (n < 1 || n > 50) return null;
  return n;
}

function extrasFromRow(row: HealableBookingDurationRow): string[] {
  if (Array.isArray(row.extras)) {
    return row.extras.filter((e): e is string => typeof e === "string" && e.trim().length > 0).map((e) => e.trim());
  }
  const snap = row.booking_snapshot;
  if (snap && typeof snap === "object") {
    const selected = (snap as { selectedExtras?: unknown }).selectedExtras;
    if (Array.isArray(selected)) {
      return selected
        .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
        .map((e) => e.trim());
    }
    const locked = parseLockedBookingFromUnknown((snap as { locked?: unknown }).locked);
    if (locked?.extras?.length) {
      return locked.extras
        .map((e) => {
          if (typeof e === "string") return e.trim();
          if (e && typeof e === "object" && "id" in e && typeof (e as { id?: unknown }).id === "string") {
            return String((e as { id: string }).id).trim();
          }
          return "";
        })
        .filter((e) => e.length > 0);
    }
  }
  return [];
}

function roomsBathsFromRow(row: HealableBookingDurationRow): {
  rooms: number;
  bathrooms: number;
  extraRooms: number;
  usedDefaults: boolean;
} {
  const locked = parseLockedBookingFromUnknown(
    row.booking_snapshot && typeof row.booking_snapshot === "object"
      ? (row.booking_snapshot as { locked?: unknown }).locked
      : null,
  );
  const snap =
    row.booking_snapshot && typeof row.booking_snapshot === "object"
      ? (row.booking_snapshot as { serviceDetails?: Record<string, unknown> })
      : null;
  const details = snap?.serviceDetails && typeof snap.serviceDetails === "object" ? snap.serviceDetails : null;

  const lockedRaw =
    locked && typeof locked === "object" ? (locked as Record<string, unknown>) : null;

  const rooms =
    positiveRoomCount(row.rooms) ??
    positiveRoomCount(locked?.rooms) ??
    positiveRoomCount(lockedRaw?.bedrooms) ??
    positiveRoomCount(details?.bedrooms) ??
    positiveRoomCount(details?.carpetRooms) ??
    null;
  const bathrooms =
    positiveRoomCount(row.bathrooms) ??
    positiveRoomCount(locked?.bathrooms) ??
    positiveRoomCount(details?.bathrooms) ??
    null;
  const extraRooms =
    positiveRoomCount(locked?.extraRooms) ?? positiveRoomCount(details?.extraRooms) ?? 0;

  if (rooms != null && bathrooms != null) {
    return { rooms, bathrooms, extraRooms: extraRooms ?? 0, usedDefaults: false };
  }
  // Admin ops default when scope was never persisted — same seed as edit-details UI.
  return {
    rooms: rooms ?? 2,
    bathrooms: bathrooms ?? 1,
    extraRooms: extraRooms ?? 0,
    usedDefaults: true,
  };
}

function serviceForWorkload(row: HealableBookingDurationRow): ReturnType<typeof parseBookingServiceId> {
  const locked = parseLockedBookingFromUnknown(
    row.booking_snapshot && typeof row.booking_snapshot === "object"
      ? (row.booking_snapshot as { locked?: unknown }).locked
      : null,
  );
  const fromLocked = typeof locked?.service === "string" ? locked.service.trim() : "";
  if (fromLocked) {
    const parsed = parseBookingServiceId(fromLocked);
    if (parsed) return parsed;
  }
  const slug = String(row.service_slug ?? row.service ?? "").trim();
  return slug ? parseBookingServiceId(slug) : null;
}

function teamMemberCountForDuration(row: HealableBookingDurationRow): number {
  const snap = row.team_member_count_snapshot;
  if (typeof snap === "number" && Number.isFinite(snap) && snap >= 1) {
    return Math.min(20, Math.round(snap));
  }
  const cleanerCount = row.cleaner_count;
  if (typeof cleanerCount === "number" && Number.isFinite(cleanerCount) && cleanerCount >= 1) {
    return Math.min(20, Math.round(cleanerCount));
  }
  return row.is_team_job === true ? 2 : 1;
}

function minutesFromPriceSnapshot(row: HealableBookingDurationRow): number | null {
  const snap = row.price_snapshot;
  if (!snap || typeof snap !== "object") return null;
  const hours = (snap as { duration_hours?: unknown }).duration_hours;
  if (typeof hours === "number" && Number.isFinite(hours) && hours > 0) {
    const minutes = Math.round(hours * 60);
    if (minutes >= MIN_REASONABLE_BOOKING_DURATION_MINUTES) return minutes;
  }
  return null;
}

function computeHealedDurationMinutes(row: HealableBookingDurationRow): {
  minutes: number;
  source: string;
  usedRoomDefaults: boolean;
} | null {
  const fromPersisted = resolvePersistedBookingDurationMinutes(row);
  if (fromPersisted != null) {
    return { minutes: fromPersisted, source: "persisted", usedRoomDefaults: false };
  }

  const fromPriceSnap = minutesFromPriceSnapshot(row);
  if (fromPriceSnap != null) {
    return { minutes: fromPriceSnap, source: "price_snapshot.duration_hours", usedRoomDefaults: false };
  }

  const scope = roomsBathsFromRow(row);
  const service = serviceForWorkload(row);
  const teamCount = teamMemberCountForDuration(row);
  const workload = resolveLegacyJobDurationWorkload(
    {
      service: service,
      rooms: scope.rooms,
      bathrooms: scope.bathrooms,
      extraRooms: scope.extraRooms,
      extras: extrasFromRow(row),
    },
    teamCount,
  );
  // Wall-clock on-site time: prefer team-scaled minutes when a roster is present.
  const candidate =
    teamCount > 1 &&
    typeof workload.team_scaled_duration_minutes === "number" &&
    Number.isFinite(workload.team_scaled_duration_minutes)
      ? workload.team_scaled_duration_minutes
      : workload.duration_minutes;
  if (
    typeof candidate !== "number" ||
    !Number.isFinite(candidate) ||
    candidate < MIN_REASONABLE_BOOKING_DURATION_MINUTES
  ) {
    return null;
  }
  return {
    minutes: Math.round(candidate),
    source:
      teamCount > 1
        ? scope.usedDefaults
          ? `workload_room_defaults_team_${teamCount}`
          : `workload_from_rooms_team_${teamCount}`
        : scope.usedDefaults
          ? "workload_room_defaults"
          : "workload_from_rooms",
    usedRoomDefaults: scope.usedDefaults,
  };
}

function durationPersistPatch(
  row: HealableBookingDurationRow,
  minutes: number,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    duration_minutes: minutes,
    estimated_duration_minutes: minutes,
    duration_hours: durationHoursFromMinutes(minutes),
  };
  const finishAt = estimatedFinishAtIso(row.date, row.time, minutes);
  if (finishAt) patch.estimated_finish_at = finishAt;
  return patch;
}

/**
 * Ensure a booking has scheduling duration before admin assign / eligibility.
 * When minute columns and quote fields are empty, recompute from rooms/service
 * (or price_snapshot hours) and persist so assign can proceed.
 */
export async function healBookingDurationForScheduling(
  admin: SupabaseClient,
  row: HealableBookingDurationRow,
): Promise<{
  durationMinutes: number | null;
  healed: boolean;
  source: string | null;
  usedRoomDefaults: boolean;
}> {
  const computed = computeHealedDurationMinutes(row);
  if (computed == null) {
    return { durationMinutes: null, healed: false, source: null, usedRoomDefaults: false };
  }

  const columnMissing =
    typeof row.duration_minutes !== "number" ||
    !Number.isFinite(row.duration_minutes) ||
    Math.round(row.duration_minutes) < MIN_REASONABLE_BOOKING_DURATION_MINUTES;

  if (!columnMissing && computed.source === "persisted") {
    return {
      durationMinutes: computed.minutes,
      healed: false,
      source: computed.source,
      usedRoomDefaults: false,
    };
  }

  if (!columnMissing) {
    return {
      durationMinutes: computed.minutes,
      healed: false,
      source: computed.source,
      usedRoomDefaults: computed.usedRoomDefaults,
    };
  }

  const patch = durationPersistPatch(row, computed.minutes);
  const { error } = await admin.from("bookings").update(patch).eq("id", row.id);
  if (error) {
    void logSystemEvent({
      level: "warn",
      source: "healBookingDurationForScheduling",
      message: "Failed to persist healed duration",
      context: { bookingId: row.id, error: error.message, minutes: computed.minutes },
    });
    // Still return computed minutes so this assign attempt can proceed.
    return {
      durationMinutes: computed.minutes,
      healed: false,
      source: computed.source,
      usedRoomDefaults: computed.usedRoomDefaults,
    };
  }

  void logSystemEvent({
    level: "info",
    source: "healBookingDurationForScheduling",
    message: "Persisted missing booking duration for scheduling",
    context: {
      bookingId: row.id,
      minutes: computed.minutes,
      healSource: computed.source,
      usedRoomDefaults: computed.usedRoomDefaults,
    },
  });

  return {
    durationMinutes: computed.minutes,
    healed: true,
    source: computed.source,
    usedRoomDefaults: computed.usedRoomDefaults,
  };
}

/** Pure helper for tests — same resolution path without DB write. */
export function resolveHealedBookingDurationMinutes(row: HealableBookingDurationRow): number | null {
  return computeHealedDurationMinutes(row)?.minutes ?? null;
}
