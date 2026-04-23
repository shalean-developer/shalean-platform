"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { BookingStep1State } from "@/components/booking/BookingStep1";
import type { Dispatch, SetStateAction } from "react";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import { getSmartExtras } from "@/lib/ai/bookingAssistant";
import type { BookingContext, PastBookingHint } from "@/lib/ai/bookingAssistant";
import { trackAssistantEvent } from "@/lib/booking/trackAssistantEvent";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";
import { bookingExtrasTier } from "@/lib/pricing/extrasConfig";
import type { VipTier } from "@/lib/pricing/vipTier";

type Props = {
  state: BookingStep1State;
  setState: Dispatch<SetStateAction<BookingStep1State>>;
  blockedExtras: Set<string>;
  userTier: VipTier;
  pastHints: PastBookingHint[];
};

export function SmartExtraSuggestions({ state, setState, blockedExtras, userTier, pastHints }: Props) {
  const [flashId, setFlashId] = useState<string | null>(null);
  const { catalog } = useBookingPrice();

  const ctx: BookingContext = useMemo(
    () => ({
      service: state.service ?? "",
      rooms: state.rooms,
      bathrooms: state.bathrooms,
      extras: state.extras,
      userTier,
      pastBookings: pastHints,
    }),
    [state.service, state.rooms, state.bathrooms, state.extras, userTier, pastHints],
  );

  const suggestions = useMemo(() => {
    if (!catalog) return [];
    return getSmartExtras(ctx, catalog).filter((s) => !blockedExtras.has(s.id) && !state.extras.includes(s.id));
  }, [catalog, ctx, blockedExtras, state.extras]);

  if (suggestions.length === 0) return null;

  function add(id: string, price: number) {
    setState((prev) => ({
      ...prev,
      extras: prev.extras.includes(id) ? prev.extras : [...prev.extras, id],
    }));
    trackAssistantEvent("recommendation_clicked", { surface: "step1_extras", extra_id: id });
    trackAssistantEvent("extra_added", { extra_id: id, source: "assistant", price_zar: price });
    trackGrowthEvent("booking_upsell_interaction", {
      action: "add_extra",
      extraId: id,
      service: state.service ?? "",
      type: bookingExtrasTier(state.service),
      step: "details_smart",
    });
    setFlashId(id);
    window.setTimeout(() => setFlashId((x) => (x === id ? null : x)), 1400);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/60 p-5 dark:border-zinc-800 dark:bg-zinc-900/35">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Recommended for your home</h3>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Most customers choose one or two add-ons — pick what fits your visit.
        </p>
      </div>
      <ul className="space-y-2">
        <AnimatePresence mode="popLayout">
          {suggestions.map((s) => (
            <motion.li
              key={s.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-xl border border-zinc-200/90 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{s.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{s.reason}</p>
                  <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    + R {s.price.toLocaleString("en-ZA")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => add(s.id, s.price)}
                  className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 active:scale-[0.98]"
                >
                  Add
                </button>
              </div>
              <AnimatePresence>
                {flashId === s.id ? (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                  >
                    + R {s.price.toLocaleString("en-ZA")} added to your quote
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
