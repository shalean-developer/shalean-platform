/**
 * Shared booking-v2 duration estimate (display + slot windows).
 * Mirrors apps/web `resolveBookingV2DurationWorkload` → canonical duration_minutes
 * and optional team_scaled_duration_minutes.
 */

export type BookingV2DurationServiceSlug =
  | "regular-cleaning"
  | "deep-cleaning"
  | "moving-cleaning"
  | "office-cleaning"
  | "carpet-cleaning"
  | "airbnb-cleaning"
  | string;

const V2_TO_CANONICAL: Record<string, string> = {
  "regular-cleaning": "standard",
  "deep-cleaning": "deep",
  "moving-cleaning": "move",
  "office-cleaning": "standard",
  "carpet-cleaning": "carpet",
  "airbnb-cleaning": "airbnb",
};

type DurationPolicy = {
  baseMinutes: number;
  bedroomMinutes: number;
  bathroomMinutes: number;
  extraRoomMinutes: number;
  minMinutes: number;
  maxMinutes: number;
};

const SERVICE_DURATION: Record<string, DurationPolicy> = {
  standard: {
    baseMinutes: 180,
    bedroomMinutes: 30,
    bathroomMinutes: 30,
    extraRoomMinutes: 18,
    minMinutes: 120,
    maxMinutes: 540,
  },
  airbnb: {
    baseMinutes: 210,
    bedroomMinutes: 25,
    bathroomMinutes: 30,
    extraRoomMinutes: 15,
    minMinutes: 150,
    maxMinutes: 540,
  },
  deep: {
    baseMinutes: 240,
    bedroomMinutes: 45,
    bathroomMinutes: 45,
    extraRoomMinutes: 30,
    minMinutes: 180,
    maxMinutes: 540,
  },
  move: {
    baseMinutes: 240,
    bedroomMinutes: 45,
    bathroomMinutes: 45,
    extraRoomMinutes: 30,
    minMinutes: 180,
    maxMinutes: 540,
  },
  carpet: {
    baseMinutes: 180,
    bedroomMinutes: 40,
    bathroomMinutes: 0,
    extraRoomMinutes: 25,
    minMinutes: 120,
    maxMinutes: 480,
  },
};

const EXTRA_DURATION_MINUTES: Record<string, number> = {
  "inside-cabinets": 30,
  "inside-oven": 45,
  "inside-fridge": 30,
  "interior-walls": 60,
  ironing: 30,
  laundry: 30,
  "interior-windows": 45,
  "water-plants": 15,
  "balcony-cleaning": 45,
  "carpet-cleaning": 60,
  "ceiling-cleaning": 45,
  "garage-cleaning": 45,
  "mattress-cleaning": 45,
  "outside-windows": 45,
};

/** Web parity: missing → 0 (canonical engine then clamps rooms/baths ≥ 1 when applicable). */
function parseServiceDetailCount(
  details: Record<string, string | number | boolean>,
  key: string,
): number {
  const raw = details[key];
  if (raw === "" || raw == null) return 0;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(25, Math.round(n)) : 0;
}

export type BookingV2DurationResult = {
  /** Unscaled job minutes (pricing / quote SoT). */
  duration_minutes: number;
  /** Wall-clock with team scaling (slot windows). */
  team_scaled_duration_minutes: number;
  team_member_count: number;
};

export function resolveBookingV2DurationEstimate(input: {
  serviceSlug: BookingV2DurationServiceSlug;
  serviceDetails: Record<string, string | number | boolean>;
  selectedExtras: readonly string[];
  cleanerMode?: "team" | "individual_cleaners";
  cleanerCount?: number;
  minDurationHours?: number;
  maxDurationHours?: number;
}): BookingV2DurationResult {
  const serviceSlug = String(input.serviceSlug);
  const canonical = V2_TO_CANONICAL[serviceSlug] ?? "standard";
  const policy = SERVICE_DURATION[canonical] ?? SERVICE_DURATION.standard;

  let rooms = parseServiceDetailCount(input.serviceDetails, "bedrooms");
  let bathrooms = parseServiceDetailCount(input.serviceDetails, "bathrooms");
  let extraRooms = parseServiceDetailCount(input.serviceDetails, "extraRooms");

  if (serviceSlug === "carpet-cleaning") {
    rooms = parseServiceDetailCount(input.serviceDetails, "carpetRooms");
    bathrooms = 0;
    extraRooms = 0;
  } else if (serviceSlug === "office-cleaning") {
    rooms = 0;
    extraRooms = 0;
  }

  // Canonical clamp for standard/airbnb/deep/move (not office zeros).
  if (serviceSlug !== "office-cleaning" && serviceSlug !== "carpet-cleaning") {
    rooms = Math.max(1, rooms);
    bathrooms = Math.max(1, bathrooms);
    extraRooms = Math.max(0, extraRooms);
  } else if (serviceSlug === "carpet-cleaning") {
    rooms = Math.max(1, rooms);
  }

  let extraMinutes = 0;
  const seen = new Set<string>();
  for (const raw of input.selectedExtras) {
    const slug = String(raw ?? "").trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    extraMinutes += EXTRA_DURATION_MINUTES[slug] ?? 0;
  }

  let raw =
    policy.baseMinutes +
    rooms * policy.bedroomMinutes +
    bathrooms * policy.bathroomMinutes +
    extraRooms * policy.extraRoomMinutes +
    extraMinutes;

  if (rooms >= 10 || bathrooms >= 6 || extraRooms >= 8) {
    raw += 60;
  }

  let duration = Math.round(raw);
  const minMinutes =
    typeof input.minDurationHours === "number" && input.minDurationHours > 0
      ? Math.round(input.minDurationHours * 60)
      : policy.minMinutes;
  const maxMinutes =
    typeof input.maxDurationHours === "number" && input.maxDurationHours > 0
      ? Math.round(input.maxDurationHours * 60)
      : policy.maxMinutes;

  if (duration < minMinutes) duration = minMinutes;
  if (duration > maxMinutes) duration = maxMinutes;
  duration = Math.max(30, duration);

  const cleanerMode = input.cleanerMode ?? "individual_cleaners";
  const cleanerCount = Math.max(1, Math.round(Number(input.cleanerCount ?? 1)) || 1);
  const teamMemberCount = cleanerMode === "team" ? 3 : cleanerCount;
  const divisor = 1 + (Math.max(1, teamMemberCount) - 1) * 0.65;
  const teamScaled = Math.max(60, Math.round(duration / divisor));

  return {
    duration_minutes: duration,
    team_scaled_duration_minutes: teamMemberCount > 1 ? teamScaled : duration,
    team_member_count: teamMemberCount,
  };
}

/** Convenience: unscaled minutes (pricing parity with web estimate). */
export function estimateBookingV2DurationMinutes(
  input: Parameters<typeof resolveBookingV2DurationEstimate>[0],
): number {
  return resolveBookingV2DurationEstimate(input).duration_minutes;
}
