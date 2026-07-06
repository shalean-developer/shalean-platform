import Link from "next/link";
import { Phone } from "lucide-react";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import {
  CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
  CUSTOMER_SUPPORT_TELEPHONE_TEL,
} from "@/lib/site/customerSupport";

export function QuotePageHeader() {
  const bookingHref = marketingHomeBookingHref();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="block min-w-0 shrink-0 transition-opacity hover:opacity-90" aria-label="Shalean home">
          <ShaleanNavLogo className="h-7 w-auto max-w-[140px] sm:h-8 sm:max-w-[160px]" priority />
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <a
            href={CUSTOMER_SUPPORT_TELEPHONE_TEL}
            className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 sm:inline-flex"
          >
            <Phone className="h-4 w-4 text-blue-600" aria-hidden />
            {CUSTOMER_SUPPORT_TELEPHONE_DISPLAY}
          </a>
          <GrowthCtaLink
            href={bookingHref}
            source="quote_page_header_book"
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Book online
          </GrowthCtaLink>
        </div>
      </div>
    </header>
  );
}
