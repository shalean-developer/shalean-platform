import { BadgeCheck, CalendarRange, Shield, Sparkles } from "lucide-react";

const reasons = [
  {
    icon: Shield,
    title: "Reliable cleaners",
    body: "Vetted teams with clear standards and accountable visit notes.",
  },
  {
    icon: CalendarRange,
    title: "Flexible booking",
    body: "Pick dates that fit your week—same-week slots when routes allow.",
  },
  {
    icon: BadgeCheck,
    title: "Transparent pricing",
    body: "See scope-aligned pricing before you pay; no surprise add-ons for agreed work.",
  },
  {
    icon: Sparkles,
    title: "High quality service",
    body: "Checklist-driven cleans focused on kitchens, bathrooms, floors, and dusting.",
  },
] as const;

export function WhyChooseUs() {
  return (
    <section aria-labelledby="why-heading">
      <h2 id="why-heading" className="text-balance text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl dark:text-zinc-50">
        Why homeowners choose Shalean
      </h2>
      <ul className="mt-8 grid gap-5 sm:grid-cols-2">
        {reasons.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className="flex gap-4 rounded-2xl border border-zinc-200/90 bg-zinc-50/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm dark:bg-zinc-800 dark:text-blue-300">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
