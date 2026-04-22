import type { Dispatch, SetStateAction } from "react";
import type { BookingStep1State } from "./BookingStep1";
import { ServiceCard } from "./ServiceCard";
import type { ServiceItem } from "./serviceCategories";
import { withBookingServiceSelection } from "./serviceCategories";

type ServiceSelectionProps = {
  services: ServiceItem[];
  state: BookingStep1State;
  setState: Dispatch<SetStateAction<BookingStep1State>>;
};

export function ServiceSelection({ services, state, setState }: ServiceSelectionProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((service) => (
        <ServiceCard
          key={service.id}
          service={service}
          selected={state.service === service.id}
          onClick={() => setState((p) => withBookingServiceSelection(p, service.id))}
        />
      ))}
    </div>
  );
}
