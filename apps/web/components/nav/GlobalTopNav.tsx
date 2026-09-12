"use client";

import { usePathname } from "next/navigation";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { SiteHeader } from "@/components/nav/SiteHeader";
import { SiteTopBar } from "@/components/nav/SiteTopBar";
import {
  shouldHideGlobalTopNav,
  usesHomepageStyledGlobalTopNav,
} from "@/lib/marketing/globalTopNavVisibility";

const bookingHref = "/book";

export function GlobalTopNav() {
  const pathname = usePathname() ?? "";

  /** Booking / admin / dashboard / cleaner / auth / page-owned MarketingHomeHeader routes own their header. */
  if (shouldHideGlobalTopNav(pathname)) return null;

  /**
   * RD-PUBLIC-01: primary public route families keep root-level header ownership,
   * but now use the same visual/header authority as the redesigned homepage.
   */
  if (usesHomepageStyledGlobalTopNav(pathname)) {
    return <MarketingHomeHeader bookingHref={bookingHref} />;
  }

  return (
    <header className="sticky top-0 z-50">
      <SiteTopBar />
      <SiteHeader
        bookingHref={bookingHref}
        mobileNavId="mobile-nav"
        closeMenusOnPathChange
        desktopQuoteClassName="hidden xl:inline-flex"
        logoPriority
        tracking={{
          desktopQuote: "nav_desktop",
          desktopBook: "nav_book_now",
          mobileBook: "nav_mobile_book",
          mobileQuote: "nav_mobile_menu",
        }}
      />
    </header>
  );
}
