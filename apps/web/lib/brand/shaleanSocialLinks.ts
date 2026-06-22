import { customerSupportWhatsAppHref } from "@/lib/site/customerSupport";
export type ShaleanSocialLink = {
  id: "facebook" | "instagram" | "whatsapp";
  label: string;
  href: string;
  /** Fallback letter/symbol when images are blocked. */
  fallbackGlyph: string;
  brandColor: string;
};

/** Canonical social profiles (WhatsApp uses 082 591 5525, not the call line). */
export const SHALEAN_SOCIAL_LINKS: readonly ShaleanSocialLink[] = [
  {
    id: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/shaleancleaning/",
    fallbackGlyph: "f",
    brandColor: "#1877F2",
  },
  {
    id: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/shalean_cleaning_services",
    fallbackGlyph: "ig",
    brandColor: "#E4405F",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    href: customerSupportWhatsAppHref(),
    fallbackGlyph: "wa",
    brandColor: "#25D366",
  },
] as const;
