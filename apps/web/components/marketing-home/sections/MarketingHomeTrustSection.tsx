import { ShieldCheck, CalendarDays, MapPin, ReceiptText } from "lucide-react";

const TRUST_CARDS = [
  {
    Icon: ShieldCheck,
    title: "Background-checked cleaners",
    subtitle: "Cleaners are vetted before they are available for customer bookings.",
  },
  {
    Icon: CalendarDays,
    title: "Serving Cape Town since 2022",
    subtitle: "Shalean has provided professional cleaning services since 2022.",
  },
  {
    Icon: MapPin,
    title: "Cape Town service coverage",
    subtitle: "Home, apartment, office and specialist cleaning across supported Cape Town areas.",
  },
  {
    Icon: ReceiptText,
    title: "Transparent booking totals",
    subtitle: "Customers can review the quoted cleaning total before confirming checkout.",
  },
] as const;

export function MarketingHomeTrustSection() {
  return (
    <section className="bg-[#1e4fd4] py-10 md:py-14" aria-labelledby="homepage-trust-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">Why customers trust Shalean</p>
          <h2
            id="homepage-trust-heading"
            className="mt-2 text-lg font-bold leading-snug tracking-tight text-white sm:text-2xl"
          >
            Clear service facts, not vague promises
          </h2>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {TRUST_CARDS.map(({ Icon, title, subtitle }) => (
            <div
              key={title}
              className="flex gap-4 rounded-2xl border border-white/10 bg-white p-5 shadow-sm"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                <Icon className="h-5 w-5 text-[#1e4fd4]" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-snug text-slate-800">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
