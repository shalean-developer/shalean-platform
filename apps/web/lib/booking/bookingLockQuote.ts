/**
 * Server-only: parse booking lock / price JSON bodies and run {@link quoteCheckoutZar}.
 * Keeps `/api/booking/lock` and `/api/booking/price` aligned on one code path.
 */
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { normalizeVipTier, type VipTier } from "@/lib/pricing/vipTier";
import { filterExtrasForService } from "@/lib/pricing/extrasConfig";
import {
  normalizeExtraRoomsRaw,
  parsePricingServiceParams,
  quoteCheckoutZar,
  resolveServiceForPricing,
  type CheckoutQuoteResult,
  type PricingJobInput,
} from "@/lib/pricing/pricingEngine";

export type LockQuoteError = { ok: false; status: number; error: string };

export type LockQuoteSuccess = {
  ok: true;
  quote: CheckoutQuoteResult;
  job: PricingJobInput;
  /** Normalized HH:mm */
  timeHm: string;
  vipTier: VipTier;
  /** Options actually passed into `quoteCheckoutZar` (must be echoed into signature verify). */
  quoteOptions: { dynamicAdjustment: number | undefined; cleanersCount: number | undefined };
};

function readNumber(v: unknown, fallback: number, min?: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const r = Math.round(n);
  if (min != null) return Math.max(min, r);
  return r;
}

function readExtras(b: Record<string, unknown>): string[] {
  const raw = b.extras;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

function normalizeTimeHm(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim().slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(s)) return null;
  return s;
}

export type QuoteLockRequestOptions = {
  /**
   * When false (default for public lock), server ignores client-supplied dynamic AI / demand tweaks
   * so quotes cannot be undercut via DevTools.
   */
  allowClientDynamicAdjustment?: boolean;
};

/**
 * Validates and quotes from a JSON object (lock or price request).
 * `date` is accepted for API compatibility but does not affect ZAR totals.
 */
export function quoteLockFromRequestBody(
  body: unknown,
  options?: QuoteLockRequestOptions,
): LockQuoteSuccess | LockQuoteError {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "Invalid JSON body." };
  }
  const b = body as Record<string, unknown>;

  const svcRaw = String(b.serviceType ?? b.service_type ?? b.service ?? "").trim();
  const { service, serviceType } = parsePricingServiceParams(svcRaw);
  if (!svcRaw || (service === null && serviceType === null)) {
    return { ok: false, status: 400, error: "service or serviceType is required." };
  }

  const timeHm = normalizeTimeHm(b.time);
  if (!timeHm) {
    return { ok: false, status: 400, error: "time is required (HH:mm)." };
  }

  const rooms = readNumber(b.bedrooms ?? b.rooms, 1, 1);
  const bathrooms = readNumber(b.bathrooms, 1, 1);
  const extraRooms = normalizeExtraRoomsRaw(b.extraRooms ?? b.extra_rooms);

  const jobDraft: PricingJobInput = {
    service,
    serviceType,
    rooms,
    bathrooms,
    extraRooms,
    extras: [],
  };
  const resolvedService = resolveServiceForPricing(jobDraft);
  const job: PricingJobInput = {
    ...jobDraft,
    extras: filterExtrasForService(readExtras(b), resolvedService),
  };

  const vipTier = normalizeVipTier(
    typeof b.vipTier === "string" ? b.vipTier : typeof b.vip_tier === "string" ? b.vip_tier : undefined,
  );

  const allowDyn = options?.allowClientDynamicAdjustment === true;
  const dynRaw = allowDyn ? b.dynamicSurgeFactor ?? b.dynamic_surge_factor ?? b.dynamicAdjustment : undefined;
  const dynamicAdjustment =
    allowDyn && typeof dynRaw === "number" && Number.isFinite(dynRaw) ? dynRaw : undefined;

  const ccRaw = b.cleanersCount ?? b.cleaners_count;
  const cleanersCount =
    typeof ccRaw === "number" && Number.isFinite(ccRaw) ? Math.max(0, Math.round(ccRaw)) : undefined;

  const quote = quoteCheckoutZar(job, timeHm, vipTier, {
    dynamicAdjustment,
    cleanersCount,
  });

  return {
    ok: true,
    quote,
    job,
    timeHm,
    vipTier,
    quoteOptions: { dynamicAdjustment, cleanersCount },
  };
}

/**
 * Pricing job for a persisted lock — must match {@link quoteLockFromRequestBody} so checkout
 * HMAC recompute agrees with `POST /api/booking/lock` (same `serviceType ?? service_type ?? service`
 * precedence, rooms, extras filter).
 */
export function pricingJobFromLockedBooking(locked: LockedBooking): PricingJobInput {
  const rec = locked as Record<string, unknown>;
  const svcRaw = String(rec.serviceType ?? rec.service_type ?? rec.service ?? "").trim();
  const { service, serviceType } = parsePricingServiceParams(svcRaw);

  const rooms = readNumber(rec.bedrooms ?? rec.rooms, 1, 1);
  const bathrooms = readNumber(rec.bathrooms, 1, 1);
  const extraRooms = normalizeExtraRoomsRaw(rec.extraRooms ?? rec.extra_rooms);

  const jobDraft: PricingJobInput = {
    service,
    serviceType,
    rooms,
    bathrooms,
    extraRooms,
    extras: [],
  };
  const resolvedService = resolveServiceForPricing(jobDraft);
  const extrasList = Array.isArray(locked.extras)
    ? locked.extras
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim())
    : [];
  return {
    ...jobDraft,
    extras: filterExtrasForService(extrasList, resolvedService),
  };
}
