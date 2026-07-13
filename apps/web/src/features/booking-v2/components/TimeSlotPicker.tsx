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
import { SOFT_FULFILLMENT_CUSTOMER_COPY } from "@/lib/booking/bookingFulfillmentMode";

export type SlotFulfillmentMode = "instant" | "ops_assignment" | "area_review";

type TimeSlotPickerProps = {
  dateYmd: string;
  value: string;
  onChange: (slot: string) => void;
  compact?: boolean;
  scheduling?: Partial<BookingV2SchedulingConfig>;
  /** Per `HH:mm` — false = unavailable. Soft fulfillment may still show reserve slots. */
  availability?: Record<string, boolean>;
  /** Per-slot fulfillment when soft path is active. */
  fulfillmentBySlot?: Record<string, SlotFulfillmentMode>;
  loading?: boolean;
  areaResolved?: boolean;
  dayFulfillmentMode?: SlotFulfillmentMode | null;
};

export function TimeSlotPicker({
  dateYmd,
  value,
  onChange,
  compact,
  scheduling,
  availability,
  fulfillmentBySlot,
  loading = false,
  areaResolved = true,
  dayFulfillmentMode = null,
}: TimeSlotPickerProps) {
  const leadTimeSlots = filterCustomerOnlineBookingTimeSlots(dateYmd, { scheduling });
  /** While the API is in flight, still paint lead-time slots so Step 2 never blank-spins for seconds. */
  const provisional = loading && areaResolved;
  const slots =
    provisional
      ? leadTimeSlots
      : availability != null
        ? leadTimeSlots.filter((slot) => availability[slot] === true)
        : areaResolved
          ? leadTimeSlots
          : [];
  const lastSlot =
    buildCustomerBookingTimeSlots(scheduling).at(-1) ?? CUSTOMER_ONLINE_BOOKING_LAST_SLOT;
  const callHref = `tel:${CUSTOMER_SUPPORT_TELEPHONE_E164.replace(/\D/g, "")}`;

  const softBannerMode: SlotFulfillmentMode | null = provisional
    ? null
    : dayFulfillmentMode === "ops_assignment" || dayFulfillmentMode === "area_review"
      ? dayFulfillmentMode
      : slots.length > 0 &&
          slots.every((s) => (fulfillmentBySlot?.[s] ?? "instant") !== "instant")
        ? (fulfillmentBySlot?.[slots[0]!] ?? null)
        : null;

  if (!areaResolved) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        Select a suburb in Step 1 so we can show times for your area.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {provisional ? (
        <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
          Confirming which times are free in your area…
        </p>
      ) : null}
      {softBannerMode === "ops_assignment" ? (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-950">
          {SOFT_FULFILLMENT_CUSTOMER_COPY.opsAssignment}
        </p>
      ) : null}
      {softBannerMode === "area_review" ? (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-950">
          {SOFT_FULFILLMENT_CUSTOMER_COPY.areaReview}
        </p>
      ) : null}

      {slots.length > 0 ? (
        <div className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}>
          {slots.map((slot) => {
            const selected = value === slot;
            const mode = provisional ? "instant" : (fulfillmentBySlot?.[slot] ?? "instant");
            return (
              <button
                key={slot}
                type="button"
                onClick={() => onChange(slot)}
                className={cn(
                  "min-h-11 rounded-xl border text-center font-semibold transition",
                  compact ? "px-2 py-2.5 text-sm" : "px-3 py-3 text-sm",
                  selected
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/60",
                  provisional && !selected ? "opacity-90" : null,
                )}
              >
                <span className="block">{formatCustomerBookingSlotLabel(slot)}</span>
                {mode === "ops_assignment" || mode === "area_review" ? (
                  <span
                    className={cn(
                      "mt-0.5 block text-[10px] font-medium uppercase tracking-wide",
                      selected ? "text-blue-100" : "text-slate-500",
                    )}
                  >
                    Reserve
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-950">
          <p className="font-semibold">We can still reserve your booking</p>
          <p>{SOFT_FULFILLMENT_CUSTOMER_COPY.noInstantSlotsDay}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={callHref}
              className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 ring-1 ring-blue-200"
            >
              <Phone className="h-3.5 w-3.5" />
              Call office
            </a>
          </div>
        </div>
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
