import type { Dispatch, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Archive,
  Bed,
  Droplets,
  Fence,
  Layers,
  Microwave,
  Package,
  Refrigerator,
  Shirt,
  Sparkles,
  Sun,
  UserPlus,
  Warehouse,
  WashingMachine,
  Wind,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import type { BookingStep1State } from "./BookingStep1";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import {
  bookingExtrasTier,
  extrasDisplayOrderResolved,
  extrasUISections,
  mostPopularExtraIdFromSnapshot,
} from "@/lib/pricing/extrasConfig";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";
import { cn } from "@/lib/utils";

type ExtrasSectionProps = {
  state: BookingStep1State;
  blockedExtras: Set<string>;
  setState: Dispatch<SetStateAction<BookingStep1State>>;
};

const POPULAR_BADGE = "★";

function iconForExtraSlug(slug: string): LucideIcon {
  switch (slug) {
    case "inside-cabinets":
      return Archive;
    case "inside-oven":
      return Microwave;
    case "inside-fridge":
      return Refrigerator;
    case "interior-walls":
      return Layers;
    case "ironing":
      return Shirt;
    case "laundry":
      return WashingMachine;
    case "interior-windows":
      return AppWindow;
    case "water-plants":
      return Droplets;
    case "balcony-cleaning":
      return Fence;
    case "carpet-cleaning":
      return Sparkles;
    case "mattress-cleaning":
      return Bed;
    case "ceiling-cleaning":
      return Wind;
    case "garage-cleaning":
      return Warehouse;
    case "outside-windows":
      return Sun;
    case "extra-cleaner":
      return UserPlus;
    case "supplies-kit":
      return Package;
    default:
      return Package;
  }
}

/** Two-line label under icon (balanced split). */
function labelLines(label: string): [string, string | null] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [label, null];
  if (words.length === 1) return [words[0]!, null];
  if (words.length === 2) return [words[0]!, words[1]!];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

type ExtraCircleProps = {
  id: string;
  label: string;
  selected: boolean;
  disabled?: boolean;
  badge?: string | null;
  priceLabel: string;
  onToggle: (id: string) => void;
};

function ExtraCircleToggle({ id, label, selected, disabled, badge, priceLabel, onToggle }: ExtraCircleProps) {
  const Icon = iconForExtraSlug(id);
  const [line1, line2] = labelLines(label);

  /** Explicit stroke hex — Lucide uses `stroke="currentColor"` by default; in this layout `currentColor` did not paint until selected. */
  const iconColor = selected ? "#ffffff" : disabled ? "#a1a1aa" : "#2563eb";

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return;
        onToggle(id);
      }}
      className={cn(
        "group flex w-[5.25rem] flex-col items-center gap-2 sm:w-[5.75rem]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer active:scale-[0.98]",
      )}
    >
      <span className="relative flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center sm:h-[4.5rem] sm:w-[4.5rem]">
        {badge ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-amber-950 shadow-sm ring-2 ring-white dark:ring-zinc-950"
            aria-label="Popular add-on"
          >
            {badge}
          </span>
        ) : null}
        <span
          className={cn(
            "flex h-full w-full items-center justify-center overflow-visible rounded-full border-2 bg-white transition-[border-color,background-color,box-shadow,transform] duration-200",
            selected
              ? "border-blue-700 bg-blue-600 text-white shadow-md shadow-blue-600/30"
              : "border-blue-600 text-blue-600 group-hover:border-blue-500 group-hover:bg-blue-50 dark:border-blue-500 dark:bg-zinc-950 dark:text-blue-400 dark:group-hover:bg-blue-950/50",
            disabled && "border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600",
          )}
        >
          <Icon
            className="pointer-events-none h-[1.35rem] w-[1.35rem] shrink-0 sm:h-6 sm:w-6"
            color={iconColor}
            strokeWidth={2}
            aria-hidden
          />
        </span>
      </span>
      <span className="w-full text-center">
        <span
          className={cn(
            "block text-[11px] font-semibold leading-tight text-zinc-800 dark:text-zinc-100 sm:text-xs",
            line2 ? "" : "line-clamp-2",
          )}
        >
          {line1}
          {line2 ? (
            <>
              <br />
              {line2}
            </>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[10px] font-semibold tabular-nums text-blue-600 dark:text-blue-400">
          {priceLabel}
        </span>
      </span>
    </button>
  );
}

export function ExtrasSection({ state, blockedExtras, setState }: ExtrasSectionProps) {
  const { catalog, orderedExtraSlugs } = useBookingPrice();
  const popularId = useMemo(
    () => (catalog ? mostPopularExtraIdFromSnapshot(catalog, state.service) : null),
    [catalog, state.service],
  );

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
        extras: prev.extras.includes(id) ? prev.extras.filter((e) => e !== id) : [...prev.extras, id],
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
    <div className="w-full max-w-none min-w-0 space-y-8">
      {blockedExtras.size > 0 ? (
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Some add-ons aren&apos;t available for this service so we can keep the visit focused and efficient.
        </p>
      ) : null}
      {sections.map((section) => (
        <div key={section.id} className="min-w-0">
          <div className="grid grid-cols-3 justify-items-start gap-x-3 gap-y-8 sm:grid-cols-4 sm:gap-x-4 lg:grid-cols-6">
            {section.extraIds.map((id) => {
              const row = catalog.extras[id];
              if (!row) return null;
              const label = row.name ?? id;
              return (
                <ExtraCircleToggle
                  key={id}
                  id={id}
                  label={label}
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
