import { MarketingHomeHeaderBar } from "@/components/marketing-home/MarketingHomeHeaderBar";

export function MarketingHomeHeader({ bookingHref }: { bookingHref: string }) {
  return (
    <header className="sticky top-0 z-40">
      <MarketingHomeHeaderBar bookingHref={bookingHref} />
    </header>
  );
}
