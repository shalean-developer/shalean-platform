/**
 * Short intent labels for cluster related-guides (footer). Unknown slugs fall back to "Guide".
 * Extend as new governed URLs ship.
 */
const SLUG_TO_INTENT: Record<string, string> = {
  "deep-vs-standard-cleaning-which-to-book-cape-town": "Decision",
  "whats-included-in-deep-cleaning-cape-town": "Scope",
  "same-day-cleaning-cape-town": "Urgency",
  "how-long-does-house-cleaning-take-cape-town": "Timing",
  "once-off-vs-recurring-cleaning-cape-town": "Maintenance",
  "how-to-prepare-home-before-cleaner-arrives-cape-town": "Preparation",
  "what-does-professional-cleaner-do-cape-town": "Scope",
  "how-often-book-home-cleaning-cape-town": "Maintenance",
  "how-often-deep-clean-home-cape-town": "Maintenance",
  "what-professional-cleaners-can-and-cannot-do-cape-town": "Expectations",
  "why-home-still-feels-dirty-after-cleaning-cape-town": "Psychology",
  "move-out-cleaning-checklist-cape-town-tenants": "Checklist",
  "how-often-should-you-deep-clean-your-home-cape-town": "Cadence",
};

export function intentLabelForClusterGuideSlug(slug: string): string {
  const key = slug.trim().toLowerCase();
  return SLUG_TO_INTENT[key] ?? "Guide";
}
