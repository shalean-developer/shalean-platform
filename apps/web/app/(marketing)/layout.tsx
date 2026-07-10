import { PromotionAnnouncementBar } from "@/components/promotions/PromotionAnnouncementBar";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <PromotionAnnouncementBar />
      {children}
    </>
  );
}
