/** Public quote request form — creates Office sales document for admin review. */
export const GET_FREE_QUOTE_HREF = "/quote";

export const getFreeQuoteButtonClass = {
  primary:
    "inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700",
  outline:
    "inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-blue-600 px-6 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50",
  outlineSubtle:
    "inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50",
  nav: "inline-flex items-center rounded-xl border border-blue-600 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50",
  navCompact:
    "inline-flex items-center rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50",
  onDark:
    "inline-flex min-h-12 items-center justify-center rounded-xl border border-white/90 bg-transparent px-8 text-base font-semibold text-white transition hover:bg-white/10",
} as const;
