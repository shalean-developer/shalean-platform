import Image from "next/image";
import { BRAND_ASSET_VERSION } from "@/lib/brandAssetVersion";
import { cn } from "@/lib/utils";

export const SHALEAN_LOGO_WIDTH = 709;
export const SHALEAN_LOGO_HEIGHT = 204;

type ShaleanNavLogoProps = {
  /** Display box, e.g. `h-8 w-auto sm:h-10` */
  className?: string;
  /** Pixel height passed to `next/image` (keep ≥ rendered height for sharpness) */
  intrinsicHeight?: number;
  /** LCP hint — enable only when the wordmark is above-the-fold on the route. */
  priority?: boolean;
  /**
   * `onDark` — white wordmark for navy/dark surfaces (footer, dark CTAs).
   * Uses dedicated SVG when available; falls back to inverted PNG.
   */
  variant?: "default" | "onDark";
};

/**
 * Full wordmark (`public/images/shalean-logo.png` or on-dark SVG). Transparent; use `h-* w-auto` in `className`.
 */
export function ShaleanNavLogo({
  className,
  intrinsicHeight = 204,
  priority = false,
  variant = "default",
}: ShaleanNavLogoProps) {
  const intrinsicWidth = Math.round(intrinsicHeight * (SHALEAN_LOGO_WIDTH / SHALEAN_LOGO_HEIGHT));
  const onDarkSrc = `/images/shalean-logo-on-dark.svg?v=${BRAND_ASSET_VERSION}`;
  const defaultSrc = `/images/shalean-logo.png?v=${BRAND_ASSET_VERSION}`;

  if (variant === "onDark") {
    return (
      <Image
        key={`${BRAND_ASSET_VERSION}-on-dark`}
        src={onDarkSrc}
        alt="Shalean Cleaning Services"
        width={intrinsicWidth}
        height={intrinsicHeight}
        unoptimized
        className={cn("object-contain object-left min-w-0 max-w-full", className)}
        sizes="(max-width: 640px) 140px, 200px"
        priority={priority}
      />
    );
  }

  return (
    <Image
      key={BRAND_ASSET_VERSION}
      src={defaultSrc}
      alt="Shalean Cleaning Services"
      width={intrinsicWidth}
      height={intrinsicHeight}
      className={cn("object-contain object-left min-w-0 max-w-full", className)}
      sizes="(max-width: 640px) 140px, 200px"
      priority={priority}
    />
  );
}
