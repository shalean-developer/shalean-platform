import type { VipTier } from "@/lib/pricing/vipTier";
import { normalizeVipTier } from "@/lib/pricing/vipTier";
import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import {
  inferServiceGroupFromServiceId,
  inferServiceTypeFromServiceId,
  parseBookingServiceId,
} from "@/components/booking/serviceCategories";
import type { BookingSnapshotFlatV1 } from "@/lib/booking/paystackChargeTypes";
import { clearSelectedCleanerFromStorage } from "@/lib/booking/cleanerSelection";
import { normalizeExtraRoomsRaw } from "@/lib/pricing/pricingEngine";
import { PRICING_ENGINE_ALGORITHM_VERSION } from "@/lib/pricing/engineVersion";
import type { ExtraLineItem } from "@/lib/pricing/extrasConfig";

export const BOOKING_LOCKED_KEY = "booking_locked";

export const BOOKING_LOCKED_EVENT = "booking-locked-change";

export type LockedBooking = BookingStep1State & {
  /** Local calendar date `YYYY-MM-DD` */
  date: string;
  time: string;
  finalPrice: number;
  finalHours: number;
  /** Same as `finalPrice` when locked from `/api/booking/lock` (display / logging alias). */
  price?: number;
  /** Same as `finalHours` when locked from API. */
  duration?: number;
  /** Demand multiplier applied after VIP discount */
  surge: number;
  surgeLabel?: string;
  cleanersCount?: number;
  /**
   * Optional AI dynamic layer (0.8–1.2) multiplied with surge in `quoteCheckoutZar`.
   * Omitted in legacy web locks (= 1).
   */
  dynamicSurgeFactor?: number;
  /** Tier used when locking (must match server `quoteCheckoutZar`; drives loyalty discount). */
  vipTier?: VipTier;
  /** Snapshot from lock quote — display only; never subtract VIP again at checkout. */
  quoteSubtotalZar?: number;
  quoteAfterVipSubtotalZar?: number;
  quoteVipSavingsZar?: number;
  /** Matches {@link PRICING_ENGINE_ALGORITHM_VERSION} at lock time; checkout rejects mismatch (`REQUOTE_REQUIRED`). */
  pricingVersion?: number;
  /** DB `pricing_versions.id` — checkout recomputes ZAR from this frozen catalog instead of live code. */
  pricing_version_id?: string | null;
  /** Optional `bookings.id` for server trace logs (re-pay, admin, or client-supplied preflight). */
  booking_id?: string | null;
  /** Selected cleaner for checkout — mirrored for `/api/booking/validate` (no re-fetch roster). */
  cleaner_id?: string | null;
  /** HMAC/SHA256 of canonical lock quote from `POST /api/booking/lock` — Paystack init requires a match. */
  quoteSignature?: string;
  /** ISO timestamp — checkout must complete before this (see `LOCK_HOLD_MS`). */
  lockExpiresAt?: string;
  /** Frozen add-on rows at lock time — persisted for DB + cleaner (slug + display + catalog ZAR). */
  extras_line_items?: ExtraLineItem[];
  locked: true;
  lockedAt: string;
};

let snapshotCache: { raw: string | null; value: LockedBooking | null } | null = null;

function setSnapshotCache(raw: string | null, value: LockedBooking | null) {
  snapshotCache = { raw, value };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function readFiniteRoomCount(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

function normalizeLockedExtrasArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x === "string") {
      const s = x.trim();
      if (s) out.push(s);
      continue;
    }
    if (x && typeof x === "object" && "slug" in x && typeof (x as { slug?: unknown }).slug === "string") {
      const s = (x as { slug: string }).slug.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

function parseExtrasLineItems(raw: unknown): ExtraLineItem[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: ExtraLineItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const slug = typeof o.slug === "string" ? o.slug.trim() : "";
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const price = typeof o.price === "number" && Number.isFinite(o.price) ? o.price : Number.NaN;
    if (!slug || !name || !Number.isFinite(price)) continue;
    out.push({ slug, name, price: Math.round(price) });
  }
  return out.length ? out : undefined;
}

function parseDateYmd(v: unknown, lockedAt: unknown): string | null {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (typeof lockedAt === "string" && lockedAt.length >= 10) {
    const slice = lockedAt.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(slice)) return slice;
  }
  return null;
}

