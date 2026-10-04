"use client";

import { useEffect, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";
import { Loader2 } from "lucide-react";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import { serviceRequiresCustomerEquipmentChoice } from "@/lib/booking-v2/serviceSuppliesPolicy";
import type { EquipmentQuoteResult } from "@/lib/booking-v2/equipmentPricing";
import { coerceYesNoValue } from "@/src/features/booking-v2/components/serviceQuestionYesNo";
import { YesNoToggleRow } from "@/src/features/booking-v2/components/YesNoToggleRow";

function addressReady(address: string, suburb: string): boolean {
  return address.trim().length >= 5 && suburb.trim().length >= 2;
}

export function EquipmentSection() {
  const { serviceSlug, liveConfig } = useBookingV2();
  const { watch, setValue, formState: { errors } } = useFormContext<BookingV2FormData>();

  const showEquipmentQuestion =
    liveConfig?.showEquipmentQuestion ??
    liveConfig?.showCleaningProductsQuestion ??
    serviceRequiresCustomerEquipmentChoice(serviceSlug);

  const equipmentRequired = coerceYesNoValue(watch("equipmentRequired"));
  const address = watch("address") ?? "";
  const suburb = watch("suburb") ?? "";
  const city = watch("city") ?? "Cape Town";
  const postalCode = watch("postalCode") ?? "";

  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canQuote = addressReady(address, suburb);
  const addressBlocked = equipmentRequired === "yes" && !canQuote;

  useEffect(() => {
    if (!showEquipmentQuestion) return;

    if (equipmentRequired !== "yes") {
      setValue("equipmentQuote", null, { shouldDirty: true });
      setFetchError(null);
      setLoading(false);
      abortRef.current?.abort();
      return;
    }

    if (!canQuote) {
      setValue("equipmentQuote", null, { shouldDirty: true });
      return;
    }

    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setFetchError(null);

      try {
        const res = await fetch("/api/booking-v2/equipment-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: address.trim(),
            suburb: suburb.trim(),
            city: city.trim() || "Cape Town",
            postalCode: postalCode.trim(),
            equipmentRequired: true,
          }),
          signal: controller.signal,
        });

        const json = (await res.json()) as {
          quote?: EquipmentQuoteResult | null;
          error?: string;
        };

        if (!res.ok) {
          setFetchError(json.error ?? "Could not calculate equipment fee.");
          setValue("equipmentQuote", null, { shouldDirty: true });
          return;
        }

        setValue("equipmentQuote", json.quote ?? null, { shouldDirty: true });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setFetchError("Could not calculate equipment fee.");
        setValue("equipmentQuote", null, { shouldDirty: true });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    showEquipmentQuestion,
    equipmentRequired,
    address,
    suburb,
    city,
    postalCode,
    canQuote,
    setValue,
  ]);

  if (!showEquipmentQuestion) return null;

  const equipmentQuote = watch("equipmentQuote");
  const equipmentError = errors.equipmentRequired?.message as string | undefined;

  return (
    <section className="space-y-3" data-lpignore="true">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Equipment
        </h3>
      </div>

      <YesNoToggleRow
        label="Need Shalean to bring cleaning equipment?"
        hint="Equipment delivery and collection is charged based on distance from our equipment base. Minimum fee applies."
        required
        checked={equipmentRequired === "yes"}
        onCheckedChange={(next) =>
          setValue("equipmentRequired", next ? "yes" : "no", { shouldDirty: true, shouldValidate: true })
        }
        error={equipmentError}
      />

      {addressBlocked && (
        <p className="text-center text-xs text-amber-600">
          Enter your address above to calculate the equipment fee.
        </p>
      )}

      {equipmentRequired === "yes" && canQuote && loading && (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Calculating equipment fee…
        </div>
      )}

      {fetchError && (
        <p className="text-center text-xs text-red-500">{fetchError}</p>
      )}

      {equipmentRequired === "yes" && equipmentQuote?.manual_quote_required && !loading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
          {equipmentQuote.manual_quote_message}
          {equipmentQuote.distance_km > 0 && (
            <span className="mt-1 block text-xs text-amber-700">
              Distance: {equipmentQuote.distance_km} km
            </span>
          )}
        </div>
      )}

      {equipmentRequired === "yes" &&
        equipmentQuote &&
        !equipmentQuote.manual_quote_required &&
        equipmentQuote.logistics_fee > 0 &&
        !loading && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-700">
            Equipment logistics fee:{" "}
            <span className="font-semibold">
              R{equipmentQuote.logistics_fee.toLocaleString("en-ZA")}
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              {equipmentQuote.distance_km} km from base · R{equipmentQuote.base_fee} base + R
              {equipmentQuote.distance_charge} distance
            </span>
          </div>
        )}
    </section>
  );
}
