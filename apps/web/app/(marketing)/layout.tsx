import { PromotionAnnouncementBar } from "@/components/promotions/PromotionAnnouncementBar";
import { PromotionPopup } from "@/components/promotions/PromotionPopup";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <PromotionAnnouncementBar />
      <PromotionPopup />
      {children}
    </>
  );
}