export function parseLockedBooking(raw: string | null): LockedBooking | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  if (data.locked !== true) return null;
  const finalPrice =
    typeof data.finalPrice === "number" && Number.isFinite(data.finalPrice)
      ? data.finalPrice
      : typeof data.price === "number" && Number.isFinite(data.price)
        ? data.price
        : NaN;
  if (!Number.isFinite(finalPrice)) return null;
  const finalHours =
    typeof data.finalHours === "number" && Number.isFinite(data.finalHours)
      ? data.finalHours
      : typeof data.duration === "number" && Number.isFinite(data.duration)
        ? data.duration
        : NaN;
  if (!Number.isFinite(finalHours)) return null;
  if (typeof data.time !== "string" || !data.time) return null;
  if (typeof data.lockedAt !== "string") return null;
  const rooms = readFiniteRoomCount(data.rooms ?? data.bedrooms);
  const bathrooms = readFiniteRoomCount(data.bathrooms);
  if (rooms == null || bathrooms == null) return null;
  const extrasNorm = normalizeLockedExtrasArray(data.extras);
  if (extrasNorm === null) return null;
  const extraRooms = normalizeExtraRoomsRaw(data.extraRooms);
  const extras_line_items = parseExtrasLineItems(data.extras_line_items);

  const date = parseDateYmd(data.date, data.lockedAt);
  if (!date) return null;

  const surge =
    typeof data.surge === "number" && Number.isFinite(data.surge) && data.surge > 0 ? data.surge : 1;

  const pvRaw =
    typeof data.pricing_version_id === "string"
      ? data.pricing_version_id.trim()
      : typeof (data as Record<string, unknown>).pricingVersionId === "string"
        ? String((data as Record<string, unknown>).pricingVersionId).trim()
        : "";
  const pricing_version_id =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pvRaw) ? pvRaw.toLowerCase() : undefined;

  const vipTierRaw = typeof data.vipTier === "string" ? data.vipTier : undefined;
  const vipTier = vipTierRaw ? normalizeVipTier(vipTierRaw) : undefined;

  const location =
    typeof data.location === "string" ? data.location.trim().slice(0, 500) : "";

  let dynamicSurgeFactor: number | undefined;
  if (typeof data.dynamicSurgeFactor === "number" && Number.isFinite(data.dynamicSurgeFactor)) {
    const d = data.dynamicSurgeFactor;
    if (d >= 0.8 && d <= 1.2 && d !== 1) dynamicSurgeFactor = d;
  }

  const propertyType =
    data.propertyType === "apartment" ||
    data.propertyType === "house" ||
    data.propertyType === "studio" ||
    data.propertyType === "office"
      ? data.propertyType
      : null;
  const cleaningFrequency =
    data.cleaningFrequency === "weekly" ||
    data.cleaningFrequency === "biweekly" ||
    data.cleaningFrequency === "monthly" ||
    data.cleaningFrequency === "one_time"
      ? data.cleaningFrequency
      : "one_time";

  return {
    ...data,
    rooms,
    bathrooms,
    extras: extrasNorm,
    extraRooms,
    date,
    finalPrice,
    finalHours,
    price: typeof data.price === "number" && Number.isFinite(data.price) ? data.price : finalPrice,
    duration:
      typeof data.duration === "number" && Number.isFinite(data.duration) ? data.duration : finalHours,
    surge,
    locked: true,
    location,
    propertyType,
    cleaningFrequency,
    ...(extras_line_items ? { extras_line_items } : {}),
    ...(vipTier ? { vipTier } : {}),
    ...(dynamicSurgeFactor != null ? { dynamicSurgeFactor } : {}),
    ...(pricing_version_id ? { pricing_version_id } : {}),
  } as LockedBooking;
}

/** Single checkout display amount — prefer API snapshot field `price` when present. */
export function getLockedBookingDisplayPrice(locked: LockedBooking): number {
  return typeof locked.price === "number" && Number.isFinite(locked.price) ? locked.price : locked.finalPrice;
}

/** Parse a client/API payload (e.g. POST body) into a valid `LockedBooking`. */
export function parseLockedBookingFromUnknown(data: unknown): LockedBooking | null {
  if (data === null || typeof data !== "object") return null;
  try {
    return parseLockedBooking(JSON.stringify(data));
  } catch {
    return null;
  }
}

