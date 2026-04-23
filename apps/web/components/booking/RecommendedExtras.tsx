"use client";

import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { BookingStep1State } from "@/components/booking/BookingStep1";
import { getSmartExtras } from "@/lib/ai/bookingAssistant";
import type { BookingContext, PastBookingHint } from "@/lib/ai/bookingAssistant";
import type { VipTier } from "@/lib/pricing/vipTier";
import { cn } from "@/lib/utils";

type Props = {
  state: BookingStep1State;
  setState: Dispatch<SetStateAction<BookingStep1State>>;
  blockedExtras: Set<string>;
  userTier: VipTier;
  pastHints: PastBookingHint[];
};

export function RecommendedExtras({ state, setState, blockedExtras, userTier, pastHints }: Props) {
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
    return getSmartExtras(ctx).filter((s) => !blockedExtras.has(s.id));
  }, [ctx, blockedExtras]);

  if (suggestions.length === 0) return null;

  function toggle(id: string) {
    setState((prev) => ({
      ...prev,
      extras: prev.extras.includes(id) ? prev.extras.filter((x) => x !== id) : [...prev.extras, id],
    }));
  }

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/35">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Recommended for your home</h3>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Popular add-ons based on your current selection.</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {suggestions.map((s) => {
          const added = state.extras.includes(s.id);
          return (
            <article
              key={s.id}
              className="min-w-[220px] rounded-xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{s.label}</p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{s.reason}</p>
              <p className="mt-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">+ R {s.price.toLocaleString("en-ZA")}</p>
              <button
                type="button"
                onClick={() => toggle(s.id)}
                className={cn(
                  "mt-3 w-full rounded-lg px-3 py-2 text-xs font-semibold transition",
                  added ? "bg-blue-100 text-blue-700 hover:bg-blue-200" : "bg-blue-600 text-white hover:bg-blue-700",
                )}
              >
                {added ? "Added" : "Add"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
