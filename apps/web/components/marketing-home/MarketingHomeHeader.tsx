import { MarketingHomeHeaderBar } from "@/components/marketing-home/MarketingHomeHeaderBar";
import styles from "@/components/marketing-home/MarketingHomeHeader.module.css";

export function MarketingHomeHeader({ bookingHref }: { bookingHref: string }) {
  return (
    <header className={`${styles.root} sticky top-0 z-40`}>
      <MarketingHomeHeaderBar bookingHref={bookingHref} />
    </header>
  );
}
