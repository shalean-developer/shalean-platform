import type { ReactNode } from "react";
import Link from "next/link";
import { FooterSection } from "@/components/home/sections/FooterSection";
import { getHomepageInternalSeoLinks } from "@/lib/seo/capeTownSeoPages";

type Props = Readonly<{
  children: ReactNode;
}>;

/**
 * Shared shell for marketing-style pages: crawler-friendly internal links + site footer.
 * Global header lives in root `layout.tsx` (`GlobalTopNav`).
 */
export default function MarketingLayout({ children }: Props) {
  return (
    <>
      <nav className="sr-only" aria-label="Cape Town service and suburb pages">
        <ul>
          {getHomepageInternalSeoLinks().map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
      <FooterSection />
    </>
  );
}
