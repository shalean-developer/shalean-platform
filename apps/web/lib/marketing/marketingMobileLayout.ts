/**
 * Shared mobile layout tokens for Shalean marketing pages.
 * Keeps sticky CTAs, safe-area insets, and touch targets consistent site-wide.
 */

/** Clears fixed bottom sticky CTA bar (Book / Quote) on phones. */
export const marketingStickyCtaMainPadding =
  "pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0";

/** Clears WhatsApp float when no sticky bar is present. */
export const marketingWhatsAppFloatMainPadding = "pb-20 md:pb-0";

/** Combined: sticky bar + trust badge + WhatsApp float (homepage). */
export const marketingHomeMainPadding =
  "pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-0";

/** Logo link — left-aligned; action buttons use ml-auto on mobile. */
export const marketingHeaderLogoLinkClass =
  "block min-w-0 shrink-0 lg:shrink-0";

/** Logo image sizing inside the mobile header bar. */
export const marketingHeaderLogoImageClass =
  "h-7 max-h-7 w-full max-w-[128px] object-contain object-left sm:h-8 sm:max-h-8 sm:max-w-[148px] md:h-10 md:max-h-10 md:max-w-[168px]";

/** Mobile header action cluster — calendar + menu, pinned to the trailing edge. */
export const marketingMobileHeaderActionsClass =
  "ml-auto flex shrink-0 items-center gap-0.5 lg:hidden";

/** Compact icon-only Book CTA for mobile header bar (lg:hidden in header). */
export const marketingMobileHeaderBookIconClass =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-transparent text-blue-600 transition hover:bg-blue-50";

/** 44px hamburger / menu toggle (lg:hidden in header). */
export const marketingMobileMenuButtonClass =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-slate-700 transition hover:bg-slate-100";

/** Drawer nav link — comfortable tap height. */
export const marketingMobileDrawerLinkClass =
  "block rounded-lg px-3 py-3.5 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700";

/** Nested drawer link — tighter spacing for sub-menus. */
export const marketingMobileDrawerSubLinkClass =
  "block rounded-lg py-2 text-sm text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700";

/** Clears fixed WhatsApp + trust badge when the mobile nav drawer is open. */
export const marketingMobileDrawerOpenPadding =
  "pb-[calc(6.5rem+env(safe-area-inset-bottom))]";
