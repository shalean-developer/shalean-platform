"use client";

import type { Dispatch, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearSelectedCleanerFromStorage } from "@/lib/booking/cleanerSelection";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { clearLockedBookingFromStorage } from "@/lib/booking/lockedBooking";
import { clearBookingPricePreviewFromStorage } from "@/lib/booking/bookingPricePreview";
import type { ServiceCategoryKind } from "./CategoryPicker";
import {
  type BookingServiceGroupKey,
  type BookingServiceId,
  type BookingServiceTypeKey,
  getBlockedExtraIds,
  getMaxRoomsForService,
  inferServiceGroupFromServiceId,
  inferServiceTypeFromServiceId,
  normalizeStep1ForService,
  parseBookingServiceId,
  SERVICE_CATEGORIES,
} from "./serviceCategories";

export type PropertyTypeKind = "apartment" | "house" | "studio" | "office";

export type BookingStep1State = {
  selectedCategory: ServiceCategoryKind | null;
  service: BookingServiceId | null;
  service_group: BookingServiceGroupKey | null;
  service_type: BookingServiceTypeKey | null;
  /** Service address / area — shown on later steps, edited on step 1. */
  location: string;
  /** Low-friction step 1 — property shape (UX; does not change pricing today). */
  propertyType: PropertyTypeKind | null;
  /** Optional sub-services selected on quote step; first item is used as primary pricing service. */
  subServices?: BookingServiceTypeKey[];
  /** Optional booking notes captured on quote step. */
  notes?: string;
  cleaningFrequency: "one_time" | "weekly" | "biweekly" | "monthly";
  rooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
};

export const BOOKING_STEP1_KEY = "booking_step1";
export const BOOKING_FINAL_KEY = "booking_final";
export const BOOKING_STEP1_STORAGE_KEY = BOOKING_STEP1_KEY;

const initialState: BookingStep1State = {
  selectedCategory: null,
  service: null,
  service_group: null,
  service_type: null,
  location: "",
  propertyType: null,
  subServices: [],
  notes: "",
  cleaningFrequency: "one_time",
  rooms: 1,
  bathrooms: 1,
  extraRooms: 0,
  extras: [],
};

const EXTRAS_IDS = [
  "inside-cabinets",
  "inside-fridge",
  "inside-oven",
  "interior-windows",
  "ironing",
] as const;

const ALLOWED_EXTRA_IDS = new Set<string>(EXTRAS_IDS);

function parseServiceId(value: unknown): BookingServiceId | null {
  return parseBookingServiceId(value);
}

function parseSelectedCategory(value: unknown): ServiceCategoryKind | null {
  if (value === "regular" || value === "specialised") return value;
  return null;
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parsePropertyType(value: unknown): PropertyTypeKind | null {
  if (value === "apartment" || value === "house" || value === "studio" || value === "office") return value;
  return null;
}

function parseServiceGroup(value: unknown): BookingServiceGroupKey | null {
  if (value === "regular" || value === "specialised") return value;
  return null;
}

function parseServiceType(value: unknown): BookingServiceTypeKey | null {
  if (
    value === "standard_cleaning" ||
    value === "airbnb_cleaning" ||
    value === "deep_cleaning" ||
    value === "move_cleaning" ||
    value === "carpet_cleaning"
  ) {
    return value;
  }
  return null;
}

function syncStep1ServiceFields(s: BookingStep1State): BookingStep1State {
  if (!s.service) return s;
  const inferredGroup = inferServiceGroupFromServiceId(s.service);
  const inferredType = inferServiceTypeFromServiceId(s.service);
  return {
    ...s,
    selectedCategory: inferredGroup ?? s.selectedCategory,
    service_group: inferredGroup ?? s.service_group,
    service_type: inferredType ?? s.service_type,
  };
}

function parseStoredStep1(raw: string): BookingStep1State | null {
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const o = data as Record<string, unknown>;

  const service = parseServiceId(o.service);

  let selectedCategory = parseSelectedCategory(o.selectedCategory);
  let service_group = parseServiceGroup(o.service_group);
  let service_type = parseServiceType(o.service_type);
  if (!selectedCategory && service) {
    selectedCategory = inferServiceGroupFromServiceId(service);
  }
  if (!service_group && service) {
    service_group = inferServiceGroupFromServiceId(service);
  }
  if (!service_type && service) {
    service_type = inferServiceTypeFromServiceId(service);
  }

  const rooms = clampInt(o.rooms, 1, 10, initialState.rooms);
  const bathrooms = clampInt(o.bathrooms, 1, 10, initialState.bathrooms);
  const extraRooms = clampInt(o.extraRooms, 0, 10, initialState.extraRooms);

  let extras: string[] = [];
  if (Array.isArray(o.extras)) {
    extras = o.extras.filter(
      (e): e is string => typeof e === "string" && ALLOWED_EXTRA_IDS.has(e),
    );
  }

  const location =
    typeof o.location === "string" ? o.location.trim().slice(0, 500) : "";

  const propertyType = parsePropertyType(o.propertyType);
  const cleaningFrequency =
    o.cleaningFrequency === "weekly" ||
    o.cleaningFrequency === "biweekly" ||
    o.cleaningFrequency === "monthly" ||
    o.cleaningFrequency === "one_time"
      ? o.cleaningFrequency
      : "one_time";
  const subServicesRaw = Array.isArray(o.subServices) ? o.subServices : [];
  const subServices = subServicesRaw.filter((v): v is BookingServiceTypeKey => parseServiceType(v) !== null);
  const notes = typeof o.notes === "string" ? o.notes.slice(0, 1200) : "";

  return syncStep1ServiceFields(
    normalizeStep1ForService({
      selectedCategory,
      service,
      service_group,
      service_type,
      location,
      propertyType,
      subServices,
      notes,
      cleaningFrequency,
      rooms,
      bathrooms,
      extraRooms,
      extras,
    }),
  );
}

/** Read persisted step-1 snapshot (e.g. for Step 2 summary + pricing). SSR-safe: returns null. */
export function loadBookingStep1FromStorage(): BookingStep1State | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BOOKING_STEP1_KEY);
    if (!raw) return null;
    return parseStoredStep1(raw);
  } catch {
    return null;
  }
}

