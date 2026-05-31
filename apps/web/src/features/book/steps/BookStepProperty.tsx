"use client";

import { HomeDetails } from "@/components/booking/HomeDetails";
import { ServiceAreaPicker } from "@/components/booking/ServiceAreaPicker";
import { INITIAL_BOOKING_STEP1_STATE, type BookingStep1State } from "@/components/booking/useBookingStep1";
import { getMaxRoomsForService } from "@/components/booking/serviceCategories";
import type { BookFlowFormState } from "@/src/features/book/bookFlowTypes";
import { bookServiceIdFromForm } from "@/src/features/book/bookFlowTypes";
import { useMemo } from "react";

type BookStepPropertyProps = {
  form: BookFlowFormState;
  onChange: (patch: Partial<BookFlowFormState>) => void;
};

function formToStep1(form: BookFlowFormState): BookingStep1State {
  const service = bookServiceIdFromForm(form.service);
  return {
    ...INITIAL_BOOKING_STEP1_STATE,
    service,
    rooms: form.bedrooms,
    bathrooms: form.bathrooms,
    extraRooms: form.extraRooms,
    location: form.location,
    serviceAreaLocationId: form.serviceAreaLocationId,
    serviceAreaCityId: form.serviceAreaCityId,
    serviceAreaName: form.serviceAreaName,
    allowLocationTextFallback: true,
  };
}

export function BookStepProperty({ form, onChange }: BookStepPropertyProps) {
  const step1 = useMemo(() => formToStep1(form), [form]);
  const maxRooms = getMaxRoomsForService(step1.service);

  return (
    <section className="space-y-6" aria-labelledby="book-step-property-heading">
      <div>
        <h1
          id="book-step-property-heading"
          className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Property details
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Tell us where to clean and how big the home is.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="book-service-area" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Suburb
        </label>
        <ServiceAreaPicker
          id="book-service-area"
          value={form.serviceAreaLocationId}
          placeholder="Select your suburb"
          onChange={(next) =>
            onChange({
              serviceAreaLocationId: next.locationId,
              serviceAreaCityId: next.cityId,
              serviceAreaName: next.name,
            })
          }
        />
      </div>

      <HomeDetails
        state={step1}
        maxRooms={maxRooms}
        setState={(updater) => {
          const next = typeof updater === "function" ? updater(step1) : updater;
          onChange({
            bedrooms: next.rooms,
            bathrooms: next.bathrooms,
            extraRooms: next.extraRooms,
            location: next.location,
          });
        }}
      />
    </section>
  );
}
