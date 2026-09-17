import Link from "next/link";
import { Phone } from "lucide-react";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import {
  CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
  CUSTOMER_SUPPORT_TELEPHONE_TEL,
} from "@/lib/site/customerSupport";

export function PromotionHeader({ signInHref }: { signInHref: string }) {
  return (
    <header className="border-b border-[#dce7ff] bg-white text-[#00164e]">
      <div className="mx-auto flex h-16 w-full max-w-[var(--ui-container-marketing)] items-center justify-between gap-4 px-[var(--ui-page-gutter)] md:h-20">
        <Link href="/" aria-label="Shalean home" className="shrink-0">
          <ShaleanNavLogo className="h-10 w-auto md:h-12" intrinsicHeight={96} />
        </Link>

        <div className="flex items-center gap-4">
          <a
            href={CUSTOMER_SUPPORT_TELEPHONE_TEL}
            className="hidden min-h-11 items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-[#0033a1] sm:inline-flex"
          >
            <Phone className="h-4 w-4 text-[#0051ff]" aria-hidden />
            {CUSTOMER_SUPPORT_TELEPHONE_DISPLAY}
          </a>
          <Link
            href={signInHref}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#0051ff] px-4 text-sm font-semibold text-[#0051ff] transition hover:bg-[#eef4ff]"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
