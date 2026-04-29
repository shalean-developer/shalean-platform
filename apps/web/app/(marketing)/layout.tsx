import Link from "next/link";
import { HOMEPAGE_INTERNAL_SEO_LINKS } from "@/lib/seo/capeTownSeoPages";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <nav className="sr-only" aria-label="Cape Town service and suburb pages">
        <ul>
          {HOMEPAGE_INTERNAL_SEO_LINKS.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </>
  );
}
