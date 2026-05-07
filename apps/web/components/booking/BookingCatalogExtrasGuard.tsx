"use client";

import { useEffect } from "react";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import { useBookingStep1 } from "@/components/booking/useBookingStep1";
import { useIsBookingLocked } from "@/components/booking/useLockedBooking";
import { filterExtrasForSnapshot } from "@/lib/pricing/pricingEngineSnapshot";

/**
 * Keeps `extras` aligned with checkout pricing: drops selections that the catalog does not offer for the
 * current {@link BookingStep1State.service} (same filter as {@link filterExtrasForSnapshot}).
 *
 * Runs after the pricing catalog loads and whenever service/extras change — e.g. switching Standard → Move
 * no longer leaves “light” add-ons in state when they are not priced for Move.
 *
 * Skips while a slot lock is active so we do not mutate checkout-safe state mid-payment.
 */
export function BookingCatalogExtrasGuard() {
  const { state, setState, hydrated } = useBookingStep1();
  const { catalog } = useBookingPrice();
  const locked = useIsBookingLocked();

  useEffect(() => {
    if (!hydrated || locked || !catalog || state.service == null) return;

    const filtered = filterExtrasForSnapshot(catalog, state.extras, state.service);
    const unchanged =
      filtered.length === state.extras.length && filtered.every((id, i) => id === state.extras[i]);
    if (unchanged) return;

    setState((s) => ({ ...s, extras: filtered }));
  }, [hydrated, locked, catalog, state.service, state.extras, setState]);

  return null;
}
