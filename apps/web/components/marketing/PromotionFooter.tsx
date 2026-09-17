import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import {
  CUSTOMER_SUPPORT_EMAIL,
  CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
  CUSTOMER_SUPPORT_TELEPHONE_TEL,
} from "@/lib/site/customerSupport";

/**
 * Compact footer for campaign and promotion landing pages.
 * It keeps the conversion journey focused while preserving essential support,
 * legal and brand destinations.
 */
export function PromotionFooter() {
  return (
    <footer className="border-t-4 border-[#0051ff] bg-[#00164e] text-white">
      <div className="mx-auto flex min-h-20 w-full max-w-[var(--ui-container-marketing)] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-[var(--ui-page-gutter)] py-3 md:min-h-40 md:py-6">
        <Link href="/" aria-label="Shalean home" className="shrink-0 rounded-md bg-white px-2 py-1.5">
          <ShaleanNavLogo className="h-7 w-auto md:h-9" intrinsicHeight={96} />
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-xs text-white/80 md:text-sm">
          <a href={CUSTOMER_SUPPORT_TELEPHONE_TEL} className="inline-flex min-h-10 items-center gap-2 transition hover:text-white">
            <Phone className="h-4 w-4 text-[#66a3ff]" aria-hidden />
            {CUSTOMER_SUPPORT_TELEPHONE_DISPLAY}
          </a>
          <a href={`mailto:${CUSTOMER_SUPPORT_EMAIL}`} className="hidden min-h-10 items-center gap-2 transition hover:text-white sm:inline-flex">
            <Mail className="h-4 w-4 text-[#66a3ff]" aria-hidden />
            Support
          </a>
          <Link href="/terms-of-service" className="inline-flex min-h-10 items-center transition hover:text-white">
            Terms
          </Link>
          <Link href="/privacy-policy" className="inline-flex min-h-10 items-center transition hover:text-white">
            Privacy
          </Link>
        </div>

        <p className="w-full text-[10px] text-white/45 md:text-xs">
          © {new Date().getFullYear()} Shalean Cleaning Services. Cape Town, South Africa.
        </p>
      </div>
    </footer>
  );
}
