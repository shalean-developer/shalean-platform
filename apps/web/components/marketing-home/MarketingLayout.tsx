import type { ReactNode } from "react";
import { FooterSection } from "@/components/home/sections/FooterSection";

type Props = Readonly<{
  children: ReactNode;
}>;

/**
 * Shared shell for marketing-style pages: visible footer internal links (see `FooterSection`).
 * Global header lives in root `layout.tsx` (`GlobalTopNav`).
 */
export default function MarketingLayout({ children }: Props) {
  return (
    <>
      {children}
      <FooterSection />
    </>
  );
}
