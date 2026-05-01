"use client";

import { useMemo } from "react";
import { ExtrasStep } from "@/components/booking/steps/ExtrasStep";
import { getBlockedExtraIds, parseBookingServiceId } from "@/components/booking/serviceCategories";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";
import { usePricingCatalog } from "@/lib/pricing/usePricingCatalog";

/**
 * Optional add-ons on step 1 — wraps the existing `ExtrasStep` grid (no UI redesign).
 */
export function AddOnsSection() {
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
      const row = catalog.snapshot.extras[ex.id];
      if (!row?.services?.length) return true;
      return sid ? row.services.includes(sid) : true;
    });
  }, [catalog, service]);

  return (
    <div className="space-y-4 rounded-2xl border border-blue-100/90 bg-white p-6 shadow-sm dark:border-blue-900/40 dark:bg-zinc-900">
      <p className="text-xs font-semibold tracking-wide text-blue-800 dark:text-blue-300">ADD-ONS (OPTIONAL)</p>
      <ExtrasStep value={extras} onChange={(next) => patch({ extras: next })} extras={extrasForStep} loading={loading} />
    </div>
  );
}
