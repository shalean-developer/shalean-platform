import type { ReactNode } from "react";
import { SiteFooter } from "@/components/nav/SiteFooter";

type Props = Readonly<{
  children: ReactNode;
}>;

/**
 * Shared shell for marketing-style pages: visible footer internal links.
 * Global header lives in root `layout.tsx` (`GlobalTopNav`).
 */
export default function MarketingLayout({ children }: Props) {
  return (
    <>
      {children}
      <SiteFooter />
    </>
  );
}
