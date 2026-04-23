import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo } from "react";
import type { BookingStep1State } from "./BookingStep1";
import {
  EXTRAS_CATALOG,
  bookingExtrasTier,
  extrasDisplayOrderResolved,
  extrasUISections,
  isExtraAllowedForService,
} from "@/lib/pricing/extrasConfig";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";
import { ToggleChip } from "./ToggleChip";

type ExtrasSectionProps = {
  state: BookingStep1State;
  blockedExtras: Set<string>;
  setState: Dispatch<SetStateAction<BookingStep1State>>;
};

export function ExtrasSection({ state, blockedExtras, setState }: ExtrasSectionProps) {
  const sections = useMemo(() => {
    const built = extrasUISections(state.service);
    if (built.length > 0) return built;
    if (!state.service) return [];
    const orderedExtras = extrasDisplayOrderResolved().filter((id) =>
      isExtraAllowedForService(id, state.service),
    );
    if (orderedExtras.length === 0) return [];
    return [{ id: "fallback", title: "Add-ons", extraIds: orderedExtras }];
  }, [state.service]);

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

  if (!state.service || sections.length === 0) {
    return (
      <div className="w-full max-w-none min-w-0">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Choose a service above to see add-ons.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none min-w-0 space-y-5">
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
          <div className="flex w-full max-w-none min-w-0 flex-wrap gap-2">
            {section.extraIds.map((id) => {
              const meta = EXTRAS_CATALOG[id];
              if (!meta) return null;
              return (
                <ToggleChip
                  key={id}
                  id={id}
                  label={meta.label}
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
