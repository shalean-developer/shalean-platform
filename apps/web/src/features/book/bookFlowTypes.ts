import type { BookingServiceId } from "@/components/booking/serviceCategories";
import type { HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";

export type BookFlowStep = "service" | "property" | "schedule" | "cleaner" | "auth" | "summary";

export const BOOK_FLOW_STEPS: readonly BookFlowStep[] = [
  "service",
  "property",
  "schedule",
  "cleaner",
  "auth",
  "summary",
] as const;

export type BookCleanerSelection = {
  id: string;
  name: string;
};

export type BookFlowFormState = {
  service: HomeWidgetServiceKey;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
  serviceAreaLocationId: string | null;
  serviceAreaCityId: string | null;
  serviceAreaName: string;
  location: string;
  date: string;
  time: string;
  cleaner: BookCleanerSelection | null;
  /** Server-locked ZAR total from widget-quote */
  estimatedPriceZar: number | null;
};

export function initialBookFlowFormState(): BookFlowFormState {
  return {
    service: "standard",
    bedrooms: 2,
    bathrooms: 1,
    extraRooms: 0,
    extras: [],
    serviceAreaLocationId: null,
    serviceAreaCityId: null,
    serviceAreaName: "",
    location: "",
    date: "",
    time: "",
    cleaner: null,
    estimatedPriceZar: null,
  };
}

export type BookCustomerDetails = {
  fullName: string;
  email: string;
  phone: string;
};

export function bookServiceIdFromForm(service: HomeWidgetServiceKey): BookingServiceId {
  return service as BookingServiceId;
}
