import Link from "next/link";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import type { BlogServiceLinkKind } from "@/lib/blog/getBlogServiceType";

type Props = { service?: BlogServiceLinkKind };

export function BlogServiceLinks({ service = "standard" }: Props) {
  const deepHref = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
  const standardHref = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;
  const airbnbHref = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;
  const moveOutHref = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;
  const carpetHref = CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"].path;

  const items: { href: string; label: string }[] = [
    { href: deepHref, label: "deep cleaning services in Cape Town" },
    { href: standardHref, label: "standard home cleaning services in Cape Town" },
  ];

  if (service === "airbnb") {
    items.push({ href: airbnbHref, label: "Airbnb cleaning services in Cape Town" });
  } else if (service === "move-out") {
    items.push({ href: moveOutHref, label: "move-out cleaning services in Cape Town" });
  } else if (service === "carpet") {
    items.push({ href: carpetHref, label: "carpet cleaning services in Cape Town" });
  }

  return (
    <section
      className="not-prose mt-12 rounded-2xl border border-zinc-200 bg-zinc-50/80 px-6 py-8"
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
