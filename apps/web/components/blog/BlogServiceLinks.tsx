import Link from "next/link";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import type { BlogServiceLinkKind } from "@/lib/blog/getBlogServiceType";

type Props = { service?: BlogServiceLinkKind; /** Tighter top margin when stacked under contextual copy */ dense?: boolean };

export function BlogServiceLinks({ service = "standard", dense = false }: Props) {
  const deepHref = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
  const standardHref = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;
  const airbnbHref = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;
  const moveOutHref = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;
  const carpetHref = CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"].path;
  const officeHref = CAPE_TOWN_SERVICE_SEO["office-cleaning-cape-town"].path;
  const windowHref = CAPE_TOWN_SERVICE_SEO["window-cleaning-cape-town"].path;
  const overviewHref = "/locations/cape-town-cleaning-services";

  const items: { href: string; label: string }[] = [
    { href: deepHref, label: "deep cleaning service in Cape Town" },
    { href: standardHref, label: "home cleaning services in Cape Town" },
    { href: overviewHref, label: "cleaners near you across Cape Town suburbs" },
    { href: officeHref, label: "office cleaning services in Cape Town" },
  ];

  if (service === "airbnb") {
    items.push({ href: airbnbHref, label: "Airbnb turnover cleaning in Cape Town" });
  } else if (service === "move-out") {
    items.push({ href: moveOutHref, label: "move-out cleaning service in Cape Town" });
  } else if (service === "carpet") {
    items.push({ href: carpetHref, label: "carpet cleaning services in Cape Town" });
  } else {
    items.push({ href: windowHref, label: "window cleaning services in Cape Town" });
  }

  return (
    <section
      className={`not-prose rounded-2xl border border-zinc-200 bg-zinc-50/80 px-6 py-8 ${dense ? "mt-0" : "mt-12"}`}
      aria-labelledby="blog-service-links-heading"
    >
      <h2 id="blog-service-links-heading" className="text-lg font-bold tracking-tight text-zinc-900">
        Related Cleaning Services in Cape Town
      </h2>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-zinc-800">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={linkInNavClassName}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
