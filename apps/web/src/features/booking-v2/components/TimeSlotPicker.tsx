"use client";

import { Loader2, Phone } from "lucide-react";
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
  /** Per `HH:mm` — false = unavailable (no eligible cleaners or area unknown). */
  availability?: Record<string, boolean>;
  loading?: boolean;
  areaResolved?: boolean;
};

export function TimeSlotPicker({
  dateYmd,
  value,
  onChange,
  compact,
  scheduling,
  availability,
  loading = false,
  areaResolved = true,
}: TimeSlotPickerProps) {
  const leadTimeSlots = filterCustomerOnlineBookingTimeSlots(dateYmd, { scheduling });
  const slots =
    availability != null
      ? leadTimeSlots.filter((slot) => availability[slot] === true)
      : areaResolved
        ? leadTimeSlots
        : [];
  const lastSlot =
    buildCustomerBookingTimeSlots(scheduling).at(-1) ?? CUSTOMER_ONLINE_BOOKING_LAST_SLOT;
  const callHref = `tel:${CUSTOMER_SUPPORT_TELEPHONE_E164.replace(/\D/g, "")}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Checking available times…
      </div>
    );
  }

  if (!areaResolved) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        Select a suburb in Step 1 so we can show times with available cleaners in your area.
      </p>
    );
  }

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
          No cleaners are available online for this date in your area. Please choose another day or call us to arrange a
          time.
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
