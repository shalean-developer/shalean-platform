import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { adminBookingServiceSlug } from "@/lib/admin/adminBookingCreateFingerprint";
import { assertAdminBookingEditDetailsAllowed } from "@/lib/booking/assertAdminBookingEditDetailsAllowed";
import type { BookingLineItemInsert } from "@/lib/booking/bookingLineItemTypes";
import { buildCheckoutVisitLineItems, zarToCents } from "@/lib/booking/buildBookingLineItems";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { resolveLockedBookingForAdminReprice } from "@/lib/booking/lockedBooking";
import { recomputeLockCheckoutQuote } from "@/lib/booking/lockQuoteSignature";
import { buildPriceSnapshotV1Checkout, sumLineItemsCents } from "@/lib/booking/priceSnapshotBooking";
import { resolveRatesSnapshotForLockedBooking } from "@/lib/booking/resolveRatesSnapshot";
import { sanitizeBookingExtrasForPersist } from "@/lib/booking/sanitizeBookingExtrasForPersist";
import type { BookingExtraPersistRow } from "@/lib/booking/sanitizeBookingExtrasForPersist";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { tryClaimNotificationDedupe } from "@/lib/notifications/notificationDedupe";
import { extrasLineItemsFromSnapshot } from "@/lib/pricing/extrasConfig";
import {
  computeJobSubtotalSplitZarSnapshot,
  normalizeJobSubtotalSplitZar,
  type JobSubtotalSplitZar,
} from "@/lib/pricing/pricingEngineSnapshot";
import { resolvePersistCleanerIdForBooking } from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { resetBookingCleanerLineEarnings } from "@/lib/payout/resetBookingCleanerLineEarnings";
import { PAYMENT_AMOUNT_MISMATCH_EPS_CENTS } from "@/lib/payments/paymentAmountMismatch";
import { bookingIsCustomerPaymentSettled } from "@/lib/booking/bookingPaymentSettlementState";
import {
  computeAdminV2RepriceAuthoritativeQuote,
  isV2AuthoritativeBookingRow,
  legacyRepriceUnifiedDurationPatch,
  serviceSlugFromBookingRow,
} from "@/lib/booking/quote/adminRepriceAuthoritativeQuote";
import { canonicalServiceSlugFromBookingV2 } from "@/lib/booking-v2/bookingV2ServiceSlug";

export type AdminEditBookingDetailsBody = {
  bedrooms?: number;
  bathrooms?: number;
  extras?: string[];
  notes?: string;
  /** ISO timestamp of `bookings.updated_at` when the admin loaded the row. */
  client_updated_at: string;
  /** Required when a paid booking reprices above collected amount. */
  confirm_collect_additional?: boolean;
  idempotency_key?: string;
};

export type AdminEditBookingDetailsResult =
  | { ok: true; new_total: number; updated: true; idempotent?: boolean; payment_mismatch?: boolean }
  | { ok: false; status: number; error: string; collect_additional_cents?: number }
  | { ok: false; status: 409; conflict: true; message: string };

/** True when the edit-details body updates admin notes only (no bedrooms/bathrooms/extras). */
export function isAdminEditBookingDetailsNotesOnlyBody(body: AdminEditBookingDetailsBody): boolean {
  const wantsRooms = body.bedrooms !== undefined;
  const wantsBaths = body.bathrooms !== undefined;
  const wantsExtras = body.extras !== undefined;
  const wantsPrice = wantsRooms || wantsBaths || wantsExtras;
  const wantsNotes = body.notes !== undefined;
  return wantsNotes && !wantsPrice;
}

const DEDUPE_SCOPE = "admin_edit_booking_details";
const CONFLICT_MESSAGE = "Booking was updated by someone else. Reload.";

function traceBookingId(locked: LockedBooking, bid: string): string {
  const fromLock = typeof locked.booking_id === "string" ? locked.booking_id.trim() : "";
  return fromLock || bid;
}

function lockedBookingRowFallback(b: Record<string, unknown>) {
  return {
    date: typeof b.date === "string" ? b.date : null,
    time: typeof b.time === "string" ? b.time : null,
    rooms: typeof b.rooms === "number" ? b.rooms : null,
    bathrooms: typeof b.bathrooms === "number" ? b.bathrooms : null,
    extras: b.extras,
    total_price: typeof b.total_price === "number" ? b.total_price : null,
    total_paid_zar: typeof b.total_paid_zar === "number" ? b.total_paid_zar : null,
    service: typeof b.service === "string" ? b.service : null,
    service_slug: typeof b.service_slug === "string" ? b.service_slug : null,
    pricing_version_id: typeof b.pricing_version_id === "string" ? b.pricing_version_id : null,
    created_at: typeof b.created_at === "string" ? b.created_at : null,
  };
}

function resolveLockedForAdminEditBooking(b: Record<string, unknown>): LockedBooking | null {
  return resolveLockedBookingForAdminReprice(b.booking_snapshot, lockedBookingRowFallback(b));
}

