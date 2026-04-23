import type { Dispatch, SetStateAction } from "react";
import type { BookingStep1State } from "./BookingStep1";
import { getMaxRoomsForService } from "./serviceCategories";
import { StepperInput } from "./StepperInput";

const EXTRA_ROOMS_MAX = 10;

type HomeDetailsProps = {
  state: BookingStep1State;
  maxRooms: number;
  setState: Dispatch<SetStateAction<BookingStep1State>>;
  /** Hide the address field when location was captured on an earlier step. */
  omitLocation?: boolean;
};

export function HomeDetails({ state, maxRooms, setState, omitLocation = false }: HomeDetailsProps) {
  return (
    <div className="w-full max-w-none space-y-4">
      {!omitLocation ? (
        <div className="space-y-1.5">
          <label
            htmlFor="booking-location"
            className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
          >
            Service address
          </label>
          <input
            id="booking-location"
            type="text"
            autoComplete="street-address"
            placeholder="Street, suburb, city"
            value={state.location}
            onChange={(e) =>
              setState((p) => ({ ...p, location: e.target.value.slice(0, 500) }))
            }
            className="w-full rounded-xl border border-zinc-200/90 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-primary/80 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-primary/70 dark:focus:ring-primary/15"
          />
        </div>
      ) : null}

      <div className="grid w-full max-w-none min-w-0 grid-cols-3 gap-2 lg:gap-3 lg:items-stretch">
        <StepperInput
          label="Bedrooms"
          description={
            state.service === "quick"
              ? "Bedrooms, living areas — Quick Clean caps main rooms at 5."
              : "Bedrooms, living areas"
          }
          value={state.rooms}
          min={1}
          max={maxRooms}
          onChange={(rooms) =>
            setState((p) => ({
              ...p,
              rooms: Math.min(rooms, getMaxRoomsForService(p.service)),
            }))
          }
        />
        <StepperInput
          label="Bathrooms"
          description="Bathrooms & toilets"
          value={state.bathrooms}
          min={1}
          max={10}
          onChange={(bathrooms) => setState((p) => ({ ...p, bathrooms }))}
        />
        <StepperInput
          label="Extra"
          description="Offices, garages, etc."
          value={state.extraRooms}
          min={0}
          max={EXTRA_ROOMS_MAX}
          onChange={(extraRooms) =>
            setState((p) => ({ ...p, extraRooms }))
          }
        />
      </div>

      {state.rooms <= 2 && state.extraRooms === 0 ? (
        <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/70 p-3.5 text-xs leading-relaxed text-emerald-950 dark:border-emerald-900/45 dark:bg-emerald-950/30 dark:text-emerald-50">
          <p className="font-semibold">Have studies, dens, or garages not counted above?</p>
          <p className="mt-1.5 text-emerald-900/95 dark:text-emerald-100/90">
            Add them as <span className="font-medium">Extra</span> rooms so time and slot prices match the job — first extra from{" "}
            <span className="font-medium tabular-nums">R35</span>, two extras <span className="font-medium tabular-nums">R60</span> (save{" "}
            <span className="font-medium tabular-nums">R10</span>).
          </p>
        </div>
      ) : null}
    </div>
  );
}
