import type { BookingCheckoutState } from "@/lib/booking/bookingCheckoutStore";
import type { LockedBooking } from "@/lib/booking/lockedBooking";

/** Priority: store wins over localStorage over URL (last spread wins). */
export function reconcileBookingState<A extends Record<string, unknown>>(input: {
  urlState: Partial<A>;
  localState: Partial<A>;
  storeState: Partial<A>;
}): Partial<A> {
  return {
    ...input.urlState,
    ...input.localState,
    ...input.storeState,
  };
}

/** Drop empty-string overlay keys so URL can still supply e.g. `promo` when the store default is "". */
export function omitEmptyStringOverlay<T extends Record<string, unknown>>(layer: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(layer)) {
    if (v === "") continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function reconcileCheckoutPersistedSlice(input: {
  urlState: Partial<BookingCheckoutState>;
  storeState: BookingCheckoutState;
}): Partial<BookingCheckoutState> {
  return reconcileBookingState({
    urlState: input.urlState,
    localState: {},
    storeState: omitEmptyStringOverlay(
      pickCheckoutPersistedSlice(input.storeState) as unknown as Partial<BookingCheckoutState>,
    ) as Partial<BookingCheckoutState>,
  });
}

function pickCheckoutPersistedSlice(s: BookingCheckoutState): Partial<BookingCheckoutState> {
  return {
    service: s.service,
    detailsFlowPhase: s.detailsFlowPhase,
    bedrooms: s.bedrooms,
    bathrooms: s.bathrooms,
    extraRooms: s.extraRooms,
    extras: s.extras,
    date: s.date,
    time: s.time,
    location: s.location,
    locationSlug: s.locationSlug,
    serviceAreaLocationId: s.serviceAreaLocationId,
    serviceAreaCityId: s.serviceAreaCityId,
    serviceAreaName: s.serviceAreaName,
    cleanerId: s.cleanerId,
    customerName: s.customerName,
    customerEmail: s.customerEmail,
    customerPhone: s.customerPhone,
    promo: s.promo,
  };
}

export function validateCheckoutStoreForPayment(
  state: Pick<
    BookingCheckoutState,
    "service" | "date" | "time" | "location" | "serviceAreaLocationId" | "serviceAreaName"
  >,
): void {
  if (!String(state.service ?? "").trim()) throw new Error("Missing service");
  if (!state.date || !String(state.date).trim()) throw new Error("Missing date");
  if (!state.time || !String(state.time).trim()) throw new Error("Missing time");
  const addressOk =
    Boolean(String(state.serviceAreaLocationId ?? "").trim()) ||
    Boolean(String(state.location ?? "").trim()) ||
    Boolean(String(state.serviceAreaName ?? "").trim());
  if (!addressOk) throw new Error("Missing address");
}

export function validateLockedBookingBeforePayment(
  locked: LockedBooking,
  selectedCleanerId: string | null,
): void {
  if (!String(locked.service ?? "").trim()) throw new Error("Missing service");
  if (!locked.date || !String(locked.date).trim()) throw new Error("Missing date");
  if (!locked.time || !String(locked.time).trim()) throw new Error("Missing time");
  const addressOk =
    Boolean(String(locked.serviceAreaLocationId ?? "").trim()) ||
    Boolean(String(locked.location ?? "").trim()) ||
    Boolean(String(locked.serviceAreaName ?? "").trim());
  if (!addressOk) throw new Error("Missing address");
  const cleanerOk =
    Boolean(String(selectedCleanerId ?? "").trim()) ||
    Boolean(String(locked.cleaner_id ?? "").trim()) ||
    (typeof locked.cleanersCount === "number" && locked.cleanersCount >= 1) ||
    Boolean(String(locked.quoteSignature ?? "").trim());
  if (!cleanerOk) throw new Error("Missing cleaners");
}
