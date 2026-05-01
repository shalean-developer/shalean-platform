import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const BOOKING_CHECKOUT_STORAGE_KEY = "shalean-booking-checkout-v1";

export type BookingDetailsFlowPhase = "pick-service" | "home-details";

export type BookingCheckoutState = {
  service: string;
  /** Step 1 progressive disclosure: service grid vs property + add-ons */
  detailsFlowPhase: BookingDetailsFlowPhase;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
  date: string | null;
  time: string | null;
  location: string;
  locationSlug: string | null;
  serviceAreaLocationId: string | null;
  serviceAreaCityId: string | null;
  serviceAreaName: string;
  cleanerId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  /** Sanitized promo from URL / marketing; carried through checkout. */
  promo: string;
};

const initialState: BookingCheckoutState = {
  service: "standard",
  detailsFlowPhase: "pick-service",
  bedrooms: 2,
  bathrooms: 1,
  extraRooms: 0,
  extras: [],
  date: null,
  time: null,
  location: "",
  locationSlug: null,
  serviceAreaLocationId: null,
  serviceAreaCityId: null,
  serviceAreaName: "",
  cleanerId: null,
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  promo: "",
};

export type BookingCheckoutStore = BookingCheckoutState & {
  patch: (partial: Partial<BookingCheckoutState>) => void;
  reset: () => void;
};

function persistedSlice(s: BookingCheckoutStore): BookingCheckoutState {
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

export const useBookingCheckoutStore = create<BookingCheckoutStore>()(
  persist(
    (set) => ({
      ...initialState,
      patch: (partial) => set((s) => ({ ...s, ...partial })),
      reset: () =>
        set((s) => ({
          ...initialState,
          patch: s.patch,
          reset: s.reset,
        })),
    }),
    {
      name: BOOKING_CHECKOUT_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => persistedSlice(s),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<BookingCheckoutState>;
        const phase: BookingDetailsFlowPhase =
          p.detailsFlowPhase === "pick-service" || p.detailsFlowPhase === "home-details"
            ? p.detailsFlowPhase
            : Object.keys(p).length > 0
              ? "home-details"
              : "pick-service";
        return {
          ...current,
          ...p,
          promo: typeof p.promo === "string" ? p.promo : current.promo,
          detailsFlowPhase: phase,
          patch: current.patch,
          reset: current.reset,
        };
      },
    },
  ),
);
