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
   * `onDark` — white silhouette for navy/dark surfaces (footer, dark CTAs).
   * Prefer this over ad-hoc `brightness-0 invert` on consumers.
   */
  variant?: "default" | "onDark";
};

/**
 * Full wordmark (`public/images/shalean-logo.png`). Transparent PNG; use `h-* w-auto` in `className`.
 */
export function ShaleanNavLogo({
  className,
  intrinsicHeight = 204,
  priority = false,
  variant = "default",
}: ShaleanNavLogoProps) {
  const intrinsicWidth = Math.round(intrinsicHeight * (SHALEAN_LOGO_WIDTH / SHALEAN_LOGO_HEIGHT));

  return (
    <Image
      key={BRAND_ASSET_VERSION}
      src={`/images/shalean-logo.png?v=${BRAND_ASSET_VERSION}`}
      alt="Shalean Cleaning Services"
      width={intrinsicWidth}
      height={intrinsicHeight}
      className={cn(
        "object-contain object-left min-w-0 max-w-full",
        variant === "onDark" && "brightness-0 invert",
        className,
      )}
      sizes="(max-width: 640px) 140px, 200px"
      priority={priority}
    />
  );
}
