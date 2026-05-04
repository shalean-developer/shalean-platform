import { BadgeCheck, ShieldCheck, Sparkles, Users } from "lucide-react";

/** Trust strip directly under hero — credibility points only (no aggregate rating; hero + Google band carry scores). */
export function MarketingHomeTrustSection() {
  return (
    <section id="pricing" className="bg-[#1e4fd4] py-10 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="mx-auto max-w-4xl text-center text-lg font-semibold leading-snug tracking-tight text-white sm:text-xl md:text-2xl">
          Trusted by homeowners, tenants, and Airbnb hosts across Cape Town
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {(
            [
              {
                Icon: BadgeCheck,
                title: "Book with confidence",
                subtitle: "Itemised scope and upfront totals before we dispatch a team",
              },
              {
                Icon: Users,
                title: "Serving homes across Cape Town suburbs",
                subtitle: "Routing from the Atlantic Seaboard to the Southern Suburbs and Northern corridors",
              },
              {
                Icon: ShieldCheck,
                title: "Background-checked cleaners",
                subtitle: "Verified profiles with ID and reference checks on every visit",
              },
              {
                Icon: Sparkles,
                title: "Human support if something’s off",
                subtitle: "Reach real people when a visit does not match the checklist you confirmed",
              },
            ] as const
          ).map(({ Icon, title, subtitle }, i) => (
            <div
              key={`trust-${i}-${subtitle}`}
              className="flex gap-4 rounded-xl border border-slate-100 bg-white p-5 text-left shadow-sm sm:p-6"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white shadow-sm">
                <Icon className="h-5 w-5 fill-none text-[#1e4fd4]" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold leading-snug text-slate-800">{title}</p>
                <p className="mt-1 text-sm leading-snug text-slate-500">{subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
