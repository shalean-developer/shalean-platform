import Link from "next/link";
import { CalendarDays, ArrowRight, Phone } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { HeaderLoginButton } from "@/components/nav/HeaderLoginButton";
import { SiteTopBar } from "@/components/nav/SiteTopBar";
import { MarketingHomeMobileNav } from "@/components/marketing-home/MarketingHomeMobileNav";
import { MarketingHomeServicesDropdown } from "@/components/marketing-home/MarketingHomeServicesDropdown";
import {
  MARKETING_HEADER_NAV_LINKS,
  marketingHeaderNavLinkClass,
} from "@/lib/marketing/marketingHomeHeaderNav";

export function MarketingHomeHeader({ bookingHref }: { bookingHref: string }) {
  return (
    <header className="sticky top-0 z-40">
      <SiteTopBar />

      <div className="bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="flex shrink-0 items-center" aria-label="Shalean home">
            <ShaleanNavLogo className="h-8 w-auto max-w-[140px] sm:h-10 sm:max-w-[168px]" priority={false} />
          </Link>

          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
            <MarketingHomeServicesDropdown />
            {MARKETING_HEADER_NAV_LINKS.filter((link) => !link.dropdown).map(({ label, href }) => (
              <Link key={label} href={href} className={marketingHeaderNavLinkClass}>
                {label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <HeaderLoginButton />

            <a
              href="tel:0871535250"
              className="flex items-center gap-2 rounded-full border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600">
                <Phone className="h-3.5 w-3.5 text-white" />
              </span>
              087 153 5250
            </a>

            <GrowthCtaLink
              href={bookingHref}
              source="marketing_header_book"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <CalendarDays className="h-4 w-4" />
              Book Now
              <ArrowRight className="h-4 w-4" />
            </GrowthCtaLink>
          </div>

          <MarketingHomeMobileNav bookingHref={bookingHref} />
        </div>
      </div>
    </header>
  );
}
