"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/nav/SiteHeader";
import { SiteTopBar } from "@/components/nav/SiteTopBar";
import { shouldHideGlobalTopNav } from "@/lib/marketing/globalTopNavVisibility";

const bookingHref = "/book";

export function GlobalTopNav() {
  const pathname = usePathname() ?? "";

  /** Booking / admin / dashboard / cleaner / auth / MarketingHomeHeader pages each own their header. */
  if (shouldHideGlobalTopNav(pathname)) return null;

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
