import Link from "next/link";
import { Building2, Briefcase, BrushCleaning, Home, Sparkles, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const services = [
  {
    href: "/services/deep-cleaning-cape-town",
    title: "Deep Cleaning",
    description:
      "Deep cleaning services in Cape Town for kitchens, bathrooms, and detailed home care—ideal when you want a full reset before guests or after a busy season.",
    icon: Sparkles,
  },
  {
    href: "/services/standard-cleaning-cape-town",
    title: "Standard Cleaning",
    description:
      "Standard home cleaning in Cape Town for weekly or once-off visits—living areas, kitchens, bathrooms, and floors on a clear checklist.",
    icon: Home,
  },
  {
    href: "/services/move-out-cleaning-cape-town",
    title: "Move-Out Cleaning",
    description:
      "Move-out cleaning services in Cape Town for rental handovers—scoped for inspections with time for kitchens, bathrooms, and floors.",
    icon: Truck,
  },
  {
    href: "/services/airbnb-cleaning-cape-town",
    title: "Airbnb Cleaning",
    description:
      "Airbnb cleaning in Cape Town built for fast turnovers—guest-ready bathrooms, kitchens, linen resets, and photo-friendly presentation.",
    icon: Building2,
  },
  {
    href: "/services/office-cleaning-cape-town",
    title: "Office Cleaning",
    description:
      "Office cleaning services in Cape Town for small workspaces—respectful access, predictable scope, and desks-ready presentation.",
    icon: Briefcase,
  },
  {
    href: "/services/carpet-cleaning-cape-town",
    title: "Carpet Cleaning",
    description:
      "Carpet cleaning in Cape Town for rugs and high-traffic areas—paired with your home visit when you want soft floors refreshed too.",
    icon: BrushCleaning,
  },
] as const;

export function ServicesGrid() {
  return (
    <section aria-labelledby="services-heading">
      <h2 id="services-heading" className="text-balance text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl dark:text-zinc-50">
        Popular services
      </h2>
      <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">Choose a service guide, then book in a few clicks.</p>
      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {services.map(({ href, title, description, icon: Icon }) => (
          <li
            key={href}
            className={cn(
              "flex flex-col rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/50",
            )}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{description}</p>
            <Button variant="outline" className="mt-5 w-full rounded-xl" asChild>
              <Link href={href}>View Cape Town service</Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
