import Link from "next/link";
import { PROGRAMMATIC_LOCATIONS } from "@/lib/seo/locations";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

function formatList(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** Extra internal links for crawl depth on suburb hubs (server-rendered). */
export function MarketingHomePopularAreasSection() {
  const preview = PROGRAMMATIC_LOCATIONS.slice(0, 8);
  const previewNames = formatList(preview.map((l) => l.name));

  return (
    <section className="border-t border-slate-100 bg-slate-50 py-16 md:py-20" aria-labelledby="popular-areas-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h3 id="popular-areas-heading" className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
          Popular areas in Cape Town
        </h3>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
          Browse cleaning services near {previewNames}, and more—each suburb page links to Cape Town-wide service guides
          and booking.
        </p>
        <nav
          className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600"
          aria-label="Popular Cape Town suburbs"
        >
          {PROGRAMMATIC_LOCATIONS.map((loc) => (
            <Link key={loc.slug} href={`/locations/${loc.slug}`} className={cn(linkInNavClassName, "text-sm")}>
              Cleaning services in {loc.name}
            </Link>
          ))}
          <Link href="/services#hub-areas-heading" className={cn(linkInNavClassName, "text-sm font-semibold")}>
            All areas
          </Link>
        </nav>
      </div>
    </section>
  );
}
