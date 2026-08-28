import Link from "next/link";
import { PublicPageContainer } from "@/components/nav/PublicPageContainer";

const TRUST_ITEMS = ["Vetted cleaners", "Secure payment", "Satisfaction guarantee"] as const;

const FOOTER_LINKS = [
  { label: "Contact", href: "/contact" },
  { label: "Terms", href: "/terms-of-service" },
  { label: "Privacy", href: "/privacy-policy" },
] as const;

export function QuotePageFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="h-[80px] shrink-0 border-t border-border bg-background">
      <PublicPageContainer className="flex h-full items-center justify-between gap-[var(--ui-space-4)]">
        <ul className="hidden items-center gap-x-[var(--ui-space-5)] text-xs font-medium text-muted-foreground sm:flex sm:text-sm">
          {TRUST_ITEMS.map((item) => (
            <li key={item} className="flex items-center gap-1.5 whitespace-nowrap">
              <span aria-hidden className="text-primary">
                ✔
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <p className="shrink-0 text-xs text-muted-foreground sm:text-sm">© {year} Shalean Cleaning Services</p>

        <nav aria-label="Legal and support" className="shrink-0">
          <ul className="flex items-center gap-x-[var(--ui-space-4)] text-xs sm:text-sm">
            {FOOTER_LINKS.map(({ label, href }) => (
              <li key={href}>
                <Link href={href} className="font-medium text-muted-foreground transition hover:text-primary">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PublicPageContainer>
    </footer>
  );
}
