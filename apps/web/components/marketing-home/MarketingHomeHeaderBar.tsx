import { SiteHeader } from "@/components/nav/SiteHeader";

type Props = {
  bookingHref: string;
};

export function MarketingHomeHeaderBar({ bookingHref }: Props) {
  return (
    <SiteHeader
      bookingHref={bookingHref}
      mobileNavId="marketing-home-mobile-nav"
      tracking={{
        desktopQuote: "marketing_header",
        desktopBook: "marketing_header_book",
        mobileBook: "marketing_header_mobile_book",
        mobileQuote: "marketing_mobile_menu",
      }}
    />
  );
}
