"use client";

import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildCustomerBookingTimeSlots,
  CUSTOMER_ONLINE_BOOKING_LAST_SLOT,
  filterCustomerOnlineBookingTimeSlots,
  formatCustomerBookingSlotLabel,
} from "@/lib/booking-v2/customerBookingTimeSlots";
import type { BookingV2SchedulingConfig } from "@/lib/booking-v2/bookingV2CatalogTypes";
import { CUSTOMER_SUPPORT_TELEPHONE_E164 } from "@/lib/site/customerSupport";

type TimeSlotPickerProps = {
  dateYmd: string;
  value: string;
  onChange: (slot: string) => void;
  compact?: boolean;
  scheduling?: Partial<BookingV2SchedulingConfig>;
};

export function TimeSlotPicker({ dateYmd, value, onChange, compact, scheduling }: TimeSlotPickerProps) {
  const slots = filterCustomerOnlineBookingTimeSlots(dateYmd, { scheduling });
  const lastSlot =
    buildCustomerBookingTimeSlots(scheduling).at(-1) ?? CUSTOMER_ONLINE_BOOKING_LAST_SLOT;
  const callHref = `tel:${CUSTOMER_SUPPORT_TELEPHONE_E164.replace(/\D/g, "")}`;

  return (
    <div className="space-y-3">
      {slots.length > 0 ? (
        <div className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}>
          {slots.map((slot) => {
            const selected = value === slot;
            return (
              <button
                key={slot}
                type="button"
                onClick={() => onChange(slot)}
                className={cn(
                  "rounded-xl border text-center font-semibold transition",
                  compact ? "px-2 py-2.5 text-sm" : "px-3 py-3 text-sm",
                  selected
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/60",
                )}
              >
                {formatCustomerBookingSlotLabel(slot)}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          No online slots left for this date. Please choose another day or call us to arrange a time.
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
        <p>
          Online booking is available until{" "}
          <span className="font-semibold text-slate-800">
            {formatCustomerBookingSlotLabel(lastSlot)}
          </span>
          .
        </p>
        <p className="mt-1">
          Need a later time?{" "}
          <a href={callHref} className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline">
            <Phone className="h-3.5 w-3.5" />
            Call us to book
          </a>
        </p>
      </div>
    </div>
  );
}
