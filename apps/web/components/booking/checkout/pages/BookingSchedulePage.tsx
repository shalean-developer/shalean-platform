"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { BookingSectionCard } from "@/components/booking/checkout/BookingSectionCard";
import type { ServiceAreaSelection } from "@/components/booking/ServiceAreaPicker";
import { ScheduleStep } from "@/components/booking/steps/ScheduleStep";
import { Button } from "@/components/ui/button";
import {
  checkoutSegmentPath,
  nextCheckoutSegment,
  prevCheckoutSegment,
  scheduleStepComplete,
} from "@/lib/booking/bookingCheckoutGuards";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";
import { withBookingQuery } from "@/lib/booking/bookingUrl";
import { bookingCopy } from "@/lib/booking/copy";

const scheduleCopy = bookingCopy.checkoutSchedule;

export function BookingSchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = useBookingCheckoutStore((s) => s.date);
  const time = useBookingCheckoutStore((s) => s.time);
  const location = useBookingCheckoutStore((s) => s.location);
  const locationSlug = useBookingCheckoutStore((s) => s.locationSlug);
  const serviceAreaLocationId = useBookingCheckoutStore((s) => s.serviceAreaLocationId);
  const serviceAreaName = useBookingCheckoutStore((s) => s.serviceAreaName);
  const patch = useBookingCheckoutStore((s) => s.patch);

  const scheduleComplete = scheduleStepComplete({ date, time, location });
  const prevSeg = prevCheckoutSegment("schedule");
  const nextSeg = nextCheckoutSegment("schedule");

  const goBack = () => {
    if (!prevSeg) return;
    router.push(withBookingQuery(checkoutSegmentPath(prevSeg), searchParams));
  };

  const goNext = () => {
    if (!scheduleComplete || !nextSeg) return;
    router.push(withBookingQuery(checkoutSegmentPath(nextSeg), searchParams));
  };

  return (
    <BookingSectionCard>
      <ScheduleStep
        date={date}
        time={time}
        location={location}
        locationSlug={locationSlug}
        serviceAreaLocationId={serviceAreaLocationId}
        serviceAreaName={serviceAreaName}
        onDateChange={(d) => patch({ date: d })}
        onTimeChange={(t) => patch({ time: t })}
        onLocationChange={(loc) => patch({ location: loc })}
        onServiceAreaChange={(next: ServiceAreaSelection) =>
          patch({
            serviceAreaLocationId: next.locationId,
            serviceAreaCityId: next.cityId,
            serviceAreaName: next.name,
            locationSlug: null,
          })
        }
        onAreaHintSelect={(slug, displayName) =>
          patch({
            locationSlug: slug,
            serviceAreaName: displayName,
            serviceAreaLocationId: null,
            serviceAreaCityId: null,
          })
        }
      />

      <div className="mt-6 flex gap-3 border-t border-zinc-100 pt-5 lg:hidden dark:border-zinc-800">
        <Button
          type="button"
          variant="outline"
          size="xl"
          className="h-12 flex-1 rounded-xl border-gray-200 font-semibold text-zinc-700 transition-all duration-200 hover:bg-gray-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
          disabled={!prevSeg}
          onClick={goBack}
        >
          Back
        </Button>
        <Button
          type="button"
          size="xl"
          className="h-12 min-w-0 flex-[1.35] rounded-xl font-semibold shadow-sm transition-all duration-200 hover:bg-blue-600/95 disabled:opacity-60 dark:hover:bg-blue-500/95"
          disabled={!scheduleComplete || !nextSeg}
          onClick={goNext}
        >
          {scheduleCopy.continueToCleaner}
        </Button>
      </div>
    </BookingSectionCard>
  );
}