export type BookingRowLockFallback = {
  date?: string | null;
  time?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  extras?: unknown;
  total_price?: number | null;
  total_paid_zar?: number | null;
  service?: string | null;
  service_slug?: string | null;
  pricing_version_id?: string | null;
  created_at?: string | null;
};

function readSnapshotFlat(snap: unknown): BookingSnapshotFlatV1 | null {
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return null;
  const flat = (snap as { flat?: unknown }).flat;
  if (!flat || typeof flat !== "object" || Array.isArray(flat)) return null;
  const f = flat as Record<string, unknown>;
  return {
    service: typeof f.service === "string" ? f.service : null,
    rooms: readFiniteRoomCount(f.rooms),
    bathrooms: readFiniteRoomCount(f.bathrooms),
    extras: Array.isArray(f.extras)
      ? f.extras.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
      : [],
    location: typeof f.location === "string" ? f.location : null,
    date: typeof f.date === "string" ? f.date : null,
    time: typeof f.time === "string" ? f.time : null,
  };
}

function extraSlugsFromBookingRowExtras(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const s = item.trim();
      if (s) out.push(s);
      continue;
    }
    if (item && typeof item === "object" && "slug" in item && typeof (item as { slug?: unknown }).slug === "string") {
      const s = (item as { slug: string }).slug.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * Checkout `locked` when present; otherwise synthesize from `booking_snapshot.flat` + row columns
 * (sales-document and admin unified bookings that never ran `/api/booking/lock`).
 */
export function resolveLockedBookingForAdminReprice(
  snap: unknown,
  row: BookingRowLockFallback,
): LockedBooking | null {
  if (snap && typeof snap === "object" && !Array.isArray(snap)) {
    const fromLocked = parseLockedBookingFromUnknown((snap as { locked?: unknown }).locked ?? null);
    if (fromLocked) return fromLocked;
  }

  const flat = readSnapshotFlat(snap);
  const snapRec = snap && typeof snap === "object" && !Array.isArray(snap) ? (snap as Record<string, unknown>) : null;
  const serviceSlugRaw =
    flat?.service ??
    (typeof snapRec?.service_slug === "string" ? snapRec.service_slug : null) ??
    row.service_slug ??
    row.service ??
    "standard";
  const serviceId = parseBookingServiceId(serviceSlugRaw) ?? "standard";
  const service_type = inferServiceTypeFromServiceId(serviceId);
  const service_group = inferServiceGroupFromServiceId(serviceId);

  const date =
    (flat?.date && /^\d{4}-\d{2}-\d{2}$/.test(flat.date) ? flat.date : null) ??
    (typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date.trim()) ? row.date.trim() : null);
  const timeRaw = (flat?.time ?? row.time ?? "").trim();
  const time = /^\d{1,2}:\d{2}/.test(timeRaw) ? timeRaw.slice(0, 5) : null;
  if (!date || !time) return null;

  const rooms = readFiniteRoomCount(flat?.rooms ?? row.rooms) ?? 1;
  const bathrooms = readFiniteRoomCount(flat?.bathrooms ?? row.bathrooms) ?? 1;
  const extras = Array.from(
    new Set([...(flat?.extras ?? []), ...extraSlugsFromBookingRowExtras(row.extras)].map((x) => x.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const totalZar = (() => {
    const tp = Number(row.total_price);
    if (Number.isFinite(tp) && tp > 0) return Math.round(tp);
    const tpz = Number(row.total_paid_zar);
    if (Number.isFinite(tpz) && tpz > 0) return Math.round(tpz);
    const snapTotal = snapRec && typeof snapRec.total_zar === "number" ? snapRec.total_zar : null;
    if (snapTotal != null && Number.isFinite(snapTotal) && snapTotal > 0) return Math.round(snapTotal);
    return 1;
  })();

  const lockedAt =
    typeof row.created_at === "string" && row.created_at.trim() ? row.created_at.trim() : new Date().toISOString();

  const pvRaw = typeof row.pricing_version_id === "string" ? row.pricing_version_id.trim() : "";

  return parseLockedBookingFromUnknown({
    locked: true,
    lockedAt,
    date,
    time,
    finalPrice: totalZar,
    finalHours: 3,
    surge: 1,
    rooms,
    bathrooms,
    extraRooms: 0,
    extras,
    location: (flat?.location ?? "").trim().slice(0, 500),
    propertyType: "apartment",
    cleaningFrequency: "one_time",
    service: serviceId,
    service_type,
    service_group,
    selectedCategory: service_group,
    ...(pvRaw && /^[0-9a-f-]{36}$/i.test(pvRaw) ? { pricing_version_id: pvRaw.toLowerCase() } : {}),
  });
}

export function readLockedBookingFromStorage(): LockedBooking | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BOOKING_LOCKED_KEY);
    if (snapshotCache && snapshotCache.raw === raw) {
      return snapshotCache.value;
    }
    const parsed = parseLockedBooking(raw);
    setSnapshotCache(raw, parsed);
    return parsed;
  } catch {
    setSnapshotCache(null, null);
    return null;
  }
}

