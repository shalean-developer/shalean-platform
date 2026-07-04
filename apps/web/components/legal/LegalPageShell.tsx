import type { ReactNode } from "react";
import { FooterSection } from "@/components/home/sections/FooterSection";
import { MarketingHomeHeader } from "@/components/marketing-home/MarketingHomeHeader";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { marketingWhatsAppFloatMainPadding } from "@/lib/marketing/marketingMobileLayout";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
};

/** Shared marketing chrome for indexable legal/support pages. */
export function LegalPageShell({ children }: Props) {
  const bookingHref = marketingHomeBookingHref();

  return (
    <div className="bg-white text-slate-900">
      <MarketingHomeHeader bookingHref={bookingHref} />
      <main className={cn("mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16", marketingWhatsAppFloatMainPadding)}>{children}</main>
      <FooterSection />
    </div>
  );
}
