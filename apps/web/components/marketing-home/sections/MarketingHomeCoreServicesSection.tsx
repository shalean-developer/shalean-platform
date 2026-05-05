import Link from "next/link";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

const SAME_DAY_GUIDE_HREF = "/blog/same-day-cleaning-cape-town";

/**
 * Crawlable intent-specific links from the homepage — reduces cannibalization vs duplicating “cleaning services Cape Town” on every URL.
 */
export function MarketingHomeCoreServicesSection() {
  const p = CAPE_TOWN_SERVICE_SEO;
  const linkCls = cn(linkInNavClassName, "text-[15px] font-semibold text-slate-800 underline-offset-4 hover:underline");

  const items: { href: string; label: string; hint: string }[] = [
    {
      href: p["standard-cleaning-cape-town"].path,
      label: "House cleaning Cape Town",
      hint: "Weekly or once-off maintenance cleans",
    },
    {
      href: p["deep-cleaning-cape-town"].path,
      label: "Deep cleaning Cape Town",
      hint: "Reset kitchens, bathrooms & detail zones",
    },
    {
      href: p["move-out-cleaning-cape-town"].path,
      label: "Move-out cleaning Cape Town",
      hint: "Handover-ready end-of-tenancy scope",
    },
    {
      href: SAME_DAY_GUIDE_HREF,
      label: "Same-day cleaning Cape Town",
      hint: "How urgent slots work when routing allows",
    },
  ];

  return (
    <section className="border-b border-slate-100 bg-slate-50/40 py-10 md:py-12" aria-labelledby="home-core-services-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 id="home-core-services-heading" className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          Our cleaning services
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Choose the job you actually need—each page spells out scope and booking—then browse suburb hubs when you want
          local context.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <li key={item.href} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <Link href={item.href} className={linkCls}>
                {item.label}
              </Link>
              <p className="mt-2 text-xs leading-snug text-slate-500">{item.hint}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
