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

export function HomeDetails({
  state,
  maxRooms,
  setState,
  omitLocation = false,
}: HomeDetailsProps) {
  return (
    <div className="w-full max-w-none space-y-4">
      {omitLocation && state.serviceAreaName.trim() ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">Service area:</span>{" "}
          {state.serviceAreaName.trim()}
        </p>
      ) : null}
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

      <div className="grid w-full max-w-none min-w-0 grid-cols-3 items-stretch gap-2 sm:gap-4 md:gap-6 lg:gap-8">
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
    </div>
  );
}
