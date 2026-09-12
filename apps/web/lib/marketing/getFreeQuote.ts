/** Public quote request form — creates Office sales document for admin review. */
export const GET_FREE_QUOTE_HREF = "/quote";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export const getFreeQuoteButtonClass = {
  primary:
    `inline-flex min-h-12 items-center justify-center rounded-[var(--ui-radius-pill)] bg-primary px-[var(--ui-space-6)] py-[var(--ui-space-3)] text-[length:var(--ui-text-small)] font-medium text-primary-foreground shadow-[var(--ui-shadow-md)] transition hover:brightness-95 sm:text-[length:var(--ui-text-body)] ${focusRing}`,
  outline:
    `inline-flex min-h-12 items-center justify-center rounded-[var(--ui-radius-pill)] border border-border bg-card px-[var(--ui-space-6)] py-[var(--ui-space-3)] text-[length:var(--ui-text-small)] font-medium text-foreground shadow-[var(--ui-shadow-sm)] transition hover:bg-muted sm:text-[length:var(--ui-text-body)] ${focusRing}`,
  outlineSubtle:
    `inline-flex min-h-12 items-center justify-center rounded-[var(--ui-radius-pill)] border border-border bg-card px-[var(--ui-space-6)] py-[var(--ui-space-3)] text-[length:var(--ui-text-small)] font-medium text-foreground shadow-[var(--ui-shadow-sm)] transition hover:bg-muted ${focusRing}`,
  nav:
    `inline-flex min-h-11 items-center rounded-[var(--ui-radius-pill)] border border-border bg-card px-[var(--ui-space-4)] py-[var(--ui-space-2)] text-[length:var(--ui-text-small)] font-medium text-foreground transition hover:bg-muted ${focusRing}`,
  navCompact:
    `inline-flex min-h-11 items-center rounded-[var(--ui-radius-pill)] border border-border bg-card px-[var(--ui-space-3)] py-[var(--ui-space-2)] text-[length:var(--ui-text-caption)] font-medium text-foreground transition hover:bg-muted sm:text-[length:var(--ui-text-small)] ${focusRing}`,
  onDark:
    "inline-flex min-h-12 items-center justify-center rounded-[var(--ui-radius-pill)] border border-white/35 bg-white/10 px-[var(--ui-space-7)] text-[length:var(--ui-text-body)] font-medium text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--navy-to)]",
} as const;
