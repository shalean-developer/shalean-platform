"use client";

import { useMemo } from "react";
import Link from "next/link";
import { BookCleaningLink } from "@/components/home/BookCleaningLink";
import { calculateHomeWidgetBaseEstimateZar, type HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";
import { usePricingCatalogSnapshot } from "@/lib/pricing/usePricingCatalogSnapshot";
import { Building2, Home, Layers, Sparkles, Truck } from "lucide-react";

type ServiceCard = {
  title: string;
  description: string;
  icon: typeof Home;
  service: HomeWidgetServiceKey;
  servicePage: string;
  source: string;
};

const services: ServiceCard[] = [
  {
    title: "Standard Cleaning",
    description: "Regular upkeep for busy homes: dusting, floors, kitchens, bathrooms, and general refreshes.",
    icon: Home,
    service: "standard",
    servicePage: "/services/standard-cleaning-cape-town",
    source: "home_services_standard",
  },
  {
    title: "Deep Cleaning",
    description: "A detailed full clean for kitchens, bathrooms, build-up, high-touch areas, and hard-to-reach spots.",
    icon: Sparkles,
    service: "deep",
    servicePage: "/services/deep-cleaning-cape-town",
    source: "home_services_deep",
  },
  {
    title: "Airbnb Cleaning",
    description: "Fast turnovers for hosts who need bathrooms, kitchens, beds, floors, and guest-ready details handled.",
    icon: Building2,
    service: "airbnb",
    servicePage: "/services/airbnb-cleaning-cape-town",
    source: "home_services_airbnb",
  },
  {
    title: "Move-in / Move-out",
    description: "End-of-lease and handover cleaning for tenants, landlords, agents, and moving day resets.",
    icon: Truck,
    service: "move",
    servicePage: "/services/move-out-cleaning-cape-town",
    source: "home_services_move",
  },
  {
    title: "Carpet Cleaning",
    description: "Deep fabric cleaning support for rugs, carpets, bedrooms, lounges, and high-traffic areas.",
    icon: Layers,
    service: "carpet",
    servicePage: "/services/carpet-cleaning-cape-town",
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
          <p className="mt-3 text-gray-600">
            Choose the right clean quickly. Compare services, see a starting estimate, then get your exact price in the booking flow.
          </p>
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
                <h3 className="mt-4 text-lg font-semibold text-zinc-900">
                  <Link href={s.servicePage} className="transition hover:text-blue-700">
                    {s.title}
                  </Link>
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{s.description}</p>
                <p className="mt-4 text-sm font-semibold text-blue-600">
                  {s.from != null ? `From R ${s.from.toLocaleString("en-ZA")}` : "From —"}
                </p>
                <Link href={s.servicePage} className="mt-3 text-sm font-semibold text-blue-700 transition hover:text-blue-900">
                  Learn more about {s.title}
                </Link>
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
