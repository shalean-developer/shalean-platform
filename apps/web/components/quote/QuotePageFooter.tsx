import Link from "next/link";

const TRUST_ITEMS = ["Vetted cleaners", "Secure payment", "Satisfaction guarantee"] as const;

const FOOTER_LINKS = [
  { label: "Contact", href: "/contact" },
  { label: "Terms", href: "/terms-of-service" },
  { label: "Privacy", href: "/privacy-policy" },
] as const;

export function QuotePageFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="h-[80px] shrink-0 border-t border-slate-200 bg-white">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <ul className="hidden items-center gap-x-5 text-xs font-medium text-slate-600 sm:flex sm:text-sm">
          {TRUST_ITEMS.map((item) => (
            <li key={item} className="flex items-center gap-1.5 whitespace-nowrap">
              <span aria-hidden className="text-blue-600">
                ✔
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <p className="shrink-0 text-xs text-slate-500 sm:text-sm">© {year} Shalean Cleaning Services</p>

        <nav aria-label="Legal and support" className="shrink-0">
          <ul className="flex items-center gap-x-4 text-xs sm:text-sm">
            {FOOTER_LINKS.map(({ label, href }) => (
              <li key={href}>
                <Link href={href} className="font-medium text-slate-600 transition hover:text-blue-600">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