export type UseBookingStep1Return = {
  state: BookingStep1State;
  setState: Dispatch<SetStateAction<BookingStep1State>>;
  hydrated: boolean;
  selectedCategory: ServiceCategoryKind | null;
  setSelectedCategory: (cat: ServiceCategoryKind | null) => void;
  regularServices: (typeof SERVICE_CATEGORIES)[number]["services"];
  specialisedServices: (typeof SERVICE_CATEGORIES)[number]["services"];
  categoryServices: (typeof SERVICE_CATEGORIES)[number]["services"];
  maxRooms: number;
  blockedExtras: Set<string>;
  canContinue: boolean;
  reset: () => void;
  handleContinue: () => void;
  mainTransitionKey: string;
};

export function useBookingStep1(): UseBookingStep1Return {
  const router = useRouter();
  const [state, setState] = useState<BookingStep1State>(initialState);
  const [hydrated, setHydrated] = useState(false);

  const selectedCategory = state.selectedCategory;

  const setSelectedCategory = useCallback((cat: ServiceCategoryKind | null) => {
    setState((s) => ({
      ...s,
      selectedCategory: cat,
      ...(cat === null
        ? { service: null, service_group: null, service_type: null }
        : {}),
    }));
  }, []);

  const regularServices = useMemo(
    () => SERVICE_CATEGORIES.find((c) => c.id === "regular")?.services ?? [],
    [],
  );
  const specialisedServices = useMemo(
    () => SERVICE_CATEGORIES.find((c) => c.id === "specialised")?.services ?? [],
    [],
  );

  const maxRooms = useMemo(() => getMaxRoomsForService(state.service), [state.service]);
  const blockedExtras = useMemo(() => getBlockedExtraIds(state.service), [state.service]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(BOOKING_STEP1_KEY);
        if (raw) {
          const parsed = parseStoredStep1(raw);
          if (parsed) setState(parsed);
        }
      } catch {
        /* ignore corrupt storage */
      } finally {
        setHydrated(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(BOOKING_STEP1_KEY, JSON.stringify(state));
      window.dispatchEvent(new Event("booking-storage-sync"));
    } catch {
      /* quota / private mode */
    }
  }, [state, hydrated]);

  const canContinue =
    state.service !== null && state.rooms >= 1 && state.bathrooms >= 1;

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(BOOKING_STEP1_KEY);
    } catch {
      /* ignore */
    }
    clearLockedBookingFromStorage();
    clearBookingPricePreviewFromStorage();
    clearSelectedCleanerFromStorage();
    setState(initialState);
  }, []);

  const handleContinue = useCallback(() => {
    if (!canContinue) return;
    try {
      localStorage.removeItem(BOOKING_FINAL_KEY);
    } catch {
      /* ignore */
    }
    router.push(bookingFlowHref("when"));
  }, [canContinue, router]);

  const mainTransitionKey = selectedCategory ?? "choose-category";

  const categoryServices =
    selectedCategory === "regular"
      ? regularServices
      : selectedCategory === "specialised"
        ? specialisedServices
        : [];

  return {
    state,
    setState,
    hydrated,
    selectedCategory,
    setSelectedCategory,
    regularServices,
    specialisedServices,
    categoryServices,
    maxRooms,
    blockedExtras,
    canContinue,
    reset,
    handleContinue,
    mainTransitionKey,
  };
}
