/**
 * Canonical primary public-marketing CTA.
 * Mirrors the redesigned homepage: Shalean Primary, Ink text, pill radius,
 * tokenized spacing/shadows and accessible focus treatment.
 */
export const marketingPrimaryCtaClassName =
  "inline-flex min-h-12 items-center justify-center rounded-[var(--ui-radius-pill)] bg-primary px-[var(--ui-space-6)] py-[var(--ui-space-3)] text-[length:var(--ui-text-body)] font-medium text-primary-foreground shadow-[var(--ui-shadow-md)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Canonical secondary public-marketing CTA. */
export const marketingSecondaryCtaClassName =
  "inline-flex min-h-12 items-center justify-center rounded-[var(--ui-radius-pill)] border border-border bg-card px-[var(--ui-space-6)] py-[var(--ui-space-3)] text-[length:var(--ui-text-body)] font-medium text-foreground shadow-[var(--ui-shadow-sm)] transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Icon-only companion to the primary CTA (same palette and focus behavior). */
export const marketingPrimaryCtaIconClassName =
  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground shadow-[var(--ui-shadow-sm)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
