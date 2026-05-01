import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const areas = [
  { label: "Claremont cleaning services", href: "/locations/claremont-cleaning-services" },
  { label: "Rondebosch cleaning services", href: "/locations/rondebosch-cleaning-services" },
  { label: "Sea Point cleaning services", href: "/locations/sea-point-cleaning-services" },
  { label: "Gardens cleaning services", href: "/locations/gardens-cleaning-services" },
  { label: "Woodstock cleaning services", href: "/locations/woodstock-cleaning-services" },
  { label: "Green Point cleaning services", href: "/locations/green-point-cleaning-services" },
  { label: "Kenilworth cleaning services", href: "/locations/kenilworth-cleaning-services" },
  { label: "Newlands cleaning services", href: "/locations/newlands-cleaning-services" },
  { label: "Constantia cleaning services", href: "/locations/constantia-cleaning-services" },
  { label: "CBD & City Bowl (Zonnebloem)", href: "/locations/zonnebloem-cleaning-services" },
] as const;

export function LocationsGrid() {
  return (
    <section aria-labelledby="locations-heading">
      <h2 id="locations-heading" className="text-balance text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl dark:text-zinc-50">
        Cape Town suburbs we cover
      </h2>
      <p className="mt-3 max-w-3xl text-pretty text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
        We provide cleaning services across Cape Town suburbs, including:
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map(({ label, href }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                "group flex items-center justify-between rounded-xl border border-zinc-200/90 bg-white px-4 py-4 text-left text-sm font-medium text-zinc-900 shadow-sm transition",
                "hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50 dark:hover:border-blue-900 dark:hover:bg-blue-950/30",
              )}
            >
              <span className="pr-2">{label}</span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:text-blue-600 dark:group-hover:text-blue-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
