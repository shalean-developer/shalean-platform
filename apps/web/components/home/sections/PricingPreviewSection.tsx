import { HomeBookingLink } from "@/components/home/HomeBookingLink";
import { calculateHomeWidgetQuoteZar } from "@/lib/pricing/calculatePrice";
import { cn } from "@/lib/utils";

const samples = [
  { label: "2 bed apartment", service: "standard" as const, bedrooms: 2, bathrooms: 1, extras: [] as string[] },
  { label: "3 bed family home", service: "deep" as const, bedrooms: 3, bathrooms: 2, extras: ["inside-oven"] },
  { label: "Airbnb studio", service: "airbnb" as const, bedrooms: 1, bathrooms: 1, extras: [] as string[] },
];

export function PricingPreviewSection() {
  return (
    <section id="pricing" className="scroll-mt-28 border-b border-blue-100 bg-blue-50/50 py-16" aria-labelledby="pricing-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="pricing-heading" className="text-3xl font-bold tracking-tight text-zinc-900">
            Sample pricing
          </h2>
          <p className="mt-3 text-gray-600">Illustrative totals for typical homes — your quote updates live with every room and extra you add.</p>
        </div>

        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {samples.map((row) => {
            const total = calculateHomeWidgetQuoteZar({
              service: row.service,
              bedrooms: row.bedrooms,
              bathrooms: row.bathrooms,
              extraRooms: 0,
              extras: row.extras,
            });
            return (
              <li key={row.label} className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm transition hover:border-blue-200 hover:shadow-md">
                <p className="text-sm font-medium text-blue-600">{row.label}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-gray-500">{row.service} clean</p>
                <p className="mt-4 text-3xl font-bold text-blue-600">R{total}</p>
                <p className="mt-2 text-sm text-gray-600">Includes base service plus room rates shown in checkout.</p>
              </li>
            );
          })}
        </ul>

        <div className="mx-auto mt-10 max-w-xl text-center">
          <HomeBookingLink
            source="home_pricing_preview"
            className={cn(
              "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 sm:w-auto",
            )}
          >
            Get exact price
          </HomeBookingLink>
        </div>
      </div>
    </section>
  );
}
