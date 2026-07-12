import { PromotionAnnouncementBar } from "@/components/promotions/PromotionAnnouncementBar";
import { PromotionPopup } from "@/components/promotions/PromotionPopup";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <div className="pb-[var(--promo-announcement-offset,0px)]">{children}</div>
      <PromotionAnnouncementBar />
      <PromotionPopup />
    </>
  );
}