export function lockedToStep1State(l: LockedBooking): BookingStep1State {
  const group =
    l.service_group ?? (l.service ? inferServiceGroupFromServiceId(l.service) : null);
  const typ = l.service_type ?? (l.service ? inferServiceTypeFromServiceId(l.service) : null);
  const rec = l as Record<string, unknown>;
  const sal = typeof rec.serviceAreaLocationId === "string" ? rec.serviceAreaLocationId.trim().toLowerCase() : "";
  const sac = typeof rec.serviceAreaCityId === "string" ? rec.serviceAreaCityId.trim().toLowerCase() : "";
  const san = typeof rec.serviceAreaName === "string" ? rec.serviceAreaName.trim().slice(0, 120) : "";
  const allowLocationTextFallback = rec.allowLocationTextFallback === true;
  return {
    selectedCategory: l.selectedCategory ?? group,
    service: l.service,
    service_group: group,
    service_type: typ,
    serviceAreaLocationId: sal && /^[0-9a-f-]{36}$/i.test(sal) ? sal : null,
    serviceAreaCityId: sac && /^[0-9a-f-]{36}$/i.test(sac) ? sac : null,
    serviceAreaName: san,
    location: l.location ?? "",
    propertyType: l.propertyType ?? null,
    cleaningFrequency: l.cleaningFrequency ?? "one_time",
    rooms: l.rooms,
    bathrooms: l.bathrooms,
    extraRooms: l.extraRooms,
    extras: l.extras,
    ...(allowLocationTextFallback ? { allowLocationTextFallback: true } : {}),
  };
}