function clampRoomsBaths(n: number | undefined, fallback: number): number {
  if (n == null || !Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function readRoomsFromLocked(locked: LockedBooking): number {
  const rec = locked as unknown as Record<string, unknown>;
  const r = rec.bedrooms ?? rec.rooms;
  const n = Number(r);
  if (!Number.isFinite(n)) return 2;
  return clampRoomsBaths(n, 2);
}

function readBathroomsFromLocked(locked: LockedBooking): number {
  const n = Number((locked as unknown as Record<string, unknown>).bathrooms);
  if (!Number.isFinite(n)) return 1;
  return clampRoomsBaths(n, 1);
}

function readExtrasFromLocked(locked: LockedBooking): string[] {
  if (!Array.isArray(locked.extras)) return [];
  return canonicalizeExtraSlugs(
    locked.extras.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()),
  );
}

/** Stable extras list for pricing + snapshot parity (dedupe + sort). */
export function canonicalizeExtraSlugs(slugs: readonly string[]): string[] {
  return Array.from(new Set(slugs.map((x) => String(x).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function bookingRowSignalsPaid(b: Record<string, unknown>): boolean {
  return bookingIsCustomerPaymentSettled(b);
}

function resolveEffectivePaidCents(b: Record<string, unknown>): number {
  const ap = Number(b.amount_paid_cents ?? b.total_paid_cents);
  if (Number.isFinite(ap) && ap > 0) return Math.round(ap);
  const tp = Number(b.total_price);
  if (Number.isFinite(tp) && tp > 0) return Math.round(tp * 100);
  return 0;
}

export function mergeSnapshotAdminNotes(snap: unknown, adminNotes: string | undefined): unknown {
  if (adminNotes === undefined) return snap;
  const base =
    snap && typeof snap === "object" && !Array.isArray(snap)
      ? (JSON.parse(JSON.stringify(snap)) as Record<string, unknown>)
      : {};
  base.admin_notes = adminNotes;
  return base;
}

function lineItemsToRpcPayload(items: readonly BookingLineItemInsert[]): unknown[] {
  return items.map((r) => ({
    item_type: r.item_type,
    slug: r.slug ?? null,
    name: r.name,
    quantity: r.quantity,
    unit_price_cents: r.unit_price_cents,
    total_price_cents: r.total_price_cents,
    pricing_source: r.pricing_source ?? null,
    metadata: r.metadata ?? {},
    earns_cleaner: r.earns_cleaner ?? r.item_type !== "adjustment",
  }));
}

function dbLineRowsToRpcPayload(rows: readonly Record<string, unknown>[]): unknown[] {
  return rows.map((row) => {
    const it = String(row.item_type ?? "");
    return {
      item_type: row.item_type,
      slug: row.slug ?? null,
      name: row.name,
      quantity: row.quantity,
      unit_price_cents: row.unit_price_cents,
      total_price_cents: row.total_price_cents,
      pricing_source: row.pricing_source ?? null,
      metadata: row.metadata ?? {},
      earns_cleaner: row.earns_cleaner ?? it !== "adjustment",
      cleaner_earnings_cents: row.cleaner_earnings_cents ?? null,
    };
  });
}

function auditPick(row: Record<string, unknown>): Record<string, unknown> {
  return {
    total_price: row.total_price,
    rooms: row.rooms,
    bathrooms: row.bathrooms,
    extras: row.extras,
    price_snapshot: row.price_snapshot,
    price_breakdown: row.price_breakdown,
    booking_snapshot: row.booking_snapshot,
    status: row.status,
    dispatch_status: row.dispatch_status,
    amount_paid_cents: row.amount_paid_cents,
    total_paid_cents: row.total_paid_cents,
    total_paid_zar: row.total_paid_zar,
    payment_mismatch: row.payment_mismatch,
  };
}

function dedupeResponseToResult(resp: unknown): AdminEditBookingDetailsResult | null {
  if (!resp || typeof resp !== "object" || Array.isArray(resp)) return null;
  const o = resp as Record<string, unknown>;
  if (o.ok === true && typeof o.new_total === "number") {
    return {
      ok: true,
      new_total: o.new_total,
      updated: true,
      idempotent: true,
      payment_mismatch: Boolean(o.payment_mismatch),
    };
  }
  if (typeof o.error === "string" && typeof o.status === "number") {
    return { ok: false, status: Number(o.status), error: String(o.error) };
  }
  return null;
}

async function failIdempotency(
  admin: SupabaseClient,
  dedupeKey: string | null,
  response: Record<string, unknown>,
): Promise<void> {
  if (!dedupeKey) return;
  const key = dedupeKey.trim().slice(0, 256);
  if (!key) return;
  await admin
    .from("admin_request_dedupe")
    .update({ status: "failed", response })
    .eq("scope", DEDUPE_SCOPE)
    .eq("dedupe_key", key)
    .eq("status", "processing");
}

async function tryBeginIdempotency(
  admin: SupabaseClient,
  dedupeKey: string | null,
  bookingId: string,
): Promise<
  | { kind: "skip" }
  | { kind: "owned" }
  | { kind: "cached"; payload: AdminEditBookingDetailsResult }
  | { kind: "in_flight" }
> {
  if (!dedupeKey) return { kind: "skip" };
  const key = dedupeKey.trim().slice(0, 256);
  if (!key) return { kind: "skip" };

  const { error: insErr } = await admin.from("admin_request_dedupe").insert({
    scope: DEDUPE_SCOPE,
    dedupe_key: key,
    booking_id: bookingId,
    status: "processing",
    response: null,
  });
  if (!insErr) return { kind: "owned" };

  if (insErr.code !== "23505") {
    void reportOperationalIssue("warn", "adminEditBookingDetails", "idempotency insert failed", {
      bookingId,
      message: insErr.message,
    });
    return { kind: "owned" };
  }

  const { data: existing } = await admin
    .from("admin_request_dedupe")
    .select("status, response")
    .eq("scope", DEDUPE_SCOPE)
    .eq("dedupe_key", key)
    .maybeSingle();
  const row = existing as { status?: string | null; response?: unknown } | null;
  const st = String(row?.status ?? "").trim().toLowerCase();
  const cached = dedupeResponseToResult(row?.response);
  if (st === "done" && cached) {
    return { kind: "cached", payload: cached };
  }
  if (st === "processing") {
    return { kind: "in_flight" };
  }
  if (st === "failed") {
    const { data: reclaimed, error: recErr } = await admin
      .from("admin_request_dedupe")
      .update({ status: "processing", response: null })
      .eq("scope", DEDUPE_SCOPE)
      .eq("dedupe_key", key)
      .eq("status", "failed")
      .select("id");
    if (!recErr && reclaimed && reclaimed.length > 0) {
      return { kind: "owned" };
    }
  }
  return { kind: "in_flight" };
}

async function finishIdempotency(
  admin: SupabaseClient,
  dedupeKey: string | null,
  response: Record<string, unknown>,
): Promise<void> {
  if (!dedupeKey) return;
  const key = dedupeKey.trim().slice(0, 256);
  if (!key) return;
  await admin
    .from("admin_request_dedupe")
    .update({ status: "done", response })
    .eq("scope", DEDUPE_SCOPE)
    .eq("dedupe_key", key)
    .eq("status", "processing");
}

export type RepriceEditComputation =
  | {
      ok: true;
      visitRounded: number;
      visitCents: number;
      checkoutLineItems: BookingLineItemInsert[];
      lockedNext: LockedBooking;
      lockedPersist: LockedBooking;
      snapMerged: Record<string, unknown>;
      extrasPersist: BookingExtraPersistRow[];
      price_snapshot: Record<string, unknown>;
      price_breakdown: Record<string, unknown>;
      jobSubtotalSplit: JobSubtotalSplitZar;
    }
  | { ok: false; status: number; error: string };

function buildRepriceSnapshotMeta(
  base: ReturnType<typeof buildPriceSnapshotV1Checkout>,
  adminUserId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...base,
    version: "v1",
    repriced_at: new Date().toISOString(),
  };
  const uid = adminUserId.trim();
  if (/^[0-9a-f-]{36}$/i.test(uid)) {
    out.repriced_by = uid;
  }
  return out;
}

export async function computeAdminEditBookingReprice(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    locked: LockedBooking;
    nextRooms: number;
    nextBaths: number;
    nextExtras: string[];
    notes?: string;
    snap: unknown;
    adminUserId: string;
  },
): Promise<RepriceEditComputation> {
  const { bookingId, locked, nextRooms, nextBaths, nextExtras, notes, snap, adminUserId } = params;

  const lockedNext: LockedBooking = {
    ...locked,
    rooms: nextRooms,
    bathrooms: nextBaths,
    extras: nextExtras,
  };

  const rates = await resolveRatesSnapshotForLockedBooking(admin, lockedNext);
  if (!rates) {
    return {
      ok: false,
      status: 503,
      error: "Pricing catalog snapshot is unavailable for this booking. Try again later.",
    };
  }

  const rec = recomputeLockCheckoutQuote(lockedNext, rates);
  if (!rec) {
    return { ok: false, status: 400, error: "Could not recompute pricing from the saved lock (invalid time or state)." };
  }

  const pricingVersionId =
    typeof lockedNext.pricing_version_id === "string" && lockedNext.pricing_version_id.trim()
      ? lockedNext.pricing_version_id.trim()
      : null;

  const jobSubtotalSplit = normalizeJobSubtotalSplitZar(
    computeJobSubtotalSplitZarSnapshot(rates, rec.job),
    rec.quote.subtotalZar,
    {
      bookingId: traceBookingId(lockedNext, bookingId),
      pricingVersionId,
      pricingCatalogCodeVersion: rec.quote.pricingVersion,
      quoteTotalZar: rec.quote.totalZar,
    },
  );

  const visitRounded = Math.round(rec.quote.totalZar);
  const checkoutLineItems = buildCheckoutVisitLineItems({
    serviceTypeSlug: lockedNext.service ? adminBookingServiceSlug(String(lockedNext.service)) : null,
    job: jobSubtotalSplit,
    subtotalZar: rec.quote.subtotalZar,
    visitTotalZar: rec.quote.totalZar,
  });

  const visitCents = zarToCents(visitRounded);
  const lineSumCents = sumLineItemsCents(checkoutLineItems);
  if (lineSumCents !== visitCents) {
    void reportOperationalIssue("error", "adminEditBookingDetails", "checkout line sum != visit total", {
      bookingId,
      visitCents,
      lineSumCents,
    });
    return { ok: false, status: 500, error: "Pricing line items do not reconcile to the visit total." };
  }

  const extrasSnapshotRaw = extrasLineItemsFromSnapshot(rates, lockedNext.extras ?? [], lockedNext.service ?? null).map(
    ({ slug, name, price }) => ({ slug, name, price }),
  );
  const extrasPersist = sanitizeBookingExtrasForPersist(extrasSnapshotRaw, {
    where: "adminEditBookingDetails",
    bookingId,
  });

  const baseSnap = buildPriceSnapshotV1Checkout({
    service_type: lockedNext.service ? adminBookingServiceSlug(String(lockedNext.service)) : "standard",
    base_price: jobSubtotalSplit.serviceBaseZar + jobSubtotalSplit.roomsZar,
    extras: extrasPersist.map((x) => ({
      id: String(x.slug ?? "").trim() || "extra",
      name: typeof x.name === "string" ? x.name : String(x.slug ?? "Extra"),
      price: Math.round(Number(x.price) || 0),
    })),
    total_price: visitRounded,
  });
  const price_snapshot = buildRepriceSnapshotMeta(baseSnap, adminUserId);

  const lockedPersist: LockedBooking = {
    ...lockedNext,
    finalPrice: visitRounded,
    price: visitRounded,
    finalHours: rec.quote.hours,
    duration: rec.quote.hours,
    quoteSubtotalZar: rec.quote.subtotalZar,
    quoteAfterVipSubtotalZar: rec.quote.afterVipSubtotalZar,
    quoteVipSavingsZar: rec.quote.vipSavingsZar,
    extras_line_items: extrasPersist.map((e) => ({ slug: e.slug, name: e.name, price: e.price })),
  };

  const snapMerged =
    snap && typeof snap === "object" && !Array.isArray(snap)
      ? (JSON.parse(JSON.stringify(snap)) as Record<string, unknown>)
      : {};
  snapMerged.locked = lockedPersist as unknown as Record<string, unknown>;
  if (notes !== undefined) {
    snapMerged.admin_notes = notes;
  }

  const price_breakdown = { ...rec.quote, job: jobSubtotalSplit };

  return {
    ok: true,
    visitRounded,
    visitCents,
    checkoutLineItems,
    lockedNext,
    lockedPersist,
    snapMerged,
    extrasPersist,
    price_snapshot,
    price_breakdown,
    jobSubtotalSplit,
  };
}

export type PreviewAdminEditBookingDetailsResult =
  | {
      ok: true;
      old_total_cents: number;
      new_total_cents: number;
      delta_cents: number;
      requires_collect_confirm: boolean;
      paid: boolean;
    }
  | { ok: false; status: number; error: string };

export async function previewAdminEditBookingDetails(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    body: Pick<AdminEditBookingDetailsBody, "bedrooms" | "bathrooms" | "extras" | "notes">;
  },
): Promise<PreviewAdminEditBookingDetailsResult> {
  const bookingId = params.bookingId.trim();
  const gate = await assertAdminBookingEditDetailsAllowed(admin, bookingId);
  if (!gate.ok) {
    return { ok: false, status: gate.status, error: gate.error };
  }

  const wantsRooms = params.body.bedrooms !== undefined;
  const wantsBaths = params.body.bathrooms !== undefined;
  const wantsExtras = params.body.extras !== undefined;
  const wantsPrice = wantsRooms || wantsBaths || wantsExtras;
  if (!wantsPrice) {
    return { ok: false, status: 400, error: "Preview requires bedrooms, bathrooms, and/or extras." };
  }

  const { data: row, error: selErr } = await admin
    .from("bookings")
    .select(
      "id, booking_snapshot, pricing_summary, total_price, amount_paid_cents, total_paid_cents, total_paid_zar, payment_status, payment_completed_at, rooms, bathrooms, extras, status, date, time, service, service_slug, pricing_version_id, created_at",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (selErr || !row) {
    return { ok: false, status: 404, error: selErr?.message ?? "Booking not found." };
  }
  const b = row as Record<string, unknown>;
  const statusLower = String(b.status ?? "").trim().toLowerCase();
  if (statusLower === "in_progress") {
    return { ok: false, status: 422, error: "Only notes can be edited while the job is in progress." };
  }

  const snap = b.booking_snapshot;
  const v2Authoritative = isV2AuthoritativeBookingRow(b);
  const locked = v2Authoritative ? null : resolveLockedForAdminEditBooking(b);
  if (!v2Authoritative && !locked) {
    return { ok: false, status: 400, error: "Booking snapshot is missing a priced lock." };
  }

  const curRooms = v2Authoritative
    ? clampRoomsBaths(Number(b.rooms), 1)
    : readRoomsFromLocked(locked!);
  const curBaths = v2Authoritative
    ? clampRoomsBaths(Number(b.bathrooms), 1)
    : readBathroomsFromLocked(locked!);
  const curExtras = v2Authoritative
    ? canonicalizeExtraSlugs(
        Array.isArray((snap as { selectedExtras?: unknown } | null)?.selectedExtras)
          ? ((snap as { selectedExtras: unknown[] }).selectedExtras.map((x) => String(x).trim()).filter(Boolean))
          : Array.isArray(b.extras)
            ? (b.extras as unknown[]).map((x) => String(x).trim()).filter(Boolean)
            : [],
      )
    : readExtrasFromLocked(locked!);
  const nextRooms = wantsRooms ? clampRoomsBaths(Number(params.body.bedrooms), curRooms) : curRooms;
  const nextBaths = wantsBaths ? clampRoomsBaths(Number(params.body.bathrooms), curBaths) : curBaths;
  const nextExtras =
    wantsExtras && Array.isArray(params.body.extras)
      ? canonicalizeExtraSlugs(params.body.extras.map((x) => String(x).trim()).filter(Boolean))
      : curExtras;

  let visitCents: number;
  if (v2Authoritative) {
    const v2 = await computeAdminV2RepriceAuthoritativeQuote({
      row: b,
      snap,
      nextRooms,
      nextBaths,
      nextExtras,
    });
    if (!v2.ok) {
      return { ok: false, status: v2.status, error: v2.error };
    }
    visitCents = v2.visitCents;
  } else {
    const rep = await computeAdminEditBookingReprice(admin, {
      bookingId,
      locked: locked!,
      nextRooms,
      nextBaths,
      nextExtras,
      notes: undefined,
      snap,
      adminUserId: "",
    });
    if (!rep.ok) {
      return { ok: false, status: rep.status, error: rep.error };
    }
    visitCents = rep.visitCents;
  }

  const oldTp = Number(b.total_price);
  const oldCents = Number.isFinite(oldTp) ? Math.round(oldTp * 100) : resolveEffectivePaidCents(b);
  const paid = bookingRowSignalsPaid(b);
  const newCents = visitCents;
  const delta = newCents - oldCents;
  const requires_collect_confirm = paid && newCents > resolveEffectivePaidCents(b);

  return {
    ok: true,
    old_total_cents: oldCents,
    new_total_cents: newCents,
    delta_cents: delta,
    requires_collect_confirm,
    paid,
  };
}

type AdminEditDetailsPreambleOk = {
  bookingId: string;
  dedupeKey: string | null;
  clientUpdatedAt: string;
  wantsRooms: boolean;
  wantsBaths: boolean;
  wantsExtras: boolean;
  wantsPrice: boolean;
  wantsNotes: boolean;
};

async function beginAdminEditDetailsMutation(
  admin: SupabaseClient,
  params: { bookingId: string; body: AdminEditBookingDetailsBody; idempotencyKey?: string | null },
): Promise<{ ok: false; result: AdminEditBookingDetailsResult } | ({ ok: true } & AdminEditDetailsPreambleOk)> {
  const bookingId = params.bookingId.trim();
  const dedupeKey = (params.idempotencyKey ?? params.body.idempotency_key ?? "").trim().slice(0, 256) || null;

  const gate = await assertAdminBookingEditDetailsAllowed(admin, bookingId);
  if (!gate.ok) {
    return { ok: false, result: { ok: false, status: gate.status, error: gate.error } };
  }

  const idem = await tryBeginIdempotency(admin, dedupeKey, bookingId);
  if (idem.kind === "cached") return { ok: false, result: idem.payload };
  if (idem.kind === "in_flight") {
    return { ok: false, result: { ok: false, status: 409, error: "Already processing" } };
  }

  const clientUpdatedAt = typeof params.body.client_updated_at === "string" ? params.body.client_updated_at.trim() : "";
  if (!clientUpdatedAt) {
    await failIdempotency(admin, dedupeKey, {
      ok: false,
      status: 400,
      error: "client_updated_at is required (optimistic lock).",
    });
    return { ok: false, result: { ok: false, status: 400, error: "client_updated_at is required (optimistic lock)." } };
  }

  const wantsRooms = params.body.bedrooms !== undefined;
  const wantsBaths = params.body.bathrooms !== undefined;
  const wantsExtras = params.body.extras !== undefined;
  const wantsPrice = wantsRooms || wantsBaths || wantsExtras;
  const wantsNotes = params.body.notes !== undefined;

  if (!wantsPrice && !wantsNotes) {
    await failIdempotency(admin, dedupeKey, { ok: false, status: 400, error: "No changes provided." });
    return { ok: false, result: { ok: false, status: 400, error: "No changes provided." } };
  }

  return {
    ok: true,
    bookingId,
    dedupeKey,
    clientUpdatedAt,
    wantsRooms,
    wantsBaths,
    wantsExtras,
    wantsPrice,
    wantsNotes,
  };
}

async function executeNotesOnlyAdminEditBookingDetails(
  admin: SupabaseClient,
  pre: AdminEditDetailsPreambleOk,
  notes: string,
): Promise<AdminEditBookingDetailsResult> {
  const { bookingId, dedupeKey, clientUpdatedAt } = pre;

  const { data: row, error: selErr } = await admin
    .from("bookings")
    .select("id, booking_snapshot, total_price, updated_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (selErr || !row) {
    await failIdempotency(admin, dedupeKey, {
      ok: false,
      status: 404,
      error: selErr?.message ?? "Booking not found.",
    });
    return { ok: false, status: 404, error: selErr?.message ?? "Booking not found." };
  }

  const b = row as Record<string, unknown>;

  const mergedSnap = mergeSnapshotAdminNotes(b.booking_snapshot, notes);
  const { data: updatedNote, error: upErr } = await admin
    .from("bookings")
    .update({ booking_snapshot: mergedSnap })
    .eq("id", bookingId)
    .eq("updated_at", clientUpdatedAt)
    .select("id, total_price, updated_at");
  if (upErr) {
    await failIdempotency(admin, dedupeKey, { ok: false, status: 500, error: upErr.message });
    return { ok: false, status: 500, error: upErr.message };
  }
  if (!updatedNote?.length) {
    await failIdempotency(admin, dedupeKey, { ok: false, status: 409, error: CONFLICT_MESSAGE, conflict: true });
    return { ok: false, status: 409, conflict: true, message: CONFLICT_MESSAGE };
  }
  const tp = Number(b.total_price);
  const cents = Number.isFinite(tp) ? Math.round(tp * 100) : 0;
  const success: AdminEditBookingDetailsResult = { ok: true, new_total: cents, updated: true };
  await finishIdempotency(admin, dedupeKey, { ok: true, new_total: cents, payment_mismatch: false });
  return success;
}

async function executeRepricingAdminEditBookingDetails(
  admin: SupabaseClient,
  params: { bookingId: string; body: AdminEditBookingDetailsBody; adminUserId: string; idempotencyKey?: string | null },
  pre: AdminEditDetailsPreambleOk,
): Promise<AdminEditBookingDetailsResult> {
  const { bookingId, dedupeKey, clientUpdatedAt, wantsRooms, wantsBaths, wantsExtras, wantsPrice } = pre;

  const { data: row, error: selErr } = await admin
    .from("bookings")
    .select(
      "id, booking_snapshot, pricing_summary, total_price, total_paid_cents, amount_paid_cents, total_paid_zar, payment_status, payment_completed_at, rooms, bathrooms, extras, cleaner_id, selected_cleaner_id, payout_owner_cleaner_id, is_team_job, status, completed_at, dispatch_status, payment_mismatch, updated_at, date, time, service, service_slug, pricing_version_id, created_at",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (selErr || !row) {
    await failIdempotency(admin, dedupeKey, {
      ok: false,
      status: 404,
      error: selErr?.message ?? "Booking not found.",
    });
    return { ok: false, status: 404, error: selErr?.message ?? "Booking not found." };
  }

  const b = row as Record<string, unknown>;
  const statusLower = String(b.status ?? "").trim().toLowerCase();
  if (statusLower === "in_progress" && wantsPrice) {
    await failIdempotency(admin, dedupeKey, {
      ok: false,
      status: 422,
      error: "Only notes can be edited while the job is in progress.",
    });
    return { ok: false, status: 422, error: "Only notes can be edited while the job is in progress." };
  }

  const { data: oldLineRowsRaw } = await admin.from("booking_line_items").select("*").eq("booking_id", bookingId);
  const oldLineRows = (oldLineRowsRaw ?? []) as Record<string, unknown>[];
  const oldLinesRpc = dbLineRowsToRpcPayload(oldLineRows);

  const snap = b.booking_snapshot;
  const v2Authoritative = isV2AuthoritativeBookingRow(b);
  const locked = v2Authoritative ? null : resolveLockedForAdminEditBooking(b);
  if (!v2Authoritative && !locked) {
    await failIdempotency(admin, dedupeKey, {
      ok: false,
      status: 400,
      error: "Booking snapshot is missing a priced lock; rooms/extras cannot be edited.",
    });
    return { ok: false, status: 400, error: "Booking snapshot is missing a priced lock; rooms/extras cannot be edited." };
  }

  const curRooms = v2Authoritative
    ? clampRoomsBaths(Number(b.rooms), 1)
    : readRoomsFromLocked(locked!);
  const curBaths = v2Authoritative
    ? clampRoomsBaths(Number(b.bathrooms), 1)
    : readBathroomsFromLocked(locked!);
  const curExtras = v2Authoritative
    ? canonicalizeExtraSlugs(
        Array.isArray((snap as { selectedExtras?: unknown } | null)?.selectedExtras)
          ? ((snap as { selectedExtras: unknown[] }).selectedExtras.map((x) => String(x).trim()).filter(Boolean))
          : Array.isArray(b.extras)
            ? (b.extras as unknown[]).map((x) => String(x).trim()).filter(Boolean)
            : [],
      )
    : readExtrasFromLocked(locked!);
  const nextRooms = wantsRooms ? clampRoomsBaths(Number(params.body.bedrooms), curRooms) : curRooms;
  const nextBaths = wantsBaths ? clampRoomsBaths(Number(params.body.bathrooms), curBaths) : curBaths;
  const nextExtras =
    wantsExtras && Array.isArray(params.body.extras)
      ? canonicalizeExtraSlugs(params.body.extras.map((x) => String(x).trim()).filter(Boolean))
      : curExtras;

  let rep: RepriceEditComputation;
  let v2QuotePatch: Record<string, unknown> | null = null;

  if (v2Authoritative) {
    const v2 = await computeAdminV2RepriceAuthoritativeQuote({
      row: b,
      snap,
      nextRooms,
      nextBaths,
      nextExtras,
      notes: params.body.notes,
    });
    if (!v2.ok) {
      await failIdempotency(admin, dedupeKey, { ok: false, status: v2.status, error: v2.error });
      return { ok: false, status: v2.status, error: v2.error };
    }
    v2QuotePatch = v2.quotePatch;
    const serviceSlug = serviceSlugFromBookingRow(b);
    const checkoutLineItems = buildCheckoutVisitLineItems({
      serviceTypeSlug: serviceSlug ? canonicalServiceSlugFromBookingV2(serviceSlug) : null,
      job: {
        serviceBaseZar: v2.breakdown.base_service_price,
        roomsZar: v2.breakdown.property_factors_total,
        extrasZar: v2.breakdown.selected_extras_total + v2.breakdown.extra_cleaner_cost,
      },
      subtotalZar: v2.breakdown.subtotal_before_service_fee,
      visitTotalZar: v2.breakdown.estimated_total,
    });
    const extrasPersist = sanitizeBookingExtrasForPersist(
      v2.breakdown.selected_extras.map((e) => ({
        slug: e.extra_id,
        name: e.name,
        price: e.price,
      })),
      { where: "adminEditBookingDetails", bookingId },
    );
    const price_snapshot = buildRepriceSnapshotMeta(
      buildPriceSnapshotV1Checkout({
        service_type: serviceSlug ? canonicalServiceSlugFromBookingV2(serviceSlug) : "standard",
        base_price: v2.breakdown.base_service_price + v2.breakdown.property_factors_total,
        extras: extrasPersist.map((x) => ({
          id: String(x.slug ?? "").trim() || "extra",
          name: typeof x.name === "string" ? x.name : String(x.slug ?? "Extra"),
          price: Math.round(Number(x.price) || 0),
        })),
        total_price: v2.visitRounded,
      }),
      params.adminUserId,
    );
    rep = {
      ok: true,
      visitRounded: v2.visitRounded,
      visitCents: v2.visitCents,
      checkoutLineItems,
      lockedNext: locked ?? ({} as LockedBooking),
      lockedPersist: locked ?? ({} as LockedBooking),
      snapMerged: v2.snapMerged,
      extrasPersist,
      price_snapshot,
      price_breakdown: v2.breakdown,
      jobSubtotalSplit: {
        serviceBaseZar: v2.breakdown.base_service_price,
        roomsZar: v2.breakdown.property_factors_total,
        extrasZar: v2.breakdown.selected_extras_total + v2.breakdown.extra_cleaner_cost,
      },
    };
  } else {
    rep = await computeAdminEditBookingReprice(admin, {
      bookingId,
      locked: locked!,
      nextRooms,
      nextBaths,
      nextExtras,
      notes: params.body.notes,
      snap,
      adminUserId: params.adminUserId,
    });
    if (!rep.ok) {
      await failIdempotency(admin, dedupeKey, { ok: false, status: rep.status, error: rep.error });
      return { ok: false, status: rep.status, error: rep.error };
    }
  }

  const paid = bookingRowSignalsPaid(b);
  const oldPaidCents = resolveEffectivePaidCents(b);
  if (paid && rep.visitCents > oldPaidCents && !params.body.confirm_collect_additional) {
    await failIdempotency(admin, dedupeKey, {
      ok: false,
      status: 422,
      error: "This booking is already paid at a lower amount. Confirm to flag a top-up for ops.",
    });
    return {
      ok: false,
      status: 422,
      error: "This booking is already paid at a lower amount. Confirm to flag a top-up for ops.",
      collect_additional_cents: rep.visitCents - oldPaidCents,
    };
  }

  const beforeAudit = auditPick(b);
  // Phase 1: mismatch = quote ≠ gateway cash (increase OR decrease), not "increase only".
  const paidMismatchAfter =
    paid && Math.abs(rep.visitCents - oldPaidCents) > PAYMENT_AMOUNT_MISMATCH_EPS_CENTS;

  const patch: Record<string, unknown> = {
    booking_snapshot: rep.snapMerged,
    rooms: nextRooms,
    bathrooms: nextBaths,
    extras: rep.extrasPersist,
    total_price: rep.visitRounded,
    price_snapshot: rep.price_snapshot,
    price_breakdown: rep.price_breakdown,
  };

  if (v2QuotePatch) {
    const breakdown = rep.price_breakdown as import("@/lib/booking-v2/types").CustomerPricingBreakdown;
    Object.assign(patch, v2QuotePatch, {
      base_amount_cents: Math.round(breakdown.subtotal_before_service_fee * 100),
      service_fee_cents: Math.round(breakdown.service_fee * 100),
      recurring_discount_cents: Math.round(breakdown.recurring_discount * 100),
    });
  } else {
    const rates = await resolveRatesSnapshotForLockedBooking(admin, rep.lockedPersist);
    if (rates) {
      Object.assign(
        patch,
        legacyRepriceUnifiedDurationPatch({
          lockedPersist: rep.lockedPersist,
          rates,
          schedule:
            typeof b.date === "string" && typeof b.time === "string"
              ? { date: String(b.date).trim(), time: String(b.time).trim().slice(0, 5) }
              : null,
        }),
      );
    }
  }

  if (paid) {
    // Phase 1: never rewrite gateway-collected amounts to the new quote.
    // Keep amount_paid_* / total_paid_* as cash truth; flag mismatch for ops top-up/refund.
    patch.payment_mismatch = paidMismatchAfter;
    if (rep.visitCents < oldPaidCents) {
      console.warn("PAID_TOTAL_CHANGED", {
        bookingId,
        before_cents: oldPaidCents,
        after_cents: rep.visitCents,
        direction: "decrease",
        gateway_amounts_preserved: true,
      });
    }
  }

  const st0 = String(b.status ?? "").trim().toLowerCase();
  const hasCleaner = !!(
    String(b.cleaner_id ?? "").trim() || String((b as { selected_cleaner_id?: string | null }).selected_cleaner_id ?? "").trim()
  );
  const completedAtSet = Boolean(String((b as { completed_at?: string | null }).completed_at ?? "").trim());
  const terminalLifecycle =
    st0 === "completed" ||
    st0 === "cancelled" ||
    st0 === "failed" ||
    st0 === "payment_expired" ||
    completedAtSet;
  // Paid + cleaner should surface as assigned for open jobs only. Never collapse a completed
  // (or completed_at-stamped) visit back to assigned — that excludes it from office earnings.
  if (paid && st0 !== "pending_payment" && hasCleaner && !terminalLifecycle) {
    patch.status = "assigned";
    patch.dispatch_status = "assigned";
  }

  const revertKeys = [
    "booking_snapshot",
    "rooms",
    "bathrooms",
    "extras",
    "total_price",
    "price_snapshot",
    "price_breakdown",
    "status",
    "dispatch_status",
    "payment_mismatch",
  ] as const;
  const revertPatch: Record<string, unknown> = {};
  for (const k of revertKeys) {
    revertPatch[k] = b[k];
  }

  const selectAfterEdit =
    "id, booking_snapshot, total_price, rooms, bathrooms, extras, price_snapshot, price_breakdown, status, dispatch_status, amount_paid_cents, total_paid_cents, total_paid_zar, payment_mismatch, cleaner_id, payout_owner_cleaner_id, is_team_job, payment_status, payment_completed_at, updated_at";

  const { data: updatedRows, error: upErr } = await admin
    .from("bookings")
    .update(patch)
    .eq("id", bookingId)
    .eq("updated_at", clientUpdatedAt)
    .select(selectAfterEdit);
  if (upErr) {
    await failIdempotency(admin, dedupeKey, { ok: false, status: 500, error: upErr.message });
    return { ok: false, status: 500, error: upErr.message };
  }
  const postRow = (updatedRows?.[0] ?? null) as Record<string, unknown> | null;
  if (!postRow?.id) {
    await failIdempotency(admin, dedupeKey, { ok: false, status: 409, error: CONFLICT_MESSAGE });
    return { ok: false, status: 409, conflict: true, message: CONFLICT_MESSAGE };
  }

  const rpcPayload = lineItemsToRpcPayload(rep.checkoutLineItems);
  const { data: rpcInserted, error: rpcErr } = await admin.rpc("replace_booking_line_items_atomic", {
    p_booking_id: bookingId,
    p_rows: rpcPayload,
  });
  if (rpcErr) {
    void reportOperationalIssue("error", "adminEditBookingDetails", "replace_booking_line_items_atomic failed", {
      bookingId,
      message: rpcErr.message,
    });
    await admin.from("bookings").update(revertPatch).eq("id", bookingId);
    const { error: revErr } = await admin.rpc("replace_booking_line_items_atomic", {
      p_booking_id: bookingId,
      p_rows: oldLinesRpc,
    });
    if (revErr) {
      void reportOperationalIssue("error", "adminEditBookingDetails", "revert line items failed", {
        bookingId,
        message: revErr.message,
      });
    }
    await failIdempotency(admin, dedupeKey, { ok: false, status: 500, error: rpcErr.message });
    return { ok: false, status: 500, error: rpcErr.message };
  }

  const rpcN = typeof rpcInserted === "number" ? rpcInserted : Number(rpcInserted);
  if (!Number.isFinite(rpcN) || rpcN < 1 || rpcN !== rpcPayload.length) {
    void reportOperationalIssue("error", "adminEditBookingDetails", "replace_booking_line_items_atomic count mismatch", {
      bookingId,
      rpcInserted,
      expected: rpcPayload.length,
    });
    await admin.from("bookings").update(revertPatch).eq("id", bookingId);
    const { error: revErr2 } = await admin.rpc("replace_booking_line_items_atomic", {
      p_booking_id: bookingId,
      p_rows: oldLinesRpc,
    });
    if (revErr2) {
      void reportOperationalIssue("error", "adminEditBookingDetails", "revert line items failed", {
        bookingId,
        message: revErr2.message,
      });
    }
    await failIdempotency(admin, dedupeKey, {
      ok: false,
      status: 500,
      error: "Line item RPC returned unexpected count.",
    });
    return { ok: false, status: 500, error: "Line item RPC returned unexpected count." };
  }

  const dispatchClaimed = await tryClaimNotificationDedupe(admin, "dispatch_edit_details", { bookingId });
  if (!dispatchClaimed) {
    void logSystemEvent({
      level: "info",
      source: "adminEditBookingDetails",
      message: "dispatch_edit_details_already_claimed",
      context: { bookingId },
    });
  }

  const resetEarn = await resetBookingCleanerLineEarnings(admin, bookingId);
  if (!resetEarn.ok) {
    void reportOperationalIssue("error", "adminEditBookingDetails", `resetBookingCleanerLineEarnings: ${resetEarn.error}`, {
      bookingId,
    });
    await failIdempotency(admin, dedupeKey, {
      ok: false,
      status: 500,
      error: "Could not reset booking earnings for repricing.",
    });
    return {
      ok: false,
      status: 500,
      error: "Could not reset booking earnings for repricing.",
    };
  }

  const cleanerId = resolvePersistCleanerIdForBooking(
    postRow as { cleaner_id?: string | null; payout_owner_cleaner_id?: string | null; is_team_job?: boolean | null },
  );

  const payCents = Number(postRow.amount_paid_cents ?? postRow.total_paid_cents);
  const signalsPaid = bookingRowSignalsPaid(postRow);
  if (signalsPaid && (!Number.isFinite(payCents) || payCents <= 0)) {
    void reportOperationalIssue("warn", "adminEditBookingDetails", "skip_recompute_non_positive_amounts", { bookingId });
  } else if (cleanerId) {
    const persist = await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId });
    if (!persist.ok) {
      void reportOperationalIssue("error", "adminEditBookingDetails", "persistCleanerPayoutIfUnset failed", {
        bookingId,
        error: persist.error,
      });
      await failIdempotency(admin, dedupeKey, {
        ok: false,
        status: 500,
        error: "Booking was repriced but earnings could not be recomputed; use Fix earnings.",
      });
      return {
        ok: false,
        status: 500,
        error: "Booking was repriced but earnings could not be recomputed; use Fix earnings.",
      };
    }
  }

  const afterAudit = auditPick(postRow);
  const fieldsChanged: string[] = [];
  if (wantsRooms) fieldsChanged.push("bedrooms");
  if (wantsBaths) fieldsChanged.push("bathrooms");
  if (wantsExtras) fieldsChanged.push("extras");
  if (params.body.notes !== undefined) fieldsChanged.push("notes");
  const oldQuoteCentsForDelta = Number.isFinite(Number(b.total_price))
    ? Math.round(Number(b.total_price) * 100)
    : resolveEffectivePaidCents(b);
  const summary = {
    fields_changed: fieldsChanged,
    delta_quote_cents: rep.visitCents - oldQuoteCentsForDelta,
  };

  const { error: chErr } = await admin.from("booking_changes").insert({
    booking_id: bookingId,
    changed_by: params.adminUserId,
    before: beforeAudit,
    after: afterAudit,
    summary,
  });
  if (chErr) {
    void reportOperationalIssue("warn", "adminEditBookingDetails", "booking_changes insert failed", {
      bookingId,
      message: chErr.message,
    });
  }

  const success: AdminEditBookingDetailsResult = {
    ok: true,
    new_total: rep.visitCents,
    updated: true,
    payment_mismatch: paidMismatchAfter || undefined,
  };

  await finishIdempotency(admin, dedupeKey, {
    ok: true,
    new_total: rep.visitCents,
    payment_mismatch: paidMismatchAfter,
  });

  return success;
}

/**
 * Admin edit-details: notes-only path (snapshot `admin_notes`). Used by {@link adminUpdateBookingNotes}.
 * Does not reprice, mutate line items, reset earnings, persist payouts, insert booking_changes, or claim dispatch dedupe.
 */
export async function adminEditBookingDetailsNotesOnly(
  admin: SupabaseClient,
  params: { bookingId: string; body: AdminEditBookingDetailsBody; adminUserId: string; idempotencyKey?: string | null },
): Promise<AdminEditBookingDetailsResult> {
  const pre = await beginAdminEditDetailsMutation(admin, params);
  if (!pre.ok) return pre.result;
  if (!pre.wantsNotes) {
    await failIdempotency(admin, pre.dedupeKey, { ok: false, status: 400, error: "No changes provided." });
    return { ok: false, status: 400, error: "No changes provided." };
  }
  if (pre.wantsPrice) {
    await failIdempotency(admin, pre.dedupeKey, {
      ok: false,
      status: 400,
      error: "Pricing fields require the full edit-details handler.",
    });
    return { ok: false, status: 400, error: "Pricing fields require the full edit-details handler." };
  }
  const notes = typeof params.body.notes === "string" ? params.body.notes : "";
  return executeNotesOnlyAdminEditBookingDetails(admin, pre, notes);
}

/**
 * Admin edit-details: repricing path (bedrooms/bathrooms/extras, optional notes in snapshot). Used by {@link adminRepriceBooking}.
 */
export async function adminEditBookingDetailsRepricingOnly(
  admin: SupabaseClient,
  params: { bookingId: string; body: AdminEditBookingDetailsBody; adminUserId: string; idempotencyKey?: string | null },
): Promise<AdminEditBookingDetailsResult> {
  const pre = await beginAdminEditDetailsMutation(admin, params);
  if (!pre.ok) return pre.result;
  if (!pre.wantsPrice) {
    await failIdempotency(admin, pre.dedupeKey, {
      ok: false,
      status: 400,
      error: "Repricing requires bedrooms, bathrooms, and/or extras.",
    });
    return { ok: false, status: 400, error: "Repricing requires bedrooms, bathrooms, and/or extras." };
  }
  return executeRepricingAdminEditBookingDetails(admin, params, pre);
}

/** Full edit-details: notes-only or repricing (used when routing does not split handlers). */
export async function adminEditBookingDetails(
  admin: SupabaseClient,
  params: { bookingId: string; body: AdminEditBookingDetailsBody; adminUserId: string; idempotencyKey?: string | null },
): Promise<AdminEditBookingDetailsResult> {
  const pre = await beginAdminEditDetailsMutation(admin, params);
  if (!pre.ok) return pre.result;

  if (!pre.wantsPrice && pre.wantsNotes) {
    const notes = typeof params.body.notes === "string" ? params.body.notes : "";
    return executeNotesOnlyAdminEditBookingDetails(admin, pre, notes);
  }

  return executeRepricingAdminEditBookingDetails(admin, params, pre);
}
