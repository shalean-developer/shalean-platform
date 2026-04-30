import Image from "next/image";
import { BRAND_ASSET_VERSION } from "@/lib/brandAssetVersion";
import { cn } from "@/lib/utils";

type ShaleanNavLogoProps = {
  /** Display box, e.g. `h-9 w-9 sm:h-10 sm:w-10` */
  className?: string;
  /** `width` / `height` on `next/image` (keep ≥ display size for sharpness) */
  intrinsicSize?: number;
};

/**
 * Asset is processed to true transparency outside the blue disc (`process-shalean-logo.mjs`).
 * `object-contain` keeps the full mark without cropping.
 */
export function ShaleanNavLogo({ className, intrinsicSize = 128 }: ShaleanNavLogoProps) {
  return (
    <Image
      key={BRAND_ASSET_VERSION}
      src={`/images/shalean-logo.png?v=${BRAND_ASSET_VERSION}`}
      alt=""
      width={intrinsicSize}
      height={intrinsicSize}
      className={cn(
        "aspect-square shrink-0 rounded-lg object-contain object-center",
        className,
      )}
      sizes="96px"
      priority
    />
  );
}
