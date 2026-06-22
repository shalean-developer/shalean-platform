import type { Metadata } from "next";
import Link from "next/link";
import { FooterSection } from "@/components/home/sections/FooterSection";
import { SEO_NOINDEX_FOLLOW } from "@/lib/site/seoRobots";

export const metadata: Metadata = {
  title: "Page Not Found | Shalean Cleaning Services",
  description: "The page you requested could not be found.",
  robots: SEO_NOINDEX_FOLLOW,
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-slate-900">
      <main className="mx-auto flex flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">404</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Page not found
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600">
          The link may be outdated or the page may have moved. Try one of these popular pages instead.
        </p>
        <nav
          aria-label="Helpful links"
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          {[
            ["Home", "/"],
            ["Services", "/services"],
            ["Locations", "/locations"],
            ["Pricing", "/cleaning-prices-cape-town"],
            ["FAQ", "/faq"],
            ["Contact", "/contact"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50"
            >
              {label}
            </Link>
          ))}
        </nav>
      </main>

      <FooterSection />
    </div>
  );
}
