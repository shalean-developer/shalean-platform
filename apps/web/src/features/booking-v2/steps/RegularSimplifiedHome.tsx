"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import { ServiceQuestionOptionCards } from "@/src/features/booking-v2/components/ServiceQuestionOptionCards";
import { HomeSectionHeader } from "@/components/marketing-home/primitives/HomeSectionHeader";
import { FloatingSelect } from "@/components/ui/floating-select";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import { REGULAR_HOME_REQUIRED_QUESTION_KEYS, regularHomeAnswersComplete } from "@/src/features/booking-v2/regularSimplifiedJourneyContract";

type LocationOption = { id: string; name: string; city_id?: string | null; city?: string | null };
type LocationResponse = { ok?: boolean; locations?: LocationOption[]; error?: string };

const questions = SERVICE_CONFIG["regular-cleaning"].step1Questions;

export function RegularSimplifiedHome() {
  const { liveConfig } = useBookingV2();
  const { watch, setValue } = useFormContext<BookingV2FormData>();
  const details = watch("serviceDetails") ?? {};
  const selectedExtras = watch("selectedExtras") ?? [];
  const suburb = watch("suburb") ?? "";
  const locationId = watch("serviceAreaLocationId") ?? "";
  const equipmentRequired = watch("equipmentRequired") ?? "";
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/booking/service-locations?withActiveCleanersOnly=false", { signal: ac.signal })
      .then(async (response) => {
        const json = (await response.json()) as LocationResponse;
        if (!response.ok || json.ok !== true || !Array.isArray(json.locations)) {
          throw new Error("Service areas are temporarily unavailable.");
        }
        setLocations(json.locations.filter((location) => location.id && location.name));
        setLocationError(null);
      })
      .catch((error: unknown) => {
        if (ac.signal.aborted) return;
        setLocationError(error instanceof Error ? error.message : "Could not load service areas.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoadingLocations(false);
      });
    return () => ac.abort();
  }, []);

  const options = useMemo(() => liveConfig?.step1Questions ?? questions, [liveConfig]);
  const extras = liveConfig?.extras ?? SERVICE_CONFIG["regular-cleaning"].extras;
  const ready = regularHomeAnswersComplete({
    serviceDetails: details,
    equipmentRequired,
    suburb,
    serviceAreaLocationId: locationId,
  });

  function updateDetail(key: string, value: string) {
    setValue("serviceDetails", { ...details, [key]: value }, {
      shouldDirty: true, shouldValidate: true,
    });
  }

  function updateEquipment(value: "yes" | "no") {
    setValue("equipmentRequired", value, { shouldDirty: true, shouldValidate: true });
    setValue("equipmentQuote", null, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <section className="space-y-6" aria-label="Your home">
      <HomeSectionHeader
        title="Tell us about your home"
        description="Choose your home details and suburb, then see available dates."
      />

      <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        {options.filter((q) => ["propertyType", "bedrooms", "bathrooms", "extraRooms", "hasPets"].includes(q.key))
          .map((question) => question.key === "propertyType" ? (
            <ServiceQuestionOptionCards
              key={question.key}
              question={{ ...question, required: true }}
              propertyLayout="horizontal"
            />
          ) : (
            <FloatingSelect
              key={question.key}
              label={`${question.label}${REGULAR_HOME_REQUIRED_QUESTION_KEYS.includes(question.key as typeof REGULAR_HOME_REQUIRED_QUESTION_KEYS[number]) ? " *" : ""}`}
              name={`serviceDetails.${question.key}`}
              aria-required={REGULAR_HOME_REQUIRED_QUESTION_KEYS.includes(question.key as typeof REGULAR_HOME_REQUIRED_QUESTION_KEYS[number])}
              value={String(details[question.key] ?? "")}
              onChange={(value) => updateDetail(question.key, value)}
              options={[
                { value: "", label: question.key === "extraRooms" ? "Choose a number (0 if none)" : "Select an answer" },
                ...(question.options ?? []),
              ]}
              labelClassName="text-sm font-semibold text-slate-800"
            />
          ))}
      </div>

      <fieldset className="space-y-2 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">Who will provide cleaning equipment?</legend>
        <p className="text-xs text-slate-600">Shalean equipment delivery has a distance-based fee. Your final fee is confirmed after you enter the street address.</p>
        {([
          { value: "no", label: "I will provide equipment" },
          { value: "yes", label: "Shalean should bring equipment" },
        ] as const).map((choice) => (
          <label key={choice.value} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input
              type="radio"
              name="regular-home-equipment-choice"
              checked={equipmentRequired === choice.value}
              onChange={() => updateEquipment(choice.value)}
              className="accent-primary"
            />
            <span>{choice.label}</span>
          </label>
        ))}
        {equipmentRequired === "yes" && (
          <p role="status" className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-foreground">
            Equipment logistics will be quoted after your full address is confirmed. This is not a final price.
          </p>
        )}
      </fieldset>

      {extras.length > 0 && (
        <fieldset className="space-y-2 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
          <legend className="text-sm font-semibold text-foreground">Optional extras</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {extras.map((extra) => (
              <label key={extra.id} className="flex min-h-11 items-start gap-3 rounded-lg border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={selectedExtras.includes(extra.id)}
                  onChange={(event) => setValue("selectedExtras",
                    event.target.checked
                      ? [...selectedExtras, extra.id]
                      : selectedExtras.filter((id) => id !== extra.id),
                    { shouldDirty: true, shouldValidate: true })}
                  className="mt-1 accent-primary"
                />
                <span><strong>{extra.label}</strong><span className="block text-xs text-slate-600">+R{extra.priceZar} · {extra.description}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="space-y-1.5">
        <FloatingSelect
          label="Cleaning suburb *"
          name="serviceAreaLocationId"
          aria-required
          value={locations.some((location) => location.id === locationId) ? locationId : ""}
          disabled={loadingLocations || Boolean(locationError)}
          onChange={(value) => {
            const location = locations.find((item) => item.id === value);
            setValue("suburb", location?.name ?? "", { shouldDirty: true, shouldValidate: true });
            setValue("serviceAreaLocationId", location?.id ?? "", { shouldDirty: true, shouldValidate: true });
            setValue("serviceAreaCityId", location?.city_id ?? "", { shouldDirty: true });
            if (location?.city) setValue("city", location.city, { shouldDirty: true });
          }}
          options={[
            { value: "", label: loadingLocations ? "Loading suburbs…" : "Select a supported suburb" },
            ...locations.map((location) => ({ value: location.id, label: location.name })),
          ]}
          labelClassName="text-sm font-semibold text-slate-800"
        />
        {locationError && <p role="alert" className="text-xs text-red-700">{locationError}</p>}
      </div>

      <div className="rounded-lg border border-border bg-muted/35 p-4">
        <p className="text-sm font-semibold text-foreground">Home details {ready ? "complete" : "incomplete"}</p>
        <p className="mt-1 text-xs text-slate-600">
          {ready
            ? "The home information is complete. You can continue to see available dates."
            : "Complete the required questions and supported suburb before scheduling."}
        </p>
      </div>

    </section>
  );
}
