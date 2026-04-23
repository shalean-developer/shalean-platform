import { defaultBookingTimeForDate, todayBookingYmd } from "@/lib/booking/bookingTimeSlots";
import type { HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";

export type ConversionBookingFormState = {
  service: HomeWidgetServiceKey;
  bedrooms: number;
  bathrooms: number;
  /** Extra living spaces (0–5); `5` = “5+” in UI copy. */
  extraRooms: number;
  extras: string[];
  date: string;
  time: string;
  /** Server-confirmed total (ZAR); set once when the slot is locked — never recomputed in UI. */
  price: number | null;
  email: string;
  name: string;
  phone: string;
  address: string;
};

export const CONVERSION_CHECKOUT_STORAGE_KEY = "shalean_conversion_checkout";

export function initialConversionFormState(): ConversionBookingFormState {
  const ymd = todayBookingYmd();
  return {
    service: "standard",
    bedrooms: 2,
    bathrooms: 1,
    extraRooms: 0,
    extras: [],
    date: ymd,
    time: defaultBookingTimeForDate(ymd),
    price: null,
    email: "",
    name: "",
    phone: "",
    address: "",
  };
}
