import { MarketingPromotions } from "@/components/promotions/MarketingPromotions";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <div className="pb-[var(--promo-announcement-offset,0px)]">{children}</div>
      <MarketingPromotions />
    </>
  );
}
