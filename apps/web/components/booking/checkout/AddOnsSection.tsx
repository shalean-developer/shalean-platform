"use client";

import { useEffect, useMemo } from "react";
import { ExtrasStep } from "@/components/booking/steps/ExtrasStep";
import { getBlockedExtraIds, parseBookingServiceId } from "@/components/booking/serviceCategories";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";
import { isExtraAllowedForService } from "@/lib/pricing/extrasConfig";
import { usePricingCatalog } from "@/lib/pricing/usePricingCatalog";

type AddOnsSectionProps = {
  /** Inside collapsible details — no outer marketing card. */
  layout?: "card" | "embedded";
};

/**
 * Optional add-ons on step 1 — wraps the existing `ExtrasStep` grid.
 */
export function AddOnsSection({ layout = "card" }: AddOnsSectionProps) {
  const { data: catalog, loading } = usePricingCatalog();
  const service = useBookingCheckoutStore((s) => s.service);
  const extras = useBookingCheckoutStore((s) => s.extras);
  const patch = useBookingCheckoutStore((s) => s.patch);

  const extrasForStep = useMemo(() => {
    if (!catalog?.extras?.length) return [];
    const sid = parseBookingServiceId(service);
    const blocked = getBlockedExtraIds(sid);
    return catalog.extras.filter((ex) => {
      if (blocked.has(ex.id)) return false;
      if (!catalog.snapshot) return true;
      return isExtraAllowedForService(ex.id, sid, catalog.snapshot);
    });
  }, [catalog, service]);

  useEffect(() => {
    if (!catalog?.snapshot) return;
    const allowed = new Set(extrasForStep.map((extra) => extra.id));
    const next = extras.filter((id) => allowed.has(id));
    if (next.length !== extras.length) patch({ extras: next });
  }, [catalog?.snapshot, extras, extrasForStep, patch]);

  if (layout === "embedded") {
    return (
      <div className="w-full space-y-3">
        <ExtrasStep value={extras} onChange={(next) => patch({ extras: next })} extras={extrasForStep} loading={loading} />
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 rounded-2xl border border-transparent bg-transparent p-4 shadow-none sm:border-blue-100/90 sm:bg-white sm:p-5 sm:shadow-sm md:p-6 dark:border-transparent dark:bg-transparent sm:dark:border-blue-900/40 sm:dark:bg-zinc-900 sm:dark:shadow-none">
      <p className="text-xs font-semibold tracking-wide text-blue-800 dark:text-blue-300">ADD-ONS (OPTIONAL)</p>
      <ExtrasStep value={extras} onChange={(next) => patch({ extras: next })} extras={extrasForStep} loading={loading} />
    </div>
  );
}
