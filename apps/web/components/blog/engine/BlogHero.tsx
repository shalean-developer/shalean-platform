"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

function isRemoteSrc(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}

type Props = {
  src: string;
  alt: string;
  /** Subtle bottom gradient for brand tone (Shalean blue). */
  overlay?: boolean;
  /** Above-the-fold hero → eager LCP load. Defaults to true since this renders at the top of the article. */
  priority?: boolean;
  className?: string;
};

export function BlogHero({ src, alt, overlay = true, priority = true, className }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  // The legacy 1×1 asset is a placeholder, not article photography.
  if (!src.trim() || /(?:^|\/)default-cleaning\.jpg(?:[?#]|$)/.test(src) || failedSrc === src) return null;
  const remote = isRemoteSrc(src);

  return (
    <div
      className={cn(
        "relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-zinc-100",
        className,
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        sizes="(max-width: 1024px) 100vw, min(896px, 70vw)"
        priority={priority}
        onError={() => setFailedSrc(src)}
        onLoad={event => { if (event.currentTarget.naturalWidth < 320 || event.currentTarget.naturalHeight < 180) setFailedSrc(src); }}
        fetchPriority={priority ? "high" : "auto"}
        {...(remote ? { unoptimized: true } : {})}
      />
      {overlay ? (
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-blue-950/35 via-transparent to-zinc-900/10"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
