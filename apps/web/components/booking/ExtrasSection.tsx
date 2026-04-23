import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo } from "react";
import type { BookingStep1State } from "./BookingStep1";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import {
  bookingExtrasTier,
  computeBundledExtrasTotalZarSnapshot,
  extrasDisplayOrderResolved,
  extrasUISections,
  mostPopularExtraIdFromSnapshot,
} from "@/lib/pricing/extrasConfig";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";
import { ToggleChip } from "./ToggleChip";

type ExtrasSectionProps = {
  state: BookingStep1State;
  blockedExtras: Set<string>;
  setState: Dispatch<SetStateAction<BookingStep1State>>;
};

const POPULAR_BADGE = "Most popular";

export function ExtrasSection({ state, blockedExtras, setState }: ExtrasSectionProps) {
  const { catalog, orderedExtraSlugs } = useBookingPrice();
  const popularId = useMemo(
    () => (catalog ? mostPopularExtraIdFromSnapshot(catalog, state.service) : null),
    [catalog, state.service],
  );
  const extrasTotalZar = useMemo(() => {
    if (!catalog) return 0;
    return computeBundledExtrasTotalZarSnapshot(catalog, state.extras, state.service);
  }, [catalog, state.extras, state.service]);

  const sections = useMemo(() => {
    if (!catalog) return [];
    const built = extrasUISections(state.service, catalog, orderedExtraSlugs);
    if (built.length > 0) return built;
    if (!state.service) return [];
    const orderedExtras = extrasDisplayOrderResolved(orderedExtraSlugs).filter(
      (id) => state.service != null && catalog.extras[id]?.services.includes(state.service),
    );
    if (orderedExtras.length === 0) return [];
    return [{ id: "fallback", title: "Add-ons", extraIds: orderedExtras }];
  }, [state.service, catalog, orderedExtraSlugs]);

  const toggleExtra = useCallback(
    (id: string) => {
      if (blockedExtras.has(id)) return;
      const tier = bookingExtrasTier(state.service);
      const turningOn = !state.extras.includes(id);
      setState((prev) => ({
        ...prev,
        extras: prev.extras.includes(id)
          ? prev.extras.filter((e) => e !== id)
          : [...prev.extras, id],
      }));
      if (turningOn) {
        trackGrowthEvent("booking_upsell_interaction", {
          action: "toggle_extra",
          extraId: id,
          service: state.service ?? "",
          type: tier,
          step: "details_extras",
        });
      }
    },
    [blockedExtras, setState, state.extras, state.service],
  );

  if (!catalog) {
    return (
      <div className="w-full max-w-none min-w-0">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading add-on prices…</p>
      </div>
    );
  }

  if (!state.service || sections.length === 0) {
    return (
      <div className="w-full max-w-none min-w-0">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Choose a service above to see add-ons.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none min-w-0 space-y-5">
      {state.extras.length > 0 ? (
        <p className="text-sm font-medium tabular-nums text-zinc-800 dark:text-zinc-100">
          Selected add-ons:{" "}
          <span className="text-primary">R {extrasTotalZar.toLocaleString("en-ZA")}</span>
          <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
            (bundled where it saves you money)
          </span>
        </p>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Tap an add-on to see your total update live.</p>
      )}
      {blockedExtras.size > 0 ? (
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Some add-ons aren&apos;t available for this service so we can keep the visit focused and
          efficient.
        </p>
      ) : null}
      {sections.map((section) => (
        <div key={section.id} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {section.title}
          </p>
          <div className="grid w-full max-w-none min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            {section.extraIds.map((id) => {
              const row = catalog.extras[id];
              if (!row) return null;
              const label = row.name ?? id;
              const description = row.description ?? "";
              return (
                <ToggleChip
                  key={id}
                  id={id}
                  label={label}
                  description={description}
                  badge={id === popularId ? POPULAR_BADGE : null}
                  priceLabel={`+R ${row.price.toLocaleString("en-ZA")}`}
                  selected={state.extras.includes(id)}
                  disabled={blockedExtras.has(id)}
                  onToggle={toggleExtra}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
