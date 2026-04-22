import type { BookingServiceId } from "@/components/booking/serviceCategories";
import {
  inferServiceGroupFromServiceId,
  inferServiceTypeFromServiceId,
  normalizeStep1ForService,
} from "@/components/booking/serviceCategories";
import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import { addDaysToYmd } from "@/lib/booking/dateYmdAddDays";

export type IntentDateHint = "today" | "tomorrow" | "next_week" | null;
export type IntentTimePreference = "morning" | "afternoon" | "evening" | "any";

export type ParsedBookingIntent = {
  service: BookingServiceId | null;
  rooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
  date: IntentDateHint;
  timePreference: IntentTimePreference;
  /** Free-text location if user mentioned an area */
  locationHint: string;
  confidence: number;
};

const MORNING = new Set(["morning", "am", "a.m."]);
const AFTERNOON = new Set(["afternoon", "midday", "lunch", "pm", "p.m."]);
const EVENING = new Set(["evening", "late", "after work", "night"]);

const EXTRA_ALIASES: Record<string, string> = {
  fridge: "inside-fridge",
  refrigerator: "inside-fridge",
  oven: "inside-oven",
  cabinets: "inside-cabinets",
  windows: "interior-windows",
  ironing: "ironing",
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function pickService(text: string): BookingServiceId | null {
  if (/\bair\s*bnb|airbnb|turnover|guest\b/i.test(text)) return "airbnb";
  if (/\bdeep\b/i.test(text)) return "deep";
  if (/\bmove\b|moving/i.test(text)) return "move";
  if (/\bcarpet\b/i.test(text)) return "carpet";
  if (/\bquick\b|express/i.test(text)) return "quick";
  if (/\bstandard\b|regular\b|normal\b|clean(ing)?\b/i.test(text)) return "standard";
  return null;
}

function extractRooms(text: string): number | null {
  const m =
    /(\d+)\s*[-]?\s*(bed|bedroom|br|room|bedrooms|rooms)\b/i.exec(text) ||
    /\b(one|two|three|four|five|1|2|3|4|5)\s*[-]?\s*(bed|bedroom|br|room)\b/i.exec(text);
  if (m) {
    const n = m[1]!;
    const map: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    if (map[n.toLowerCase()]) return map[n.toLowerCase()];
    const d = parseInt(n, 10);
    if (Number.isFinite(d) && d >= 1 && d <= 20) return d;
  }
  return null;
}

function extractBathrooms(text: string): number | null {
  const m = /(\d+)\s*(bath|bathroom|bathrooms)\b/i.exec(text);
  if (m) {
    const d = parseInt(m[1]!, 10);
    if (Number.isFinite(d) && d >= 1 && d <= 20) return d;
  }
  return null;
}

function extractExtras(text: string): string[] {
  const out: string[] = [];
  const t = norm(text);
  for (const [needle, id] of Object.entries(EXTRA_ALIASES)) {
    if (t.includes(needle) && !out.includes(id)) out.push(id);
  }
  return out;
}

function pickDate(text: string): IntentDateHint {
  const t = norm(text);
  if (/\btoday\b/.test(t)) return "today";
  if (/\btomorrow\b|\bnext day\b/.test(t)) return "tomorrow";
  if (/\bnext week\b/.test(t)) return "next_week";
  return null;
}

function pickTimePreference(text: string): IntentTimePreference {
  const t = norm(text);
  for (const w of MORNING) if (t.includes(w)) return "morning";
  for (const w of AFTERNOON) if (t.includes(w)) return "afternoon";
  for (const w of EVENING) if (t.includes(w)) return "evening";
  return "any";
}

/**
 * Rule-based intent parser. Swap implementation body for OpenAI later — keep the return shape stable.
 */
export function parseBookingIntent(message: string): ParsedBookingIntent {
  const text = typeof message === "string" ? message : "";
  const service: BookingServiceId = pickService(text) ?? "standard";
  const rooms = extractRooms(text) ?? 2;
  const bathrooms = extractBathrooms(text) ?? Math.min(rooms, 3);
  const extras = extractExtras(text);

  let confidence = 0.5;
  if (extractRooms(text) != null) confidence += 0.2;
  if (pickService(text) != null) confidence += 0.15;
  if (pickDate(text) != null) confidence += 0.1;
  if (pickTimePreference(text) !== "any") confidence += 0.05;

  return {
    service,
    rooms,
    bathrooms,
    extraRooms: 0,
    extras,
    date: pickDate(text),
    timePreference: pickTimePreference(text),
    locationHint: "",
    confidence: Math.min(1, confidence),
  };
}

/** Map parsed intent + defaults into Step 1 state for pricing. */
export function intentToStep1State(
  intent: ParsedBookingIntent,
  overrides?: Partial<Pick<BookingStep1State, "location" | "selectedCategory">>,
): BookingStep1State {
  const service = intent.service;
  const selectedCategory =
    overrides?.selectedCategory ?? (service ? inferServiceGroupFromServiceId(service) : null);
  const service_group = service ? inferServiceGroupFromServiceId(service) : null;
  const service_type = service ? inferServiceTypeFromServiceId(service) : null;

  const raw: BookingStep1State = {
    selectedCategory: service ? selectedCategory : null,
    service,
    service_group,
    service_type,
    location: overrides?.location ?? "",
    propertyType: null,
    rooms: intent.rooms,
    bathrooms: intent.bathrooms,
    extraRooms: intent.extraRooms,
    extras: intent.extras,
  };
  return normalizeStep1ForService(raw);
}

/** Resolve relative date hints to a concrete `YYYY-MM-DD` (Johannesburg “today” passed in). */
export function resolveIntentDateYmd(intent: ParsedBookingIntent, todayYmd: string): string {
  switch (intent.date) {
    case "today":
      return todayYmd;
    case "tomorrow":
      return addDaysToYmd(todayYmd, 1);
    case "next_week":
      return addDaysToYmd(todayYmd, 7);
    default:
      return addDaysToYmd(todayYmd, 1);
  }
}
