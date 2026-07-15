import Image from "next/image";
import { BRAND_ASSET_VERSION } from "@/lib/brandAssetVersion";
import { cn } from "@/lib/utils";

export const SHALEAN_LOGO_WIDTH = 709;
export const SHALEAN_LOGO_HEIGHT = 204;

/** Canonical brand mark — same PNG for header, footer, and all product surfaces. */
export const SHALEAN_LOGO_SRC = `/images/shalean-logo.png?v=${BRAND_ASSET_VERSION}`;

type ShaleanNavLogoProps = {
  /** Display box, e.g. `h-8 w-auto sm:h-10` */
  className?: string;
  /** Pixel height passed to `next/image` (keep ≥ rendered height for sharpness) */
  intrinsicHeight?: number;
  /** LCP hint — enable only when the wordmark is above-the-fold on the route. */
  priority?: boolean;
};

/**
 * Canonical Shalean wordmark (`public/images/shalean-logo.png`).
 * One asset for the whole platform — on dark surfaces, place on a light plate (see FooterSection).
 */
export function ShaleanNavLogo({
  className,
  intrinsicHeight = 204,
  priority = false,
}: ShaleanNavLogoProps) {
  const intrinsicWidth = Math.round(intrinsicHeight * (SHALEAN_LOGO_WIDTH / SHALEAN_LOGO_HEIGHT));

  return (
    <Image
      key={BRAND_ASSET_VERSION}
      src={SHALEAN_LOGO_SRC}
      alt="Shalean Cleaning Services"
      width={intrinsicWidth}
      height={intrinsicHeight}
      className={cn("object-contain object-left min-w-0 max-w-full", className)}
      sizes="(max-width: 640px) 140px, 200px"
      priority={priority}
    />
  );
}
