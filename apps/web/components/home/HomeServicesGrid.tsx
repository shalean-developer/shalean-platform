import Link from "next/link";
import { Brush, Layers, Sparkles, Wind } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const services = [
  {
    title: "Regular Cleaning",
    desc: "Weekly or bi-weekly upkeep to keep your home consistently fresh.",
    icon: Sparkles,
    href: "/booking?step=entry",
  },
  {
    title: "Deep Cleaning",
    desc: "Detailed top-to-bottom clean — perfect for spring refreshes.",
    icon: Layers,
    href: "/booking?step=entry",
  },
  {
    title: "Move Out Cleaning",
    desc: "Handover-ready shine for tenants, landlords, and movers.",
    icon: Brush,
    href: "/booking?step=entry",
  },
  {
    title: "Carpet Cleaning",
    desc: "Refresh high-traffic areas and revive tired fibres.",
    icon: Wind,
    href: "/booking?step=entry",
  },
] as const;

export function HomeServicesGrid() {
  return (
    <section className="bg-zinc-50 px-4 py-14 sm:py-16 dark:bg-zinc-900/50">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">Our services</h2>
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">
            Choose what your home needs — every visit is tailored to your space.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map(({ title, desc, icon: Icon, href }) => (
            <Link key={title} href={href} className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 rounded-xl">
              <Card
                className={cn(
                  "h-full transition-all duration-200",
                  "group-hover:-translate-y-0.5 group-hover:border-emerald-200 group-hover:shadow-md",
                  "dark:group-hover:border-emerald-900/60",
                )}
              >
                <CardHeader>
                  <div className="mb-2 flex size-11 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white dark:bg-emerald-950 dark:text-emerald-300 dark:group-hover:bg-emerald-600 dark:group-hover:text-white">
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <CardTitle className="text-base group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                    {title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{desc}</p>
                  <span className="mt-4 inline-flex text-sm font-semibold text-emerald-700 group-hover:underline dark:text-emerald-400">
                    View pricing →
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
