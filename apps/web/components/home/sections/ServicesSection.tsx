"use client";

import { useMemo } from "react";
import { BookCleaningLink } from "@/components/home/BookCleaningLink";
import { calculateHomeWidgetBaseEstimateZar, type HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";
import { usePricingCatalogSnapshot } from "@/lib/pricing/usePricingCatalogSnapshot";
import { Building2, Home, Layers, Sparkles, Truck } from "lucide-react";

type ServiceCard = {
  title: string;
  description: string;
  icon: typeof Home;
  service: HomeWidgetServiceKey;
  source: string;
};

const services: ServiceCard[] = [
  {
    title: "Standard Cleaning",
    description: "Recurring upkeep for busy households — dust, floors, kitchen, and baths refreshed.",
    icon: Home,
    service: "standard",
    source: "home_services_standard",
  },
  {
    title: "Deep Cleaning",
    description: "Detail pass for neglected corners, grout, and high-touch areas when you need a reset.",
    icon: Sparkles,
    service: "deep",
    source: "home_services_deep",
  },
  {
    title: "Airbnb Cleaning",
    description: "Turnover-ready cleans between guests with checklist speed and photo-friendly finishes.",
    icon: Building2,
    service: "airbnb",
    source: "home_services_airbnb",
  },
  {
    title: "Move-in / Move-out",
    description: "Handover-ready shine for keys day — kitchens, bathrooms, and built-ins included.",
    icon: Truck,
    service: "move",
    source: "home_services_move",
  },
  {
    title: "Carpet Cleaning",
    description: "Lift embedded dust and refresh high-traffic rugs without hauling equipment yourself.",
    icon: Layers,
    service: "carpet",
    source: "home_services_carpet",
  },
];

export function ServicesSection() {
  const { snapshot: catalog } = usePricingCatalogSnapshot();

  const priced = useMemo(() => {
    if (!catalog) return services.map((s) => ({ ...s, from: null as number | null }));
    return services.map((s) => ({ ...s, from: calculateHomeWidgetBaseEstimateZar(s.service, catalog) }));
  }, [catalog]);

  return (
    <section id="services" className="scroll-mt-28 border-b border-blue-100 bg-white py-16" aria-labelledby="services-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="services-heading" className="text-3xl font-bold tracking-tight text-zinc-900">
            Services for every home
          </h2>
          <p className="mt-3 text-gray-600">Pick the clean that matches your space — pricing scales fairly with rooms and extras.</p>
        </div>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {priced.map((s) => {
            const Icon = s.icon;
            return (
              <li
                key={s.title}
                className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-zinc-900">{s.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{s.description}</p>
                <p className="mt-4 text-sm font-semibold text-blue-600">
                  {s.from != null ? `From R ${s.from.toLocaleString("en-ZA")}` : "From —"}
                </p>
                <BookCleaningLink
                  source={s.source}
                  className="mt-4 w-full rounded-xl bg-blue-600 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Book Now
                </BookCleaningLink>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
