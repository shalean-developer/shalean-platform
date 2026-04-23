"use client";

import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import { patchPersistedBookingStep1 } from "@/components/booking/useBookingStep1";
import { bookingExtrasTier, bundleSavingsZar } from "@/lib/pricing/extrasConfig";
import { bundleFullySelected, getPrimaryBundleForContext } from "@/lib/pricing/upsellEngine";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";

type Props = {
  state: BookingStep1State;
};

export function ScheduleUpsellBar({ state }: Props) {
  const bundle = getPrimaryBundleForContext(state);
  if (!bundle || bundleFullySelected(bundle, state.extras)) return null;
  const save = bundleSavingsZar(bundle, state.service);

  return (
    <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-50">
      <p className="font-semibold">Complete your clean</p>
      <p className="mt-1 text-xs leading-relaxed opacity-95">
        Add <span className="font-medium">{bundle.label}</span> — {bundle.blurb}. Save{" "}
        <span className="font-semibold tabular-nums">R{save}</span> vs booking separately.
      </p>
      <button
        type="button"
        onClick={() => {
          patchPersistedBookingStep1((p) => ({
            ...p,
            extras: [...new Set([...p.extras, ...bundle.items])],
          }));
          trackGrowthEvent("booking_upsell_interaction", {
            action: "add_bundle",
            bundleId: bundle.id,
            service: state.service ?? "",
            type: bookingExtrasTier(state.service),
            step: "schedule",
          });
        }}
        className="mt-3 w-full rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500 sm:w-auto"
      >
        Add bundle · R{bundle.price}
      </button>
    </div>
  );
}
