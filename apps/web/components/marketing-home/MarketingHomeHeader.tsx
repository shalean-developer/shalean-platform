import { MarketingHomeHeaderBar } from "@/components/marketing-home/MarketingHomeHeaderBar";
import styles from "@/components/marketing-home/MarketingHomeHeader.module.css";
import { MapPin, ShieldCheck } from "lucide-react";

export function MarketingHomeHeader({ bookingHref }: { bookingHref: string }) {
  return (
    <header className={`${styles.root} sticky top-0 z-40`}>
      <div className={styles.utilityBar}>
        <div className={styles.utilityInner}>
          <span><MapPin aria-hidden /> Professional cleaning across Cape Town</span>
          <span><ShieldCheck aria-hidden /> Vetted cleaners · Secure online booking</span>
        </div>
      </div>
      <MarketingHomeHeaderBar bookingHref={bookingHref} />
    </header>
  );
}
