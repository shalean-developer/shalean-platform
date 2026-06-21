import Link from "next/link";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { CLEANER_APPLY_FORM_PATH } from "@/lib/cleaner/applyPageContent";

type CleanerApplyHeaderProps = {
  /** Show primary apply CTA in the header (landing page). */
  showApplyCta?: boolean;
  /** Show link back to the info page (form page). */
  showBackToInfo?: boolean;
};

export function CleanerApplyHeader({ showApplyCta = false, showBackToInfo = false }: CleanerApplyHeaderProps) {
  return (
    <header className="border-b border-blue-100/80 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="mr-auto shrink-0" aria-label="Shalean home">
          <ShaleanNavLogo className="h-8 w-auto max-w-[140px] sm:h-9" />
        </Link>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          {showBackToInfo ? (
            <Link
              href="/cleaner/apply"
              className="text-sm font-semibold text-slate-600 transition hover:text-blue-600 hover:underline"
            >
              About applying
            </Link>
          ) : null}
          {showApplyCta ? (
            <Link
              href={CLEANER_APPLY_FORM_PATH}
              className="hidden rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:inline-flex"
            >
              Apply now
            </Link>
          ) : null}
          <Link
            href="/cleaner/login"
            className="text-sm font-semibold text-slate-600 transition hover:text-blue-600 hover:underline"
          >
            Cleaner login
          </Link>
        </div>
      </div>
    </header>
  );
}
