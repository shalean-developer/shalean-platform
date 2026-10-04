import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import {
  CUSTOMER_SUPPORT_EMAIL,
  CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
  CUSTOMER_SUPPORT_TELEPHONE_TEL,
} from "@/lib/site/customerSupport";

/**
 * Fixed-height footer for campaign and promotion pages.
 * Mobile is 80px and desktop is 160px.
 */
export function PromotionFooter() {
  return (
    <footer className="h-20 border-t-4 border-[#0051ff] bg-[#00164e] text-white md:h-40">
      <div className="mx-auto flex h-full w-full max-w-[var(--ui-container-marketing)] items-center justify-between gap-3 px-[var(--ui-page-gutter)] md:grid md:grid-cols-[auto_1fr] md:grid-rows-[1fr_auto] md:gap-x-8 md:pb-4 md:pt-5">
        <Link href="/" aria-label="Shalean home" className="shrink-0 rounded-md bg-white px-2 py-1.5">
          <ShaleanNavLogo className="h-6 w-auto md:h-9" intrinsicHeight={96} />
        </Link>

        <nav aria-label="Promotion footer" className="flex items-center justify-end gap-3 text-xs text-white/85 md:gap-5 md:text-sm">
          <a href={CUSTOMER_SUPPORT_TELEPHONE_TEL} aria-label={`Call ${CUSTOMER_SUPPORT_TELEPHONE_DISPLAY}`} className="inline-flex min-h-10 items-center gap-2 transition hover:text-white">
            <Phone className="h-4 w-4 text-[#66a3ff]" aria-hidden />
            <span className="hidden sm:inline">{CUSTOMER_SUPPORT_TELEPHONE_DISPLAY}</span>
          </a>
          <a href={`mailto:${CUSTOMER_SUPPORT_EMAIL}`} className="hidden min-h-10 items-center gap-2 transition hover:text-white md:inline-flex">
            <Mail className="h-4 w-4 text-[#66a3ff]" aria-hidden />
            Support
          </a>
          <Link href="/terms-of-service" className="hidden min-h-10 items-center transition hover:text-white sm:inline-flex">
            Terms
          </Link>
          <Link href="/privacy-policy" className="inline-flex min-h-10 items-center transition hover:text-white">
            Privacy
          </Link>
        </nav>

        <p className="col-span-2 hidden border-t border-white/10 pt-3 text-xs text-white/65 md:block">
          © {new Date().getFullYear()} Shalean Cleaning Services · Cape Town, South Africa
        </p>
      </div>
    </footer>
  );
}
