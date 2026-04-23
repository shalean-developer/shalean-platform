"use client";

import type { Dispatch, SetStateAction } from "react";
import { useMemo } from "react";
import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import {
  EXTRAS_CATALOG,
  bookingExtrasTier,
  bundleSavingsZar,
  EXTRA_BUNDLES,
  isExtraAllowedForService,
} from "@/lib/pricing/extrasConfig";
import {
  bundleFullySelected,
  getPrimaryBundleForContext,
  getRecommendedExtraIds,
} from "@/lib/pricing/upsellEngine";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";
import { cn } from "@/lib/utils";

type Props = {
  state: BookingStep1State;
  blockedExtras: Set<string>;
  setState: Dispatch<SetStateAction<BookingStep1State>>;
  /** Shown as “From R …” footnote when set */
  estimateZar?: number | null;
};

export function UpsellRecommendations({ state, blockedExtras, setState, estimateZar }: Props) {
  const recommended = useMemo(
    () =>
      getRecommendedExtraIds(state).filter(
        (id) =>
          !blockedExtras.has(id) &&
          state.service != null &&
          isExtraAllowedForService(id, state.service),
      ),
    [state.service, state.rooms, state.extraRooms, state.extras, blockedExtras],
  );

  const primaryBundle = useMemo(() => getPrimaryBundleForContext(state), [state]);

  const bundleActive = primaryBundle ? bundleFullySelected(primaryBundle, state.extras) : false;
  const bundleSav = primaryBundle ? bundleSavingsZar(primaryBundle, state.service) : 0;

  if (!state.service) return null;
  if (recommended.length === 0 && !primaryBundle) return null;

  function addExtra(id: string) {
    if (blockedExtras.has(id)) return;
    setState((p) => ({
      ...p,
      extras: p.extras.includes(id) ? p.extras : [...p.extras, id],
    }));
    trackGrowthEvent("booking_upsell_interaction", {
      action: "add_extra",
      extraId: id,
      service: state.service ?? "",
      type: bookingExtrasTier(state.service),
      step: "details",
    });
  }

  function toggleBundle(bundleId: string) {
    const b = EXTRA_BUNDLES.find((x) => x.id === bundleId);
    if (!b) return;
    const wasActive = bundleFullySelected(b, state.extras);
    setState((p) => {
      const hasAll = b.items.every((id) => p.extras.includes(id));
      if (hasAll) {
        return {
          ...p,
          extras: p.extras.filter((id) => !b.items.includes(id)),
        };
      }
      const merged = [...new Set([...p.extras, ...b.items])];
      return { ...p, extras: merged };
    });
    trackGrowthEvent("booking_upsell_interaction", {
      action: wasActive ? "remove_bundle" : "add_bundle",
      bundleId,
      service: state.service ?? "",
      type: bookingExtrasTier(state.service),
      step: "details",
    });
  }

  return (
    <section
      className="w-full max-w-none space-y-3 rounded-2xl border border-emerald-200/70 bg-gradient-to-b from-emerald-50/90 to-white p-4 dark:border-emerald-900/40 dark:from-emerald-950/30 dark:to-zinc-950/40"
      aria-label="Suggested add-ons"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
          Most customers add this
        </p>
        <h3 className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Complete your clean</h3>
        <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
          Smart picks for homes like yours. Bundles include instant savings at checkout.
        </p>
      </div>

      {recommended.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {recommended.slice(0, 4).map((id) => {
            const meta = EXTRAS_CATALOG[id];
            if (!meta) return null;
            const on = state.extras.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => addExtra(id)}
                disabled={blockedExtras.has(id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  on
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-emerald-300/80 bg-white text-emerald-900 hover:border-emerald-500 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-100",
                  blockedExtras.has(id) && "pointer-events-none opacity-40",
                )}
              >
                {meta.label} · +R{meta.price}
              </button>
            );
          })}
        </div>
      ) : null}

      {primaryBundle && bundleSav > 0 ? (
        <div className="rounded-xl border-2 border-amber-400/80 bg-amber-50/80 p-3 dark:border-amber-700/60 dark:bg-amber-950/25">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                Deal · Save R{bundleSav}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{primaryBundle.label}</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{primaryBundle.blurb}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleBundle(primaryBundle.id)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition",
                bundleActive
                  ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                  : "bg-amber-600 text-white hover:bg-amber-700",
              )}
            >
              {bundleActive ? "Remove" : `R${primaryBundle.price}`}
            </button>
          </div>
        </div>
      ) : null}

      {estimateZar != null && Number.isFinite(estimateZar) ? (
        <p className="text-center text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
          From{" "}
          <span className="tabular-nums text-zinc-900 dark:text-zinc-100">R {estimateZar.toLocaleString("en-ZA")}</span>{" "}
          with your current add-ons — pick a time next to see slot-accurate totals.
        </p>
      ) : null}
    </section>
  );
}
