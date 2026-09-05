import Link from "next/link";
import { Phone } from "lucide-react";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { PublicPageContainer } from "@/components/nav/PublicPageContainer";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import {
  CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
  CUSTOMER_SUPPORT_TELEPHONE_TEL,
} from "@/lib/site/customerSupport";

export function QuotePageHeader() {
  const bookingHref = marketingHomeBookingHref();

  return (
    <header className="sticky top-0 z-[var(--ui-z-sticky)] w-full border-b border-border bg-background/95 backdrop-blur">
      <PublicPageContainer className="flex items-center justify-between gap-[var(--ui-space-4)] py-[var(--ui-space-3)]">
        <Link href="/" className="block min-w-0 shrink-0 transition-opacity hover:opacity-90" aria-label="Shalean home">
          <ShaleanNavLogo className="h-7 w-auto max-w-[140px] sm:h-8 sm:max-w-[160px]" priority />
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-[var(--ui-space-2)] sm:gap-[var(--ui-space-3)]">
          <a
            href={CUSTOMER_SUPPORT_TELEPHONE_TEL}
            className="hidden items-center gap-1.5 rounded-[var(--ui-radius-lg)] px-[var(--ui-space-2)] py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground sm:inline-flex"
          >
            <Phone className="h-4 w-4 text-primary" aria-hidden />
            {CUSTOMER_SUPPORT_TELEPHONE_DISPLAY}
          </a>
          <GrowthCtaLink
            href={bookingHref}
            source="quote_page_header_book"
            className="inline-flex min-h-10 items-center justify-center rounded-[var(--ui-radius-xl)] bg-primary px-[var(--ui-space-4)] text-sm font-semibold text-primary-foreground shadow-[var(--ui-shadow-sm)] transition hover:opacity-90"
          >
            Book online
          </GrowthCtaLink>
        </div>
      </PublicPageContainer>
    </header>
  );
}
