"use client";

import { BookingSectionCard } from "@/components/booking/checkout/BookingSectionCard";
import type { ServiceAreaSelection } from "@/components/booking/ServiceAreaPicker";
import { ScheduleStep } from "@/components/booking/steps/ScheduleStep";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";

export function BookingSchedulePage() {
  const date = useBookingCheckoutStore((s) => s.date);
  const time = useBookingCheckoutStore((s) => s.time);
  const location = useBookingCheckoutStore((s) => s.location);
  const locationSlug = useBookingCheckoutStore((s) => s.locationSlug);
  const serviceAreaLocationId = useBookingCheckoutStore((s) => s.serviceAreaLocationId);
  const serviceAreaName = useBookingCheckoutStore((s) => s.serviceAreaName);
  const patch = useBookingCheckoutStore((s) => s.patch);

  return (
    <BookingSectionCard eyebrow="Schedule & address">
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
    </BookingSectionCard>
  );
}
