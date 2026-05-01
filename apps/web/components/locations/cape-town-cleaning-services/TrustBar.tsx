import { BadgeCheck, MapPin, Star, CalendarClock } from "lucide-react";

const items = [
  { icon: Star, label: "5-star service" },
  { icon: BadgeCheck, label: "Background-checked cleaners" },
  { icon: CalendarClock, label: "Flexible scheduling" },
  { icon: MapPin, label: "Serving all Cape Town suburbs" },
] as const;

export function TrustBar() {
  return (
    <section aria-label="Trust highlights" className="rounded-2xl border border-zinc-200/80 bg-white/90 px-4 py-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <ul className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-6">
        {items.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-2.5 text-sm font-medium text-zinc-800 dark:text-zinc-100">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}