export function formatLockedAppointmentLabel(locked: LockedBooking): string {
  const [y, m, d] = locked.date.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayPart = date.toLocaleDateString("en-ZA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${dayPart} · ${locked.time}`;
}

/** Confirmation reassurance line, e.g. `Sun, 12 May at 09:00` (local interpretation of `YYYY-MM-DD` + `HH:mm`). */
export function formatScheduleReassuranceLine(dateYmd: string, timeHm: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return null;
  const t = timeHm.trim().slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const [y, m, d] = dateYmd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayPart = date.toLocaleDateString("en-ZA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${dayPart} at ${t}`;
}

/**
 * Persists a slot decision: `finalPrice` must come from `POST /api/booking/lock` (server `quoteCheckoutZar`) via `lockedQuote`.
 */
export function lockBookingSlot(
  state: BookingStep1State,
  selection: { date: string; time: string },
  options: {
    vipTier?: VipTier;
    lockedQuote: {
      total: number;
      hours: number;
      surge: number;
      surgeLabel?: string;
      cleanersCount?: number;
      quoteSubtotalZar?: number;
      quoteAfterVipSubtotalZar?: number;
      quoteVipSavingsZar?: number;
      quoteSignature?: string;
      lockExpiresAt?: string;
      /** From `POST /api/booking/lock` — must match server tariff version. */
      pricingVersion?: number;
      /** From `POST /api/booking/lock` — frozen catalog row for checkout parity. */
      pricing_version_id?: string;
      /** From `POST /api/booking/lock` — display rows for add-ons. */
      extras_line_items?: ExtraLineItem[];
    };
  },
): LockedBooking {
  const tier = options?.vipTier ?? "regular";
  const quote = options.lockedQuote;

  const extras_line_items =
    Array.isArray(quote.extras_line_items) && quote.extras_line_items.length > 0
      ? quote.extras_line_items
      : [];

  const locked: LockedBooking = {
    ...state,
    date: selection.date,
    time: selection.time,
    finalPrice: quote.total,
    finalHours: quote.hours,
    price: quote.total,
    duration: quote.hours,
    surge: quote.surge,
    surgeLabel: quote.surgeLabel,
    cleanersCount: options.lockedQuote.cleanersCount,
    extras_line_items,
    vipTier: tier,
    ...(typeof quote.quoteSubtotalZar === "number" && Number.isFinite(quote.quoteSubtotalZar)
      ? { quoteSubtotalZar: Math.round(quote.quoteSubtotalZar) }
      : {}),
    ...(typeof quote.quoteAfterVipSubtotalZar === "number" && Number.isFinite(quote.quoteAfterVipSubtotalZar)
      ? { quoteAfterVipSubtotalZar: Math.round(quote.quoteAfterVipSubtotalZar) }
      : {}),
    ...(typeof quote.quoteVipSavingsZar === "number" && Number.isFinite(quote.quoteVipSavingsZar)
      ? { quoteVipSavingsZar: Math.max(0, Math.round(quote.quoteVipSavingsZar)) }
      : {}),
    ...(typeof quote.quoteSignature === "string" && /^[0-9a-f]{64}$/i.test(quote.quoteSignature.trim())
      ? { quoteSignature: quote.quoteSignature.trim().toLowerCase() }
      : {}),
    ...(typeof quote.lockExpiresAt === "string" && quote.lockExpiresAt.trim()
      ? { lockExpiresAt: quote.lockExpiresAt.trim() }
      : {}),
    pricingVersion:
      typeof quote.pricingVersion === "number" && Number.isFinite(quote.pricingVersion)
        ? Math.round(quote.pricingVersion)
        : PRICING_ENGINE_ALGORITHM_VERSION,
    ...(typeof quote.pricing_version_id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(quote.pricing_version_id.trim())
      ? { pricing_version_id: quote.pricing_version_id.trim().toLowerCase() }
      : {}),
    locked: true,
    lockedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    const prev = parseLockedBooking(localStorage.getItem(BOOKING_LOCKED_KEY));
    const slotChanged =
      !prev || prev.date !== selection.date || prev.time !== selection.time;

    const serialized = JSON.stringify(locked);
    localStorage.setItem(BOOKING_LOCKED_KEY, serialized);
    setSnapshotCache(serialized, locked);
    window.dispatchEvent(new Event(BOOKING_LOCKED_EVENT));

    if (slotChanged) clearSelectedCleanerFromStorage();
  }

  return locked;
}

/** Persist selected cleaner id on the active lock for pay + `/api/booking/validate` (no roster re-fetch). */
export function mergeCleanerIdIntoLockedBooking(cleanerId: string): void {
  if (typeof window === "undefined") return;
  const id = cleanerId.trim();
  if (!id) return;
  try {
    const raw = localStorage.getItem(BOOKING_LOCKED_KEY);
    const parsed = parseLockedBooking(raw);
    if (!parsed) return;
    if (parsed.cleaner_id === id) return;
    const next = { ...parsed, cleaner_id: id } as LockedBooking;
    const serialized = JSON.stringify(next);
    localStorage.setItem(BOOKING_LOCKED_KEY, serialized);
    setSnapshotCache(serialized, next);
    window.dispatchEvent(new Event(BOOKING_LOCKED_EVENT));
  } catch {
    /* ignore */
  }
}

export function clearCleanerIdFromLockedBooking(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(BOOKING_LOCKED_KEY);
    const parsed = parseLockedBooking(raw);
    if (!parsed || !parsed.cleaner_id) return;
    const next = { ...parsed, cleaner_id: null } as LockedBooking;
    const serialized = JSON.stringify(next);
    localStorage.setItem(BOOKING_LOCKED_KEY, serialized);
    setSnapshotCache(serialized, next);
    window.dispatchEvent(new Event(BOOKING_LOCKED_EVENT));
  } catch {
    /* ignore */
  }
}

export function clearLockedBookingFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BOOKING_LOCKED_KEY);
    setSnapshotCache(null, null);
    window.dispatchEvent(new Event(BOOKING_LOCKED_EVENT));
  } catch {
    /* ignore */
  }
}
