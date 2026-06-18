import { ShieldCheck, Leaf, BadgeCheck, CalendarCheck } from "lucide-react";

const TRUST_CARDS = [
  {
    Icon: ShieldCheck,
    title: "Background checked",
    subtitle: "All our cleaners are thoroughly vetted for your peace of mind.",
  },
  {
    Icon: Leaf,
    title: "Eco-friendly products",
    subtitle: "We use safe, non-toxic products that are tough on dirt, gentle on your home.",
  },
  {
    Icon: BadgeCheck,
    title: "Satisfaction guarantee",
    subtitle: "If you're not 100% happy, we'll come back and make it right.",
  },
  {
    Icon: CalendarCheck,
    title: "Flexible & reliable",
    subtitle: "Book online in minutes and choose a time that works for you.",
  },
] as const;

export function MarketingHomeTrustSection() {
  return (
    <section className="bg-[#1e4fd4] py-12 md:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="mx-auto max-w-3xl text-center text-xl font-bold leading-snug tracking-tight text-white sm:text-2xl">
          Trusted by homeowners, tenants and Airbnb hosts across Cape Town
        </h2>

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
