import Image from "next/image";
import { SITE_ORIGIN as SITE } from "@/lib/site/canonical";

/** Editorial byline — organization as author (matches BlogPosting JSON-LD). */
export function BlogAuthorCard() {
  const logoSrc = "/images/marketing/cape-town-house-cleaning-kitchen.webp";
  return (
    <div className="not-prose flex gap-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-4 sm:px-5">
      <div className="relative size-14 shrink-0 overflow-hidden rounded-full bg-white ring-2 ring-white shadow-sm">
        <Image
          src={logoSrc}
          alt="Shalean Cleaning Services"
          fill
          className="object-cover"
          sizes="56px"
        />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Written by</p>
        <p className="mt-1 text-base font-semibold text-zinc-900">Shalean Cleaning Services</p>
        <p className="mt-1 text-sm leading-relaxed text-zinc-600">
          Cape Town home cleaning — vetted cleaners, instant quotes, and clear scope before you book.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          <a href={SITE} className="font-medium text-blue-600 underline-offset-4 hover:underline">
            shalean.co.za
          </a>
        </p>
      </div>
    </div>
  );
}
