/** Shalean social creative design tokens. */

export const SHALEAN_CAMPAIGN_PRIMARY = "#0B1F4A";
export const SHALEAN_CAMPAIGN_ACCENT = "#2563EB";
export const SHALEAN_CAMPAIGN_ACCENT_SOFT = "#60A5FA";
export const SHALEAN_CAMPAIGN_SKY = "#93C5FD";
export const SHALEAN_CAMPAIGN_WHITE = "#FFFFFF";
export const SHALEAN_CAMPAIGN_SLATE = "#E2E8F0";
export const SHALEAN_CAMPAIGN_STAR = "#FBBF24";

export const SOCIAL_FONT_STACK =
  '"Avenir Next", "Segoe UI", "Helvetica Neue", Helvetica, Arial, ui-sans-serif, system-ui, sans-serif';

export const SOCIAL_MONO_STACK =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const DEFAULT_TRUST_ITEMS = [
  { icon: "★" as const, label: "4.9 Rating" },
  { icon: "✓" as const, label: "Fully Insured" },
  { icon: "✓" as const, label: "Background Checked" },
];

export const DEFAULT_BENEFITS = [
  "Trusted Cleaners",
  "Fully Insured",
  "Easy Online Booking",
];

export function isLegacyGreenAccent(color: string | undefined): boolean {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  return c === "#059669" || c === "#34d399" || c === "#10b981" || c === "#047857";
}

export function resolveBrandColors(primary?: string, accent?: string) {
  const navy = isLegacyGreenAccent(primary)
    ? SHALEAN_CAMPAIGN_PRIMARY
    : primary?.trim() || SHALEAN_CAMPAIGN_PRIMARY;
  const blue = isLegacyGreenAccent(accent)
    ? SHALEAN_CAMPAIGN_ACCENT
    : accent?.trim() || SHALEAN_CAMPAIGN_ACCENT;
  return { navy, blue };
}

/** Scale headline/offer type when copy is long to prevent overflow. */
export function scaleType(base: number, text: string, softAt = 14, hardAt = 22): number {
  const len = text.trim().length;
  if (len > hardAt) return Math.round(base * 0.7);
  if (len > softAt) return Math.round(base * 0.84);
  return base;
}

/** Normalize CTA copy; the button component adds its own arrow. */
export function formatCtaLabel(cta: string | null | undefined): string {
  const raw = (cta || "Book Now").trim().replace(/\s*(→|->|›)\s*$/u, "");
  return raw || "Book Now";
}

export function displayWebsite(landing?: string | null): string {
  if (!landing) return "shalean.co.za";
  try {
    return new URL(landing).hostname.replace(/^www\./, "");
  } catch {
    return "shalean.co.za";
  }
}

export function formatExpiryLabel(endsAt?: string | null): string | null {
  if (!endsAt) return null;
  const d = new Date(endsAt);
  if (Number.isNaN(d.getTime())) return null;
  return `Ends ${d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`;
}
