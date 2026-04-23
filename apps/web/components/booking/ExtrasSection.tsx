import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";
import type { BookingStep1State } from "./BookingStep1";
import { ToggleChip } from "./ToggleChip";

const EXTRAS: { id: string; label: string }[] = [
  { id: "inside-cabinets", label: "Inside Cabinets" },
  { id: "inside-fridge", label: "Inside Fridge" },
  { id: "inside-oven", label: "Inside Oven" },
  { id: "interior-windows", label: "Interior Windows" },
  { id: "ironing", label: "Ironing" },
];

type ExtrasSectionProps = {
  state: BookingStep1State;
  blockedExtras: Set<string>;
  setState: Dispatch<SetStateAction<BookingStep1State>>;
};

export function ExtrasSection({ state, blockedExtras, setState }: ExtrasSectionProps) {
  const toggleExtra = useCallback(
    (id: string) => {
      if (blockedExtras.has(id)) return;
      setState((prev) => ({
        ...prev,
        extras: prev.extras.includes(id)
          ? prev.extras.filter((e) => e !== id)
          : [...prev.extras, id],
      }));
    },
    [blockedExtras, setState],
  );

  return (
    <div className="w-full max-w-none min-w-0">
      {blockedExtras.size > 0 ? (
        <p className="mb-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Some add-ons aren&apos;t available for this service so we can keep the visit focused and
          efficient.
        </p>
      ) : null}
      <div className="flex w-full max-w-none min-w-0 flex-wrap gap-2">
        {EXTRAS.map((extra) => (
          <ToggleChip
            key={extra.id}
            id={extra.id}
            label={extra.label}
            selected={state.extras.includes(extra.id)}
            disabled={blockedExtras.has(extra.id)}
            onToggle={toggleExtra}
          />
        ))}
      </div>
    </div>
  );
}
